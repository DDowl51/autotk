import { Form, Input, Button, App as AntApp } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import { api, setSession, type Role } from "../api";
import { BRAND } from "../theme";

export function Login() {
  const { message } = AntApp.useApp();

  const onFinish = async (v: { username: string; password: string }) => {
    try {
      const r = await api<{ token: string; role: Role }>("/admin/login", { method: "POST", body: v });
      setSession({ token: r.token, role: r.role, username: v.username });
      window.location.href = "/";
    } catch (e) {
      message.error("登录失败：" + (e as Error).message);
    }
  };

  return (
    <div className="auth-bg">
      <div style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              margin: "0 auto 14px",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg,#6366f1,#4f46e5)",
              boxShadow: "0 8px 24px rgba(79,70,229,.5)",
            }}
          >
            <KeyOutlined style={{ color: "#fff", fontSize: 24 }} />
          </div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 22, fontWeight: 700 }}>{BRAND.name}</h1>
          <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 13 }}>{BRAND.tagline}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 20px 50px rgba(2,6,23,.45)" }}>
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
              <Input size="large" autoComplete="username" placeholder="admin" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password size="large" autoComplete="current-password" placeholder="••••••••" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block>
              登录
            </Button>
          </Form>
        </div>
        <div style={{ textAlign: "center", color: "#64748b", marginTop: 16, fontSize: 12 }}>
          首次部署默认管理员 <span className="mono">admin / admin123</span>，登录后请到「个人中心」改密。
        </div>
      </div>
    </div>
  );
}
