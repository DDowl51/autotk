import { useEffect, useRef, useState, type ReactNode } from "react";
import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  MobileOutlined,
  CloudUploadOutlined,
  SettingOutlined,
  ReadOutlined,
  DeploymentUnitOutlined,
  WarningOutlined,
  HistoryOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useHub } from "./hubState";
import { track } from "./telemetry";
import { BRAND, C } from "./theme";
import { Stage } from "./motion";
import { Overview } from "./pages/Overview";
import { Devices } from "./pages/Devices";
import { Alerts } from "./pages/Alerts";
import { History } from "./pages/History";
import { Analytics } from "./pages/Analytics";
import { Publish } from "./pages/Publish";
import { Settings } from "./pages/Settings";
import { Guide } from "./pages/Guide";

type View = "overview" | "devices" | "alerts" | "history" | "analytics" | "publish" | "settings" | "guide";

export default function App() {
  const [view, setView] = useState<View>("overview");
  const { connected, summary, hubUrl } = useHub();
  const goGuide = () => setView("guide");
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    track("page_view", { page: view });
  }, [view]);

  // 启动时：品牌 + 导航分组 + 顶栏错落入场（用 fromTo + clearProps，确保结束可见）。
  useGSAP(
    () => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(".brand", { autoAlpha: 0, x: -18 }, { autoAlpha: 1, x: 0, duration: 0.5, clearProps: "all" })
        .fromTo(
          ".ant-menu-item-group",
          { autoAlpha: 0, x: -14 },
          { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.09, clearProps: "all" },
          "-=0.2",
        )
        .fromTo(
          ".topbar > *",
          { autoAlpha: 0, y: -10 },
          { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08, clearProps: "all" },
          "-=0.25",
        );
      // 持续：品牌标识轻微呼吸 + 内部图标缓慢辉光脉动
      gsap.to(".brand .mark", { scale: 1.07, duration: 1.9, repeat: -1, yoyo: true, ease: "sine.inOut" });
    },
    { scope: shellRef },
  );

  const pages: Record<View, ReactNode> = {
    overview: <Overview goGuide={goGuide} />,
    devices: <Devices goGuide={goGuide} />,
    alerts: <Alerts />,
    history: <History goDevices={() => setView("devices")} />,
    analytics: <Analytics goSettings={() => setView("settings")} />,
    publish: <Publish />,
    settings: <Settings />,
    guide: <Guide />,
  };

  return (
    <div className="app-bg" ref={shellRef} style={{ height: "100vh", overflow: "hidden" }}>
      <Layout style={{ height: "100vh", background: "transparent" }}>
      <Layout.Sider
        width={236}
        style={{
          height: "100vh",
          overflowY: "auto",
          borderRight: `1px solid ${C.lineSoft}`,
          background: "rgba(8,10,14,0.6)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div className="brand">
          <div className="mark">
            <DeploymentUnitOutlined />
          </div>
          <div>
            <div className="name">{BRAND.name}</div>
            <div className="sub">{BRAND.sub}</div>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[view]}
          onClick={({ key }) => setView(key as View)}
          style={{ background: "transparent", borderInlineEnd: "none", marginTop: 4 }}
          items={[
            {
              type: "group",
              label: "监控",
              children: [
                { key: "overview", icon: <DashboardOutlined />, label: "总览" },
                { key: "devices", icon: <MobileOutlined />, label: "设备" },
                {
                  key: "alerts",
                  icon: <WarningOutlined />,
                  label: summary.alerts > 0 ? `告警 (${summary.alerts})` : "告警",
                },
                { key: "analytics", icon: <BarChartOutlined />, label: "数据看板" },
              ],
            },
            {
              type: "group",
              label: "操作",
              children: [
                { key: "history", icon: <HistoryOutlined />, label: "下发记录" },
                { key: "publish", icon: <CloudUploadOutlined />, label: "发布" },
              ],
            },
            {
              type: "group",
              label: "系统",
              children: [
                { key: "settings", icon: <SettingOutlined />, label: "设置" },
                { key: "guide", icon: <ReadOutlined />, label: "使用说明" },
              ],
            },
          ]}
        />
      </Layout.Sider>

      <Layout style={{ height: "100vh", background: "transparent" }}>
        <Layout.Header
          className="topbar"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            flexWrap: "nowrap",
            gap: 12,
            height: 62,
            lineHeight: "normal",
            padding: "0 26px",
            borderBottom: `1px solid ${C.lineSoft}`,
            background: "transparent",
          }}
        >
          <span className="chip">
            <span className={`pulse ${connected ? "on" : "off"}`} />
            {connected ? "已连接" : "未连接"}
            <span style={{ color: C.faint }}>{hubUrl.replace(/^https?:\/\//, "")}</span>
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <span className="chip">
              在线 <b style={{ color: C.cyan }}>{summary.online}</b>
            </span>
            <span className="chip">
              运行 <b style={{ color: C.lime }}>{summary.running}</b>
            </span>
            <span className="chip">
              告警 <b style={{ color: summary.alerts ? C.coral : C.text }}>{summary.alerts}</b>
            </span>
          </div>
        </Layout.Header>

        <Layout.Content style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ padding: 26, maxWidth: 1180, width: "100%", margin: "0 auto" }}>
            <Stage viewKey={view}>{pages[view]}</Stage>
          </div>
        </Layout.Content>
      </Layout>
      </Layout>
    </div>
  );
}
