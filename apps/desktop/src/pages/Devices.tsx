import { useEffect, useMemo, useState } from "react";
import { Table, Drawer, Descriptions, Input, Select, Space, Button, Divider, Typography, Popconfirm, message, type TableColumnsType } from "antd";
import { SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { moduleLabel, pageLabel, type ConfigPatch, type DeviceInfo, type DeviceBattery } from "@mc/shared";
import { useHub } from "../hubState";

type WorkflowValue = NonNullable<ConfigPatch["activeWorkflow"]>;
const WORKFLOW_OPTIONS: { value: WorkflowValue; label: string }[] = [
  { value: "search", label: "搜索互动" },
  { value: "followMonitor", label: "关注监控" },
  { value: "profileAndDM", label: "主页+私信" },
  { value: "off", label: "停（不跑）" },
];
const wfLabel = (v: WorkflowValue) => WORKFLOW_OPTIONS.find((o) => o.value === v)?.label ?? v;
import { statusKind, filterDevices, batteryTone, STATUS_LABEL, type StatusKind } from "../devices";
import { renamesFor } from "../renameHistory";
import { PageHeader, StatusDot, Mono, EmptyHint, LogPanel } from "../ui";
import { C } from "../theme";
import { BatchConfigModal } from "./BatchConfigModal";

/** 电量单元格：读不到显示「—」；否则按电量高低着色，充电加 ⚡。 */
function BatteryCell({ battery }: { battery?: DeviceBattery }) {
  if (!battery) return <>—</>;
  const tone = batteryTone(battery.level);
  const color = tone === "danger" ? "#f87171" : tone === "warn" ? "#fbbf24" : "#4ade80";
  return (
    <span style={{ color }}>
      {battery.level}%{battery.charging ? " ⚡" : ""}
    </span>
  );
}

export function Devices({ goGuide }: { goGuide: () => void }) {
  const { devices, connected, stalledMs, logsOf, watch, renameDevice, removeDevice, renameHistory, pushConfig, control } = useHub();
  const [sel, setSel] = useState<DeviceInfo | null>(null);
  const [wfSel, setWfSel] = useState<Record<string, WorkflowValue>>({}); // 本地记住每台设过的工作流(activeWorkflow 不在 status 里)

  const setWorkflow = (r: DeviceInfo, v: WorkflowValue) => {
    setWfSel((m) => ({ ...m, [r.deviceId]: v }));
    pushConfig([{ deviceId: r.deviceId, deviceName: r.deviceName }], { activeWorkflow: v });
    message.success(`${r.deviceName}：切到「${wfLabel(v)}」`);
  };

  // 打开详情 → 订阅该台日志（手机切快频）；关闭/切换 → 取消订阅。
  const selId = sel?.deviceId;
  useEffect(() => {
    if (!selId) return;
    watch(selId, true);
    return () => watch(selId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusKind | undefined>(undefined);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);

  const selectedDevices = useMemo(
    () => devices.filter((d) => selectedKeys.includes(d.deviceId)),
    [devices, selectedKeys],
  );

  const now = Date.now();
  const kindOf = (d: DeviceInfo) => statusKind(d, { now, stalledMs });
  const rows = filterDevices(devices, { q, status }, { now, stalledMs });
  const selected = sel ? devices.find((d) => d.deviceId === sel.deviceId) ?? sel : null;

  const columns: TableColumnsType<DeviceInfo> = [
    {
      title: "设备",
      dataIndex: "deviceName",
      sorter: (a, b) => a.deviceName.localeCompare(b.deviceName),
      render: (v: string) => <Mono>{v}</Mono>,
    },
    { title: "状态", render: (_v, r) => <StatusDot kind={kindOf(r)} /> },
    {
      title: "工作流",
      width: 130,
      render: (_v, r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            size="small"
            style={{ width: 116 }}
            placeholder="选工作流"
            value={wfSel[r.deviceId]}
            options={WORKFLOW_OPTIONS}
            onChange={(v) => setWorkflow(r, v)}
          />
        </div>
      ),
    },
    {
      title: "启停",
      width: 84,
      render: (_v, r) => {
        const running = !!r.status?.running;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {running ? (
              <Button size="small" onClick={() => control([r.deviceId], "pause")}>
                停止
              </Button>
            ) : (
              <Button size="small" type="primary" ghost onClick={() => control([r.deviceId], "resume")}>
                启动
              </Button>
            )}
          </div>
        );
      },
    },
    { title: "模块", render: (_v, r) => moduleLabel(r.status?.module) },
    { title: "当前页面", render: (_v, r) => pageLabel(r.status?.page) },
    {
      title: "赞/关注/评论/视频",
      render: (_v, r) => {
        const s = r.status?.stats;
        return s ? <Mono>{`${s.likes}/${s.follows}/${s.comments}/${s.videos}`}</Mono> : "—";
      },
    },
    {
      title: "电量",
      width: 90,
      sorter: (a, b) => (a.status?.battery?.level ?? -1) - (b.status?.battery?.level ?? -1),
      render: (_v, r) => <BatteryCell battery={r.status?.battery} />,
    },
    {
      title: "最近在线",
      dataIndex: "lastSeen",
      sorter: (a, b) => a.lastSeen - b.lastSeen,
      render: (v: number) => (v ? new Date(v).toLocaleString() : "—"),
    },
  ];

  return (
    <>
      <PageHeader title="设备" subtitle={`共 ${devices.length} 台 · 点击行看详情`} />

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="按设备名搜索"
          style={{ width: 220 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          allowClear
          placeholder="全部状态"
          style={{ width: 150 }}
          value={status}
          onChange={setStatus}
          options={(["running", "stalled", "online", "alert", "offline"] as StatusKind[]).map((k) => ({
            value: k,
            label: STATUS_LABEL[k],
          }))}
        />
        <Button
          type="primary"
          icon={<SettingOutlined />}
          disabled={selectedDevices.length === 0}
          onClick={() => setBatchOpen(true)}
        >
          批量修改设置{selectedDevices.length > 0 ? `（${selectedDevices.length}）` : ""}
        </Button>
        {selectedDevices.length > 0 && (
          <>
            <Select
              placeholder={`批量设工作流（${selectedDevices.length}）`}
              style={{ width: 190 }}
              value={undefined}
              options={WORKFLOW_OPTIONS}
              onChange={(v: WorkflowValue) => {
                pushConfig(
                  selectedDevices.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName })),
                  { activeWorkflow: v },
                );
                message.success(`已给 ${selectedDevices.length} 台切「${wfLabel(v)}」`);
              }}
            />
            <Button onClick={() => control(selectedDevices.map((d) => d.deviceId), "resume")}>批量启动</Button>
            <Button onClick={() => control(selectedDevices.map((d) => d.deviceId), "pause")}>批量停止</Button>
          </>
        )}
      </Space>

      <Table
        rowKey="deviceId"
        dataSource={rows}
        columns={columns}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        onRow={(r) => ({ onClick: () => setSel(r), style: { cursor: "pointer" } })}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <EmptyHint
              title={connected ? "没有匹配的设备" : "未连接 Hub"}
              lines={["手机端激活后会自动出现在这里"]}
              actionText="使用说明"
              onAction={goGuide}
            />
          ),
        }}
      />

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={selected?.deviceName}
        width={560}
        extra={
          selected ? (
            <Popconfirm
              title="删除设备"
              description="删除后该设备从列表移除，手机重连会重新出现。"
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => {
                removeDevice(selected.deviceId);
                setSel(null);
              }}
            >
              <Button danger size="small">
                删除设备
              </Button>
            </Popconfirm>
          ) : null
        }
      >
        {selected && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="名称">
              <Typography.Text
                editable={{
                  tooltip: "改名（全网同步，并重命名视频文件夹）",
                  maxLength: 40,
                  onChange: (v) => {
                    const next = v.trim();
                    if (!next || next === selected.deviceName) return;
                    // 设备名不能重复：与其它设备（除自己）的当前名冲突则拒绝，不发 rename。
                    if (devices.some((d) => d.deviceId !== selected.deviceId && d.deviceName === next)) {
                      message.error(`已有设备叫「${next}」，换个名`);
                      return;
                    }
                    renameDevice(selected.deviceId, selected.deviceName, next);
                  },
                }}
                style={{ color: C.text }}
              >
                {selected.deviceName}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="设备 ID">
              <Mono>{selected.deviceId}</Mono>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <StatusDot kind={kindOf(selected)} />
            </Descriptions.Item>
            <Descriptions.Item label="版本">{selected.version ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="当前模块">{moduleLabel(selected.status?.module)}</Descriptions.Item>
            <Descriptions.Item label="当前页面">{pageLabel(selected.status?.page)}</Descriptions.Item>
            <Descriptions.Item label="点赞 / 关注 / 评论 / 视频">
              {selected.status?.stats
                ? `${selected.status.stats.likes} / ${selected.status.stats.follows} / ${selected.status.stats.comments} / ${selected.status.stats.videos}`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="电量">
              <BatteryCell battery={selected.status?.battery} />
              {selected.status?.battery?.charging ? "（充电中）" : ""}
            </Descriptions.Item>
            <Descriptions.Item label="告警">
              {selected.status?.alert ? <span style={{ color: "#fca5a5" }}>{selected.status.alert}</span> : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="最近在线">
              {selected.lastSeen ? new Date(selected.lastSeen).toLocaleString() : "—"}
            </Descriptions.Item>
          </Descriptions>
        )}
        {selected && renamesFor(renameHistory, selected.deviceId).length > 0 && (
          <>
            <Divider style={{ margin: "20px 0 12px" }} orientation="left" plain>
              <span style={{ color: C.faint, fontSize: 12 }}>改名记录</span>
            </Divider>
            <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
              {renamesFor(renameHistory, selected.deviceId).map((r, i) => (
                <div key={i} style={{ color: C.dim }}>
                  <span style={{ color: C.faint }}>{new Date(r.ts).toLocaleString()}　</span>
                  <Mono>{r.from}</Mono> → <Mono>{r.to}</Mono>
                </div>
              ))}
            </div>
          </>
        )}

        {selected && (
          <>
            <Divider style={{ margin: "20px 0 12px" }} />
            <LogPanel lines={logsOf(selected.deviceId)} />
          </>
        )}

      </Drawer>

      <BatchConfigModal open={batchOpen} onClose={() => setBatchOpen(false)} targets={selectedDevices} />
    </>
  );
}
