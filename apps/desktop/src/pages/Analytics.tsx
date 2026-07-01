import { useCallback, useEffect, useState } from "react";
import { Row, Col, Table, Tag, Segmented, Button, Space, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { loadSettings } from "../settings";
import { fetchSummary, fetchSeries, toChart, systemLabel, type Summary, type ChartPoint } from "../analytics";
import { StatTile, SectionCard, PageHeader, EmptyHint, Mono } from "../ui";
import { humanizeError } from "../errors";
import { C } from "../theme";

type Range = "24h" | "7d";
const RANGES: Record<Range, { ms: number; bucket: number }> = {
  "24h": { ms: 86_400_000, bucket: 3_600_000 },
  "7d": { ms: 7 * 86_400_000, bucket: 86_400_000 },
};

export function Analytics({ goSettings }: { goSettings: () => void }) {
  const collectorUrl = loadSettings().collectorUrl;
  const [range, setRange] = useState<Range>("24h");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!collectorUrl) return;
    setLoading(true);
    try {
      const since = Date.now() - RANGES[range].ms;
      const bucket = RANGES[range].bucket;
      const [s, ser] = await Promise.all([
        fetchSummary(collectorUrl, since),
        fetchSeries(collectorUrl, bucket, since),
      ]);
      setSummary(s);
      setChart(toChart(ser.points, ser.bucketMs));
    } catch (e) {
      message.error(humanizeError(e, "analytics"));
    } finally {
      setLoading(false);
    }
  }, [collectorUrl, range]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!collectorUrl) {
    return (
      <>
        <PageHeader title="数据看板" subtitle="埋点事件概览" />
        <SectionCard>
          <EmptyHint
            title="尚未配置采集服务地址"
            lines={["到「设置 → 埋点采集地址」填入 collector 的地址（如 http://你的服务器:4100）"]}
            actionText="去设置"
            onAction={goSettings}
          />
        </SectionCard>
      </>
    );
  }

  const systems = summary ? Object.entries(summary.bySystem).sort((a, b) => b[1] - a[1]) : [];

  return (
    <>
      <PageHeader
        title="数据看板"
        subtitle="埋点事件概览"
        extra={
          <Space>
            <Segmented
              value={range}
              onChange={(v) => setRange(v as Range)}
              options={[
                { label: "近 24 小时", value: "24h" },
                { label: "近 7 天", value: "7d" },
              ]}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
          </Space>
        }
      />

      <Row gutter={16}>
        <Col span={8}>
          <StatTile label={`事件总数（${range === "24h" ? "24 小时" : "7 天"}）`} value={summary?.total ?? 0} />
        </Col>
        <Col span={8}>
          <StatTile label="系统数" value={systems.length} accent={C.cyan} />
        </Col>
        <Col span={8}>
          <StatTile label="事件种类" value={summary?.byEvent.length ?? 0} accent={C.amber} />
        </Col>
      </Row>

      <div style={{ height: 16 }} />

      <SectionCard title="事件量趋势">
        {chart.length < 2 ? (
          <div style={{ color: C.faint, fontSize: 13, padding: "24px 0", textAlign: "center" }}>数据不足，暂无趋势</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#5b6b72" fontSize={11} />
              <YAxis stroke="#5b6b72" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0e1219", border: `1px solid ${C.line}`, borderRadius: 8 }} labelStyle={{ color: "#cbd5e1" }} />
              <Line type="monotone" dataKey="count" name="事件数" stroke="var(--lime)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <Row gutter={16} align="top">
        <Col span={10}>
          <SectionCard title="按系统">
            {systems.length === 0 ? (
              <div style={{ color: C.faint, fontSize: 13 }}>暂无数据</div>
            ) : (
              systems.map(([sys, n]) => (
                <div key={sys} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <Tag color="cyan">{systemLabel(sys)}</Tag>
                  <span style={{ marginLeft: "auto" }}>
                    <Mono>{n}</Mono>
                  </span>
                </div>
              ))
            )}
          </SectionCard>
        </Col>
        <Col span={14}>
          <SectionCard title="热门事件">
            <Table
              rowKey="name"
              size="small"
              dataSource={summary?.byEvent ?? []}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              columns={[
                { title: "事件", dataIndex: "name", render: (v: string) => <Mono>{v}</Mono> },
                { title: "次数", dataIndex: "count", width: 90, align: "right", render: (v: number) => <Mono>{v}</Mono> },
              ]}
              locale={{ emptyText: "暂无数据" }}
            />
          </SectionCard>
        </Col>
      </Row>
    </>
  );
}
