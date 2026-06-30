import { Table, Tag, Space, Descriptions, Collapse } from "antd";
import { useHub } from "../hubState";
import {
  summarizeJob,
  jobRows,
  retriableDeviceIds,
  type RowStatus,
} from "../configJobs";
import { groupPatch, type ConfigOp } from "../configHistory";
import { PageHeader, SectionCard, Mono, EmptyHint } from "../ui";

const ROW_TAG: Record<RowStatus, { color: string; label: string }> = {
  pending: { color: "default", label: "等待中" },
  sent: { color: "processing", label: "已下发" },
  ok: { color: "success", label: "成功" },
  failed: { color: "error", label: "失败" },
  offline: { color: "default", label: "离线" },
  timeout: { color: "warning", label: "超时" },
};

function ResultTags({ r }: { r: ConfigOp }) {
  return (
    <Space size={4} wrap>
      <Tag color="success">成 {r.ok}</Tag>
      {r.failed > 0 && <Tag color="error">败 {r.failed}</Tag>}
      {r.timeout > 0 && <Tag color="warning">时 {r.timeout}</Tag>}
      {r.offline > 0 && <Tag>离 {r.offline}</Tag>}
      {r.pending > 0 && <Tag color="processing">中 {r.pending}</Tag>}
    </Space>
  );
}

export function History({ goDevices }: { goDevices: () => void }) {
  const { configJob, configHistory } = useHub();
  const summary = summarizeJob(configJob);

  return (
    <>
      <PageHeader title="下发记录" subtitle="批量修改设置的下发进度与历史；点开一条看改了哪些内容" />

      {configJob && (
        <div style={{ marginBottom: 16 }}>
          <SectionCard
            title="本次下发进度"
            extra={
              <Space>
                <Tag color="success">成功 {summary.ok}</Tag>
                {summary.failed > 0 && <Tag color="error">失败 {summary.failed}</Tag>}
                {summary.timeout > 0 && <Tag color="warning">超时 {summary.timeout}</Tag>}
                {summary.offline > 0 && <Tag>离线 {summary.offline}</Tag>}
                {summary.pending > 0 && <Tag color="processing">进行 {summary.pending}</Tag>}
              </Space>
            }
          >
            <Table
              rowKey="deviceId"
              size="small"
              dataSource={jobRows(configJob)}
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
              columns={[
                { title: "设备", dataIndex: "deviceName", render: (v: string) => <Mono>{v}</Mono> },
                { title: "结果", dataIndex: "status", render: (s: RowStatus) => <Tag color={ROW_TAG[s].color}>{ROW_TAG[s].label}</Tag> },
                { title: "说明", dataIndex: "error", render: (e?: string) => (e ? <span style={{ color: "#fca5a5" }}>{e}</span> : "—") },
              ]}
            />
            {retriableDeviceIds(configJob).length > 0 && (
              <div style={{ marginTop: 10, color: "#8595a4", fontSize: 13 }}>
                有 {retriableDeviceIds(configJob).length} 台未成功，可到「设备」页重新勾选下发。
              </div>
            )}
          </SectionCard>
        </div>
      )}

      <SectionCard title={`历史记录（共 ${configHistory.length} 条）`}>
        {configHistory.length === 0 ? (
          <EmptyHint
            title="还没有下发记录"
            lines={["到「设备」页勾选手机 → 批量修改设置 → 下发后会记录在这里"]}
            actionText="去设备页"
            onAction={goDevices}
          />
        ) : (
          <Table
            rowKey="jobId"
            size="small"
            dataSource={configHistory}
            pagination={{ pageSize: 12, hideOnSinglePage: true }}
            expandable={{
              expandedRowRender: (r: ConfigOp) => {
                const groups = groupPatch(r.patch);
                if (groups.length === 0) return <span style={{ color: "#8595a4" }}>（无具体字段）</span>;
                return (
                  <Collapse
                    size="small"
                    defaultActiveKey={[groups[0].group]}
                    items={groups.map((g) => ({
                      key: g.group,
                      label: (
                        <span>
                          {g.group} <Tag style={{ marginInlineStart: 6 }}>{g.items.length} 项</Tag>
                        </span>
                      ),
                      children: (
                        <Descriptions column={2} size="small" bordered styles={{ label: { width: 150 } }}>
                          {g.items.map((c, i) => (
                            <Descriptions.Item key={i} label={c.label}>
                              <Mono>{c.value}</Mono>
                            </Descriptions.Item>
                          ))}
                        </Descriptions>
                      ),
                    }))}
                  />
                );
              },
            }}
            columns={[
              { title: "时间", dataIndex: "ts", render: (t: number) => new Date(t).toLocaleString() },
              { title: "分组", dataIndex: "groups", render: (g: string[]) => g.map((x) => <Tag key={x}>{x}</Tag>) },
              { title: "台数", dataIndex: "deviceCount", width: 70 },
              { title: "结果", render: (_v, r: ConfigOp) => <ResultTags r={r} /> },
            ]}
          />
        )}
      </SectionCard>
    </>
  );
}
