import type { ReactNode } from "react";
import { Card, Col, Row, Statistic, Progress, Alert, Empty } from "antd";
import { KeyOutlined, CheckCircleOutlined, MobileOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { api, isAdmin, getUsername } from "../api";
import type { Product, Me } from "../types";
import { PageHeader } from "../ui";

interface Stats {
  totals: { codes: number; active: number; devices: number };
  statusCounts: { status: string; count: number }[];
  issuedByDay: { date: string; count: number }[];
  activatedByDay: { date: string; count: number }[];
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  UNUSED: { label: "未激活", color: "#3b82f6" },
  ACTIVE: { label: "已激活", color: "#10b981" },
  DISABLED: { label: "已停用", color: "#ef4444" },
};

function StatCard(props: { title: string; value: number | string; icon: ReactNode; tint: string }) {
  return (
    <Card variant="borderless" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, display: "grid", placeItems: "center", background: props.tint, color: "#fff", fontSize: 20 }}>
          {props.icon}
        </div>
        <Statistic title={props.title} value={props.value} />
      </div>
    </Card>
  );
}

export function Dashboard() {
  const admin = isAdmin();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/admin/stats?days=30") });
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/admin/products"), enabled: admin });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/admin/me") });

  const totals = stats.data?.totals ?? { codes: 0, active: 0, devices: 0 };
  const pie = (stats.data?.statusCounts ?? []).filter((s) => s.count > 0);
  const trend = (stats.data?.issuedByDay ?? []).map((d, i) => ({
    date: d.date.slice(5),
    发码: d.count,
    激活: stats.data?.activatedByDay[i]?.count ?? 0,
  }));
  const hasTrend = trend.some((t) => t.发码 > 0 || t.激活 > 0);

  return (
    <>
      <PageHeader title={`欢迎回来，${getUsername() ?? ""}`} subtitle="授权与激活码概览（近 30 天）" />

      <Row gutter={[16, 16]}>
        {admin && (
          <Col xs={12} md={6}>
            <StatCard title="产品" value={products.data?.length ?? 0} icon={<AppstoreOutlined />} tint="#6366f1" />
          </Col>
        )}
        <Col xs={12} md={admin ? 6 : 8}>
          <StatCard title={admin ? "激活码总数" : "我的激活码"} value={totals.codes} icon={<KeyOutlined />} tint="#0ea5e9" />
        </Col>
        <Col xs={12} md={admin ? 6 : 8}>
          <StatCard title="已激活" value={totals.active} icon={<CheckCircleOutlined />} tint="#10b981" />
        </Col>
        <Col xs={12} md={admin ? 6 : 8}>
          <StatCard title="已绑定设备" value={totals.devices} icon={<MobileOutlined />} tint="#f59e0b" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={9}>
          <Card title="激活码状态分布" variant="borderless" style={{ height: 340 }}>
            {pie.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pie} dataKey="count" nameKey="status" innerRadius={60} outerRadius={95} paddingAngle={2}>
                    {pie.map((s) => (
                      <Cell key={s.status} fill={STATUS_META[s.status]?.color ?? "#cbd5e1"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, STATUS_META[n]?.label ?? n]} />
                  <Legend formatter={(v: string) => STATUS_META[v]?.label ?? v} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty style={{ marginTop: 60 }} description="暂无数据" />
            )}
          </Card>
        </Col>
        <Col xs={24} md={15}>
          <Card title="发码 / 激活趋势（近 30 天）" variant="borderless" style={{ height: 340 }}>
            {hasTrend ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#98a2b3" }} interval="preserveStartEnd" minTickGap={28} />
                  <YAxis tick={{ fontSize: 11, fill: "#98a2b3" }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="发码" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="激活" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty style={{ marginTop: 60 }} description="近 30 天还没有发码 / 激活记录" />
            )}
          </Card>
        </Col>
      </Row>

      {!admin && me.data && me.data.codeQuota != null && (
        <Card title="发码配额" style={{ marginTop: 16 }} variant="borderless">
          <Progress
            percent={Math.min(100, Math.round(((me.data.used ?? totals.codes) / Math.max(1, me.data.codeQuota)) * 100))}
            format={() => `${me.data?.used ?? totals.codes} / ${me.data?.codeQuota}`}
          />
          <div style={{ color: "#667085", fontSize: 13, marginTop: 8 }}>
            你最多可发 {me.data.codeQuota} 个激活码，已用 {me.data.used ?? totals.codes} 个。需要更多请联系管理员。
          </div>
        </Card>
      )}

      {admin && (products.data?.length ?? 0) === 0 && !products.isLoading && (
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="还没有产品"
          description="先到「产品」页创建一个产品，拿到接入用的 key/secret，然后就能发激活码了。不清楚流程可看「帮助 / 指南」。"
        />
      )}
    </>
  );
}
