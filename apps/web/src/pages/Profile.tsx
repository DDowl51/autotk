import { Card, Descriptions, Form, Input, Button, Tag, App as AntApp } from "antd";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, getUsername, getRole } from "../api";
import type { Me } from "../types";
import { PageHeader } from "../ui";

export function Profile() {
  const { message } = AntApp.useApp();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/admin/me") });

  const changePw = useMutation({
    mutationFn: (v: { oldPassword: string; newPassword: string }) => api("/admin/me/password", { method: "POST", body: v }),
    onSuccess: () => message.success("密码已修改，下次登录请用新密码"),
    onError: (e) => message.error((e as Error).message),
  });

  const role = me.data?.role ?? getRole();
  const username = me.data?.username ?? getUsername();

  return (
    <>
      <PageHeader title="个人中心" subtitle="账号信息与密码" />

      <Card variant="borderless" style={{ marginBottom: 16, maxWidth: 640 }}>
        <Descriptions column={1} colon>
          <Descriptions.Item label="用户名">{username}</Descriptions.Item>
          <Descriptions.Item label="角色">
            <Tag color={role === "ADMIN" ? "geekblue" : "default"}>{role === "ADMIN" ? "管理员" : "分销"}</Tag>
          </Descriptions.Item>
          {role === "USER" && (
            <Descriptions.Item label="发码配额">
              {me.data?.codeQuota == null ? "不限" : `${me.data.used ?? 0} / ${me.data.codeQuota}`}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="修改密码" variant="borderless" style={{ maxWidth: 640 }}>
        <Form layout="vertical" style={{ maxWidth: 360 }} onFinish={(v: { oldPassword: string; newPassword: string }) => changePw.mutate(v)}>
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={changePw.isPending}>
            保存
          </Button>
        </Form>
      </Card>
    </>
  );
}
