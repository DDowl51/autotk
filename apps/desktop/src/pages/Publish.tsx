import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Table, Tag, Space, Segmented, Input, Alert, DatePicker, message, type TableColumnsType } from "antd";
import { FolderOpenOutlined, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { PublishSource, PublishTask } from "@mc/shared";
import { useHub } from "../hubState";
import { loadSettings, saveSettings } from "../settings";
import { getPublisherApi, type DevicePlan, type PublishPlanItem } from "../publish-ipc";
import { publishRows, isPublishDone, type RowStatus } from "../publishState";
import { PageHeader, SectionCard, Mono, EmptyHint, RoadmapCard } from "../ui";
import { C } from "../theme";

const SCHEDULE = { allDay: true, taskWindows: [] as Array<{ start: string; end: string }>, jitterSec: 1800 };
const hhmm = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
const STATUS_TAG: Record<RowStatus, { color: string; label: string }> = {
  queued: { color: "default", label: "排队中" },
  scheduled: { color: "processing", label: "待发" },
  sent: { color: "processing", label: "已下发" },
  downloading: { color: "processing", label: "下载中" },
  downloaded: { color: "processing", label: "已入相册" },
  publishing: { color: "processing", label: "发布中" },
  published: { color: "success", label: "已发布" },
  failed: { color: "error", label: "失败" },
  offline: { color: "default", label: "离线" },
  timeout: { color: "warning", label: "超时" },
};

export function Publish() {
  const api = useMemo(() => getPublisherApi(), []);
  const { devices, publishTasks, enqueuePublish, connected } = useHub();
  const [root, setRoot] = useState(() => loadSettings().videoRoot);
  const [plans, setPlans] = useState<DevicePlan[]>([]);
  // 发送时机：立即 or 定时（定时用 `at`，Hub 到点再下发）。
  const [when, setWhen] = useState<"now" | "scheduled">("now");
  const [at, setAt] = useState<Dayjs | null>(null);
  const [busy, setBusy] = useState(false);
  const markedRef = useRef<Set<string>>(new Set());

  const deviceByName = useMemo(() => new Map(devices.map((d) => [d.deviceName, d])), [devices]);

  async function refresh() {
    if (!api || !root) return;
    setBusy(true);
    try {
      setPlans(await api.refresh({ rootDir: root, schedule: SCHEDULE }));
    } catch (e) {
      message.error(`扫描失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function chooseRoot() {
    if (!api) return;
    const dir = await api.chooseRoot();
    if (dir) {
      setRoot(dir);
      saveSettings({ videoRoot: dir });
    }
  }

  useEffect(() => {
    if (api && root) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 发布成功 → 登记已发清单（去重）+ 刷新计划。
  useEffect(() => {
    if (!api) return;
    for (const row of publishTasks.values()) {
      if (row.status === "published" && !markedRef.current.has(row.taskId)) {
        markedRef.current.add(row.taskId);
        void api
          .markPublished({ deviceName: row.deviceName, fileName: row.fileName })
          .then(() => refresh())
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishTasks]);

  /** 定时模式下解析目标时刻；未选/已过则返回 "invalid"（调用方拦下并提示）。 */
  function resolveScheduledAt(): number | undefined | "invalid" {
    if (when !== "scheduled") return undefined;
    if (!at || at.valueOf() <= Date.now()) return "invalid";
    return at.valueOf();
  }

  async function publishOne(deviceName: string, item: PublishPlanItem, scheduledAtMs?: number) {
    const dev = deviceByName.get(deviceName);
    if (!dev || !dev.online) {
      message.warning(`「${deviceName}」当前不在线，无法发布`);
      return;
    }
    if (!api) return;
    try {
      const source: PublishSource = await api.prepareSource({
        deviceName,
        fileName: item.fileName,
        mode: "lan", // 只走局域网直传（手机机房与电脑同网）；跨网中转能力保留但不从界面暴露
        hubBase: undefined,
      });
      const task: PublishTask = {
        taskId: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        deviceId: dev.deviceId,
        videoName: item.fileName,
        caption: item.caption,
        source,
        scheduledAtMs,
      };
      enqueuePublish(task, deviceName, item.fileName);
      message.success(
        scheduledAtMs
          ? `已定时：${item.fileName} → ${deviceName}（${hhmm(scheduledAtMs)} 发送）`
          : `已发起：${item.fileName} → ${deviceName}`,
      );
    } catch (e) {
      message.error(`发布失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function publishAll(plan: DevicePlan) {
    const sched = resolveScheduledAt();
    if (sched === "invalid") {
      message.warning("请先选择一个将来的发送时间");
      return;
    }
    for (const item of plan.pending) await publishOne(plan.deviceName, item, sched);
  }

  if (!api) {
    return (
      <>
        <PageHeader title="发布" subtitle="文件夹工作流：把视频自动发到各设备的 TikTok" />
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="此功能需在桌面应用内使用"
          description="当前是浏览器/开发预览，无法访问本地文件夹与局域网服务。请在 Electron 桌面应用中打开。"
        />
        <RoadmapCard
          title="文件夹工作流发视频"
          phase="阶段 3"
          points={[
            "在根目录下按设备名建子文件夹，丢入当天要发的视频（mp4/mov/m4v）",
            "文案：同名 .txt > captions.txt 映射 > 文件名；自动去重（发过不再发）",
            "同局域网直传、跨网经 Hub 中转；逐步进度回传（下载→入相册→发布）",
          ]}
        />
      </>
    );
  }

  const rows = publishRows(publishTasks);

  return (
    <>
      <PageHeader title="发布" subtitle="把根目录各设备子文件夹里的视频发到对应手机的 TikTok" />

      <SectionCard title="视频根目录">
        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            onBlur={() => saveSettings({ videoRoot: root })}
            placeholder="选择放视频的根目录（每个子文件夹名 = 设备名）"
            prefix={<FolderOpenOutlined style={{ color: C.faint }} />}
          />
          <Button icon={<FolderOpenOutlined />} onClick={chooseRoot}>
            选择
          </Button>
          <Button type="primary" icon={<ReloadOutlined />} loading={busy} onClick={refresh} disabled={!root}>
            扫描
          </Button>
        </Space.Compact>
        {!connected && (
          <div style={{ marginTop: 12 }}>
            <Tag color="warning">未连接 Hub，无法下发</Tag>
          </div>
        )}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.dim, fontSize: 13 }}>发送时机</span>
          <Segmented
            value={when}
            onChange={(v) => setWhen(v as "now" | "scheduled")}
            options={[
              { label: "立即发送", value: "now" },
              { label: "定时发送", value: "scheduled" },
            ]}
          />
          {when === "scheduled" && (
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="YYYY-MM-DD HH:mm"
              value={at}
              onChange={setAt}
              placeholder="选择发送时间"
              disabledDate={(d) => !!d && d.isBefore(dayjs().startOf("day"))}
            />
          )}
          {when === "scheduled" && (
            <span style={{ color: C.faint, fontSize: 12 }}>到点由电脑自动发送，电脑需保持开启</span>
          )}
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      {plans.length === 0 ? (
        <SectionCard>
          <EmptyHint
            title={root ? "该目录下没有视频" : "尚未选择根目录"}
            lines={[
              "在根目录下按「设备名」建子文件夹，把视频放进去，再点「扫描」",
              "手机端首次连上会自动建好对应子文件夹",
            ]}
          />
        </SectionCard>
      ) : (
        plans.map((plan) => {
          const dev = deviceByName.get(plan.deviceName);
          const online = !!dev?.online;
          const cols: TableColumnsType<PublishPlanItem> = [
            { title: "文件", dataIndex: "fileName", render: (v: string) => <Mono>{v}</Mono> },
            { title: "文案", dataIndex: "caption", ellipsis: true },
            { title: "计划", dataIndex: "scheduledAt", width: 70, render: (t: number) => <Mono>{hhmm(t)}</Mono> },
            {
              title: "操作",
              width: 96,
              render: (_v, item) => (
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  disabled={!online || !connected}
                  onClick={() => {
                    const sched = resolveScheduledAt();
                    if (sched === "invalid") {
                      message.warning("请先选择一个将来的发送时间");
                      return;
                    }
                    void publishOne(plan.deviceName, item, sched);
                  }}
                >
                  {when === "scheduled" ? "定时" : "发布"}
                </Button>
              ),
            },
          ];
          return (
            <div key={plan.deviceName} style={{ marginBottom: 16 }}>
              <SectionCard
                title={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <Mono>{plan.deviceName}</Mono>
                    <span className={`dot ${online ? "online" : "offline"}`} />
                    <span style={{ color: C.faint, fontSize: 12 }}>
                      待发 {plan.pending.length} · 已发 {plan.publishedCount}
                    </span>
                  </span>
                }
                extra={
                  <Button
                    type="primary"
                    size="small"
                    icon={<SendOutlined />}
                    disabled={!online || !connected || plan.pending.length === 0}
                    onClick={() => publishAll(plan)}
                  >
                    全部发布（{plan.pending.length}）
                  </Button>
                }
              >
                {plan.pending.length === 0 ? (
                  <div style={{ color: C.faint, fontSize: 13 }}>没有待发视频（都发过了）</div>
                ) : (
                  <Table rowKey="absPath" size="small" dataSource={plan.pending} columns={cols} pagination={false} />
                )}
              </SectionCard>
            </div>
          );
        })
      )}

      {rows.length > 0 && (
        <SectionCard title="发布进度">
          <Table
            rowKey="taskId"
            size="small"
            dataSource={rows}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            columns={[
              { title: "设备", dataIndex: "deviceName", render: (v: string) => <Mono>{v}</Mono> },
              { title: "视频", dataIndex: "videoName", render: (v: string) => <Mono>{v}</Mono> },
              {
                title: "状态",
                dataIndex: "status",
                render: (s: RowStatus) => <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].label}</Tag>,
              },
              {
                title: "说明",
                dataIndex: "error",
                render: (e: string | undefined, r) =>
                  e ? <span style={{ color: "#fca5a5" }}>{e}</span> : isPublishDone(r.status) ? "—" : "进行中…",
              },
            ]}
          />
        </SectionCard>
      )}
    </>
  );
}
