import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Table, Tag, Space, Input, Alert, DatePicker, Tooltip, message, type TableColumnsType } from "antd";
import { FolderOpenOutlined, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { PublishSource, PublishTask } from "@mc/shared";
import { useHub } from "../hubState";
import { loadSettings, saveSettings } from "../settings";
import { getPublisherApi, type DevicePlan, type PublishPlanItem } from "../publish-ipc";
import { publishRows, isPublishDone, type RowStatus } from "../publishState";
import { spreadTimesFor, initTimes } from "../publishSchedule";
import { PageHeader, SectionCard, Mono, EmptyHint, RoadmapCard } from "../ui";
import { humanizeError } from "../errors";
import { C } from "../theme";

const SCHEDULE = { allDay: true, taskWindows: [] as Array<{ start: string; end: string }>, jitterSec: 1800 };
const hhmm = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
const STATUS_TAG: Record<RowStatus, { color: string; label: string; help: string }> = {
  queued: { color: "default", label: "排队中", help: "在队列里等待，稍后自动处理，不用操作。" },
  scheduled: { color: "processing", label: "待发", help: "已排期，到设定时间自动发送（本电脑需保持开启）。" },
  sent: { color: "processing", label: "已下发", help: "已发送到手机，手机正在准备下载。" },
  downloading: { color: "processing", label: "下载中", help: "手机正在下载视频。" },
  downloaded: { color: "processing", label: "已入相册", help: "视频已存进手机相册，即将发布。" },
  publishing: { color: "processing", label: "发布中", help: "手机正在 TikTok 里发布。" },
  published: { color: "success", label: "已发布", help: "发布成功。" },
  failed: { color: "error", label: "失败", help: "发布失败。看「说明」列的原因，检查手机后可点「发布」重试。" },
  offline: { color: "default", label: "离线", help: "手机当前不在线，等它上线后重试。" },
  timeout: { color: "warning", label: "超时", help: "长时间没响应，手机可能离线或卡住，可重试。" },
};

export function Publish() {
  const api = useMemo(() => getPublisherApi(), []);
  const { devices, publishTasks, enqueuePublish, connected } = useHub();
  const [root, setRoot] = useState(() => loadSettings().videoRoot);
  const [plans, setPlans] = useState<DevicePlan[]>([]);
  // 每条视频各自的发送时间（键=absPath）：null/缺省＝立即发送；有值＝到点由本电脑自动下发。
  const [times, setTimes] = useState<Record<string, Dayjs | null>>({});
  const [busy, setBusy] = useState(false);
  const markedRef = useRef<Set<string>>(new Set());

  const deviceByName = useMemo(() => new Map(devices.map((d) => [d.deviceName, d])), [devices]);

  // 重名设备：按「名=文件夹」匹配时，同名的只会有一台收到视频、其余静默漏发 → 醒目提示去改名。
  const dupNames = useMemo(() => {
    const count = new Map<string, number>();
    for (const d of devices) count.set(d.deviceName, (count.get(d.deviceName) ?? 0) + 1);
    return [...count.entries()].filter(([, n]) => n > 1).map(([name]) => name);
  }, [devices]);

  async function refresh() {
    if (!api || !root) return;
    setBusy(true);
    try {
      // 传当前设备名 → 主进程自动建好各设备子文件夹（买家不用手动创建）。
      const next = await api.refresh({ rootDir: root, schedule: SCHEDULE, deviceNames: devices.map((d) => d.deviceName) });
      setPlans(next);
      setTimes((prev) => initTimes(next, prev)); // 新视频填错峰建议，已改过的沿用
    } catch (e) {
      message.error(humanizeError(e, "scan"));
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

  // 发布成功 → 刷新计划把已发的移出待发列表。
  // 注意：已发去重的**登记**已移到服务端（Hub 的 published 回报驱动 main 进程 markPublished），
  // 不再由这里写——否则桌面缺席/重启时漏记会重复发，且渲染层与服务端并发写同一 manifest 会丢更新。
  // 手机对同一设备串行发布，服务端登记天然无并发竞争。这里只负责刷新 UI。
  useEffect(() => {
    if (!api) return;
    for (const row of publishTasks.values()) {
      if (row.status === "published" && !markedRef.current.has(row.taskId)) {
        markedRef.current.add(row.taskId);
        void refresh(); // 服务端已/即将登记去重，稍后一刷新即从待发移除
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishTasks]);

  /** 解析某条视频的发送时刻：无值＝立即（undefined）；已过＝"invalid"（调用方拦下提示）；否则返回目标 ms。 */
  function resolveRowAt(absPath: string): number | undefined | "invalid" {
    const t = times[absPath];
    if (!t) return undefined;
    if (t.valueOf() <= Date.now()) return "invalid";
    return t.valueOf();
  }

  /** 把某设备所有待发视频重置为错峰建议时间（相对当前时刻重新铺开）。 */
  function fillSpread(plan: DevicePlan) {
    setTimes((m) => ({ ...m, ...spreadTimesFor(plan.pending) }));
  }

  /** 清空某设备所有待发视频的发送时间（＝改为立即发送）。 */
  function clearTimes(plan: DevicePlan) {
    setTimes((m) => {
      const next = { ...m };
      for (const it of plan.pending) next[it.absPath] = null;
      return next;
    });
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
      message.error(humanizeError(e, "publish"));
    }
  }

  async function publishAll(plan: DevicePlan) {
    let past = 0;
    for (const item of plan.pending) {
      const sched = resolveRowAt(item.absPath);
      if (sched === "invalid") {
        past++; // 时间已过的先跳过，避免误当立即发出
        continue;
      }
      await publishOne(plan.deviceName, item, sched);
    }
    if (past > 0) {
      message.warning(`有 ${past} 条视频的发送时间已过，已跳过；请改时间或点「全部立即」后重试`);
    }
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

      {dupNames.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="检测到重名设备，请先在「设备」页给它们改成不同的名字"
          description={`有多台设备叫「${dupNames.join("、")}」。发布按「设备名＝文件夹名」匹配，重名会导致视频只发到其中一台、其余漏发。改名后视频文件夹会一并更名。`}
        />
      )}

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
        <div style={{ marginTop: 12, color: C.faint, fontSize: 12, lineHeight: 1.7 }}>
          每条视频可<b style={{ color: C.dim }}>单独设置发送时间</b>：<b style={{ color: C.dim }}>留空＝立即发送</b>；填了时间＝到点由本电脑自动发送（电脑需保持开启）。扫描后已按错峰规则自动填好，可逐条修改。
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      {plans.length === 0 ? (
        <SectionCard>
          <EmptyHint
            title={root ? "该目录下没有视频" : "尚未选择根目录"}
            lines={[
              "点「扫描」会自动为当前在线设备建好各自的子文件夹",
              "把视频（mp4/mov/m4v）放进对应设备的子文件夹，再点「扫描」即可看到待发列表",
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
            {
              title: "发送时间",
              width: 178,
              render: (_v, item) => (
                <DatePicker
                  size="small"
                  showTime={{ format: "HH:mm" }}
                  format="MM-DD HH:mm"
                  value={times[item.absPath] ?? null}
                  onChange={(d) => setTimes((m) => ({ ...m, [item.absPath]: d }))}
                  placeholder="立即发送"
                  disabledDate={(d) => !!d && d.isBefore(dayjs().startOf("day"))}
                  style={{ width: 158 }}
                />
              ),
            },
            {
              title: "操作",
              width: 96,
              render: (_v, item) => {
                const scheduled = !!times[item.absPath];
                return (
                  <Button
                    size="small"
                    icon={<SendOutlined />}
                    disabled={!online || !connected}
                    onClick={() => {
                      const sched = resolveRowAt(item.absPath);
                      if (sched === "invalid") {
                        message.warning("该视频的发送时间已过，请改时间或清空为「立即发送」");
                        return;
                      }
                      void publishOne(plan.deviceName, item, sched);
                    }}
                  >
                    {scheduled ? "定时" : "发布"}
                  </Button>
                );
              },
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
                  <Space size={8}>
                    <Tooltip title="按错峰规则重新为本设备每条视频填入发送时间（相对现在）">
                      <Button size="small" disabled={plan.pending.length === 0} onClick={() => fillSpread(plan)}>
                        错峰时间
                      </Button>
                    </Tooltip>
                    <Tooltip title="清空本设备所有视频的发送时间，改为立即发送">
                      <Button size="small" disabled={plan.pending.length === 0} onClick={() => clearTimes(plan)}>
                        全部立即
                      </Button>
                    </Tooltip>
                    <Button
                      type="primary"
                      size="small"
                      icon={<SendOutlined />}
                      disabled={!online || !connected || plan.pending.length === 0}
                      onClick={() => publishAll(plan)}
                    >
                      全部发布（{plan.pending.length}）
                    </Button>
                  </Space>
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
                render: (s: RowStatus) => (
                  <Tooltip title={STATUS_TAG[s].help}>
                    <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].label}</Tag>
                  </Tooltip>
                ),
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
