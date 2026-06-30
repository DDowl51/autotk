import { Card, Descriptions, Typography, Space, Button } from "antd";
import { useNavigate } from "react-router-dom";
import { BRAND } from "../theme";
import { PageHeader, Mono } from "../ui";

export function Settings() {
  const navigate = useNavigate();
  const apiBase = `${window.location.origin}/admin`;

  return (
    <>
      <PageHeader title="设置" subtitle="系统信息与接入参数" />

      <Card title="关于" variant="borderless" style={{ marginBottom: 16, maxWidth: 720 }}>
        <Descriptions column={1} colon>
          <Descriptions.Item label="系统">{BRAND.name} —— {BRAND.tagline}</Descriptions.Item>
          <Descriptions.Item label="说明">
            通用激活码 / 授权 SaaS：管理产品、发放激活码、设备绑定与远程封禁；产品通过 SDK 接入。
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="接入信息" variant="borderless" style={{ marginBottom: 16, maxWidth: 720 }}>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <div>
            管理端 API 地址：<Mono copyable>{apiBase}</Mono>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            客户端（autotk 等）接入用每个产品自己的 key/secret，调用 <Mono>/v1/activate</Mono>、<Mono>/v1/heartbeat</Mono>。具体见帮助。
          </Typography.Text>
          <Button onClick={() => navigate("/help")}>查看接入指南</Button>
        </Space>
      </Card>
    </>
  );
}
