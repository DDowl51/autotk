import { Row, Col } from "antd";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useHub } from "../hubState";
import { StatTile, FleetBar, SectionCard, PageHeader, EmptyHint, Mono, StatusDot } from "../ui";
import { C } from "../theme";

export function Overview({ goGuide }: { goGuide: () => void }) {
  const { devices, summary, connected, series } = useHub();
  const chartData = series.map((p) => ({
    time: new Date(p.t).toLocaleTimeString().slice(0, 5),
    在线: p.online,
    运行: p.running,
  }));
  const alerts = devices.filter((d) => d.online && d.status?.alert);
  const offline = Math.max(0, summary.total - summary.online);
  const idleOnline = Math.max(0, summary.online - summary.running);

  return (
    <>
      <PageHeader title="总览" subtitle="机群实时概况" />
      <Row gutter={16}>
        <Col span={6}>
          <StatTile label="设备总数" value={summary.total} />
        </Col>
        <Col span={6}>
          <StatTile label="在线" value={summary.online} accent={C.cyan} />
        </Col>
        <Col span={6}>
          <StatTile label="运行中" value={summary.running} accent={C.lime} />
        </Col>
        <Col span={6}>
          <StatTile label="告警" value={summary.alerts} accent={summary.alerts ? C.coral : undefined} />
        </Col>
      </Row>

      <div style={{ height: 16 }} />

      <SectionCard title="机群状态">
        <FleetBar running={summary.running} online={idleOnline} alerts={summary.alerts} offline={offline} />
        <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 12, color: "#8595a4", flexWrap: "wrap" }}>
          <span><span className="dot running" /> 运行 {summary.running}</span>
          <span><span className="dot online" /> 空闲在线 {idleOnline}</span>
          <span><span className="dot alert" /> 告警 {summary.alerts}</span>
          <span><span className="dot offline" /> 离线 {offline}</span>
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="在线 / 运行趋势（每 30 秒采样）">
        {chartData.length < 2 ? (
          <div style={{ color: "#64748b", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
            趋势收集中…（运行一会儿后显示）
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke="#5b6b72" fontSize={11} />
              <YAxis stroke="#5b6b72" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#0e1219", border: `1px solid ${C.line}`, borderRadius: 8 }}
                labelStyle={{ color: "#cbd5e1" }}
              />
              <Line type="monotone" dataKey="在线" stroke={C.cyan} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="运行" stroke={C.lime} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="告警">
        {alerts.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>暂无告警</div>
        ) : (
          alerts.map((d) => (
            <div
              key={d.deviceId}
              style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.lineSoft}` }}
            >
              <StatusDot kind="alert" />
              <Mono>{d.deviceName}</Mono>
              <span style={{ color: "#fca5a5" }}>{d.status?.alert}</span>
            </div>
          ))
        )}
      </SectionCard>

      {summary.total === 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionCard>
            <EmptyHint
              title={connected ? "控制中心已就绪，还没有手机连上来" : "控制中心启动中…"}
              lines={
                connected
                  ? [
                      "手机装好 App 后，在 App 里扫「设置」页的二维码即可连上（需与本电脑同一个 WiFi）",
                      "连上后设备会自动出现在这里",
                    ]
                  : ["请稍候；若长时间无反应，重启本软件"]
              }
              actionText="查看使用说明"
              onAction={goGuide}
            />
          </SectionCard>
        </div>
      )}
    </>
  );
}
