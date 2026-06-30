import { useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Space,
  App as AntApp,
  type TableColumnsType,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Account, Product } from "../types";
import { PageHeader, EmptyState, HelpTip } from "../ui";

export function Accounts() {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pwTarget, setPwTarget] = useState<Account | null>(null);
  const [editTarget, setEditTarget] = useState<Account | null>(null);

  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/admin/accounts") });
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/admin/products") });
  const productOptions = products.data?.map((p) => ({ value: p.id, label: p.name }));
  const productNameById = (id: string) => products.data?.find((p) => p.id === id)?.name ?? id;
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["accounts"] });

  const create = useMutation({
    mutationFn: (v: { username: string; password: string; codeQuota: number | null; role: string; productIds?: string[] }) =>
      api("/admin/accounts", { method: "POST", body: v }),
    onSuccess: () => {
      setCreateOpen(false);
      invalidate();
      message.success("账号已创建");
    },
    onError: (e) => message.error((e as Error).message),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; codeQuota?: number | null; disabled?: boolean; productIds?: string[] }) =>
      api(`/admin/accounts/${v.id}`, {
        method: "POST",
        body: { codeQuota: v.codeQuota, disabled: v.disabled, productIds: v.productIds },
      }),
    onSuccess: () => {
      setEditTarget(null);
      invalidate();
      message.success("已更新");
    },
    onError: (e) => message.error((e as Error).message),
  });

  const resetPw = useMutation({
    mutationFn: (v: { id: string; newPassword: string }) => api(`/admin/accounts/${v.id}/password`, { method: "POST", body: { newPassword: v.newPassword } }),
    onSuccess: () => {
      setPwTarget(null);
      message.success("密码已重置");
    },
    onError: (e) => message.error((e as Error).message),
  });

  const columns: TableColumnsType<Account> = [
    { title: "用户名", dataIndex: "username", render: (v: string) => <b>{v}</b> },
    {
      title: "角色",
      dataIndex: "role",
      render: (v: string) => <Tag color={v === "ADMIN" ? "geekblue" : "default"}>{v === "ADMIN" ? "管理员" : "分销"}</Tag>,
    },
    {
      title: "发码配额",
      render: (_v, r) =>
        r.role === "ADMIN" ? "不限" : `${r.codeCount ?? 0} / ${r.codeQuota ?? "不限"}`,
    },
    {
      title: (
        <span>
          可见产品 <HelpTip text="该分销在白名单内的产品才能看到并发码。空 = 看不到任何产品、不能发码。" />
        </span>
      ),
      render: (_v, r) => {
        if (r.role === "ADMIN") return "全部";
        const ids = r.productIds ?? [];
        if (ids.length === 0) return <Tag>未分配</Tag>;
        return (
          <Space size={4} wrap>
            {ids.map((id) => (
              <Tag key={id} color="geekblue">
                {productNameById(id)}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "状态",
      dataIndex: "disabled",
      render: (v: boolean) => (v ? <Tag color="red">已停用</Tag> : <Tag color="green">正常</Tag>),
    },
    {
      title: "操作",
      width: 280,
      render: (_v, r) =>
        r.role === "ADMIN" ? (
          <span style={{ color: "#98a2b3" }}>—</span>
        ) : (
          <Space size={4}>
            <Button size="small" type="link" onClick={() => setEditTarget(r)}>
              编辑
            </Button>
            <Button size="small" type="link" onClick={() => setPwTarget(r)}>
              重置密码
            </Button>
            <Button size="small" type="link" onClick={() => update.mutate({ id: r.id, disabled: !r.disabled })}>
              {r.disabled ? "启用" : "停用"}
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="账号"
        subtitle="创建分销账号并设置发码配额；分销登录后只能管理自己名下的码"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建分销
          </Button>
        }
      />

      <Table
        rowKey="id"
        loading={accounts.isLoading}
        dataSource={accounts.data}
        columns={columns}
        locale={{ emptyText: <EmptyState title="还没有分销账号" description="新建一个分销账号并给定配额，对方即可登录、在额度内自助发码。" actionText="新建分销" onAction={() => setCreateOpen(true)} /> }}
        pagination={{ hideOnSinglePage: true }}
      />

      <Modal title="新建分销账号" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={{ role: "USER", codeQuota: 100, productIds: [] }}
          onFinish={(v: { username: string; password: string; codeQuota: number | null; role: string; productIds?: string[] }) => create.mutate(v)}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3, message: "至少 3 位" }]}>
            <Input placeholder="分销登录名" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="codeQuota"
            label={
              <span>
                发码配额 <HelpTip text="该分销最多能发多少个激活码。留空 = 不限。" />
              </span>
            }
          >
            <InputNumber min={0} style={{ width: "100%" }} placeholder="留空 = 不限" />
          </Form.Item>
          <Form.Item
            name="productIds"
            label={
              <span>
                可见产品 <HelpTip text="只有勾选的产品该分销才能看到并发码。不选 = 暂不分配，对方登录后看不到任何产品。" />
              </span>
            }
          >
            <Select mode="multiple" allowClear placeholder="选择允许该分销发码的产品" options={productOptions} />
          </Form.Item>
          <Form.Item name="role" label="角色" hidden>
            <Select options={[{ value: "USER", label: "分销" }]} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending} block>
            创建
          </Button>
        </Form>
      </Modal>

      <Modal title={`编辑分销 · ${editTarget?.username ?? ""}`} open={!!editTarget} onCancel={() => setEditTarget(null)} footer={null} destroyOnClose>
        {editTarget && (
          <Form
            layout="vertical"
            initialValues={{ codeQuota: editTarget.codeQuota, productIds: editTarget.productIds ?? [] }}
            onFinish={(v: { codeQuota: number | null; productIds?: string[] }) =>
              update.mutate({ id: editTarget.id, codeQuota: v.codeQuota ?? null, productIds: v.productIds ?? [] })
            }
          >
            <Form.Item
              name="codeQuota"
              label={
                <span>
                  发码配额 <HelpTip text="该分销最多能发多少个激活码。留空 = 不限。已发出的码（含被隐藏的）仍计入配额。" />
                </span>
              }
            >
              <InputNumber min={0} style={{ width: "100%" }} placeholder="留空 = 不限" />
            </Form.Item>
            <Form.Item
              name="productIds"
              label={
                <span>
                  可见产品 <HelpTip text="覆盖式设置。移除某产品后，该分销名下属于该产品的码会从其视图隐藏（数据保留、客户端激活不受影响）。" />
                </span>
              }
            >
              <Select mode="multiple" allowClear placeholder="选择允许该分销发码的产品" options={productOptions} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={update.isPending} block>
              保存
            </Button>
          </Form>
        )}
      </Modal>

      <Modal title={`重置密码 · ${pwTarget?.username ?? ""}`} open={!!pwTarget} onCancel={() => setPwTarget(null)} footer={null} destroyOnClose>
        <Form layout="vertical" onFinish={(v: { newPassword: string }) => pwTarget && resetPw.mutate({ id: pwTarget.id, newPassword: v.newPassword })}>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={resetPw.isPending} block>
            确定重置
          </Button>
        </Form>
      </Modal>
    </>
  );
}
