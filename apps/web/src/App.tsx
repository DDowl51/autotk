import { Layout, Menu, Dropdown, Avatar, Tag } from "antd";
import {
  DashboardOutlined,
  KeyOutlined,
  AppstoreOutlined,
  TeamOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { getToken, getUsername, setSession, isAdmin, canManageAccounts, getRole, roleLabel } from "./api";
import { BRAND } from "./theme";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Codes } from "./pages/Codes";
import { Products } from "./pages/Products";
import { Accounts } from "./pages/Accounts";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { Help } from "./pages/Help";

function Brand() {
  return (
    <div className="app-brand">
      <div className="logo">
        <KeyOutlined style={{ fontSize: 16 }} />
      </div>
      <div>
        <div className="title">{BRAND.name}</div>
        <div className="sub">{BRAND.tagline}</div>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  if (!getToken()) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const admin = isAdmin();
  const canAccounts = canManageAccounts(); // ADMIN 或运营
  const role = getRole();
  const logout = () => {
    setSession(null);
    window.location.href = "/";
  };

  const menuItems = [
    { key: "dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
    { key: "codes", icon: <KeyOutlined />, label: admin ? "激活码" : "我的激活码" },
    // 产品仅 ADMIN；账号（建分销）ADMIN 与运营都能进。
    ...(admin ? [{ key: "products", icon: <AppstoreOutlined />, label: "产品" }] : []),
    ...(canAccounts ? [{ key: "accounts", icon: <TeamOutlined />, label: "账号" }] : []),
    { key: "help", icon: <QuestionCircleOutlined />, label: "帮助 / 指南" },
    { key: "settings", icon: <SettingOutlined />, label: "设置" },
  ];

  const seg = location.pathname.split("/")[1] || "dashboard";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider width={232} breakpoint="lg" collapsedWidth={0}>
        <Brand />
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[seg]}
          onClick={({ key }) => navigate(`/${key}`)}
          items={menuItems}
          style={{ background: "transparent", borderInlineEnd: "none", marginTop: 6 }}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 24px",
            borderBottom: "1px solid #eceef3",
          }}
        >
          <Dropdown
            menu={{
              items: [
                { key: "profile", icon: <UserOutlined />, label: "个人中心" },
                { key: "settings", icon: <SettingOutlined />, label: "设置" },
                { type: "divider" },
                { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true },
              ],
              onClick: ({ key }) => (key === "logout" ? logout() : navigate(`/${key}`)),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <Avatar size={30} style={{ background: BRAND.accent }}>
                {(getUsername() ?? "?").slice(0, 1).toUpperCase()}
              </Avatar>
              <span style={{ fontWeight: 500 }}>{getUsername() ?? "用户"}</span>
              <Tag
                color={role === "ADMIN" ? "geekblue" : role === "OPERATOR" ? "purple" : "default"}
                style={{ marginInlineEnd: 0 }}
              >
                {roleLabel(role)}
              </Tag>
            </div>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ padding: 24, maxWidth: 1180, width: "100%", margin: "0 auto" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/codes" element={<Codes />} />
            <Route path="/help" element={<Help />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            {admin && <Route path="/products" element={<Products />} />}
            {canAccounts && <Route path="/accounts" element={<Accounts />} />}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
