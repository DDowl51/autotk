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
import { api, isAdmin, isOperator, roleLabel } from "../api";
import type { Account, Product, Me } from "../types";
import { PageHeader, EmptyState, HelpTip } from "../ui";

/** 后端错误码 → 中文提示（尤其运营越权/额度）。 */
function friendlyErr(msg: string): string {
  if (msg.startsWith("quota_pool_exceeded")) {
    const rem = msg.split(":")[1];
    return `超出你的可分配额度${rem !== undefined ? `（剩余 ${rem}）` : ""}，请调低额度或减少其他分销的额度`;
  }
  if (msg === "quota_required") return "你的额度有限，必须给分销设置一个具体额度（不能留空/不限）";
  if (msg === "product_not_allowed") return "只能勾选你自己可见的产品";
  if (msg === "operator_can_only_create_dealer") return "运营只能创建分销账号";
  if (msg === "not_your_account") return "只能管理你自己创建的分销";
  if (msg === "username taken") return "用户名已被占用";
  return msg;
}

export function Accounts() {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pwTarget, setPwTarget] = useState<Account | null>(null);
  const [editTarget, setEditTarget] = useState<Account | null>(null);

  const admin = isAdmin();
  const operator = isOperator();

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/admin/me") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/admin/accounts") });
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/admin/products") });
  const productOptions = products.data?.map((p) => ({ value: p.id, label: p.name }));
  const productNameById = (id: string) => products.data?.find((p) => p.id === id)?.name ?? id;
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["accounts"] });
    void qc.invalidateQueries({ queryKey: ["me"] }); // 额度池随分配变化
  };

  // 运营的额度池：剩余可分配 = 总预算 - 自己已发码 - 已分配给分销之和。
  // null = 不限额（运营 codeQuota 为空）或非运营（ADMIN 无上限）。
  const poolBounded = operator && me.data?.codeQuota != null;
  const poolRemaining = poolBounded
    ? me.data!.codeQuota! - (me.data!.used ?? 0) - (me.data!.allocated ?? 0)
    : null;

  const create = useMutation({
    mutationFn: (v: { username: string; password: string; codeQuota: number | null; role: string; productIds?: string[] }) =>
      api("/admin/accounts", { method: "POST", body: v }),
    onSuccess: () => {
      setCreateOpen(false);
      invalidate();
      message.success("账号已创建");
    },
    onError: (e) => message.error(friendlyErr((e as Error).message)),
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
    onError: (e) => message.error(friendlyErr((e as Error).message)),
  });

  const resetPw = useMutation({
    mutationFn: (v: { id: string; newPassword: string }) => api(`/admin/accounts/${v.id}/password`, { method: "POST", body: { newPassword: v.newPassword } }),
    onSuccess: () => {
      setPwTarget(null);
      message.success("密码已重置");
    },
    onError: (e) => message.error(friendlyErr((e as Error).message)),
  });

  const columns: TableColumnsType<Account> = [
    { title: "用户名", dataIndex: "username", render: (v: string) => <b>{v}</b> },
    {
      title: "角色",
      dataIndex: "role",
      render: (v: Account["role"]) => (
        <Tag color={v === "ADMIN" ? "geekblue" : v === "OPERATOR" ? "purple" : "default"}>{roleLabel(v)}</Tag>
      ),
    },
    {
      title: "发码配额",
      render: (_v, r) =>
        r.role === "ADMIN" ? "不限" : `${r.codeCount ?? 0} / ${r.codeQuota ?? "不限"}`,
    },
    {
      title: (
        <span>
          可见产品 <HelpTip text="该账号在白名单内的产品才能看到并发码。空 = 看不到任何产品、不能发码。" />
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

  // 新建账号：ADMIN 可选「分销/运营」，运营锁死「分销」。
  const roleOptions = admin
    ? [
        { value: "USER", label: "分销" },
        { value: "OPERATOR", label: "运营（可再建分销、按额度池分额度）" },
      ]
    : [{ value: "USER", label: "分销" }];

  const createTitle = admin ? "新建账号" : "新建分销账号";
  const createBtn = admin ? "新建账号" : "新建分销";
  const quotaTip = operator
    ? "该分销最多能发多少个激活码，从你的额度池中扣。留空 = 不限（仅当你自己不限额时可用）。"
    : "该分销最多能发多少个激活码。留空 = 不限。";

  return (
    <>
      <PageHeader
        title="账号"
        subtitle={
          operator
            ? "创建分销账号并从你的额度池中分配发码额度；分销登录后只能管理自己名下的码"
            : "创建分销/运营账号并设置发码配额；对方登录后只能管理自己名下的资源"
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {createBtn}
          </Button>
        }
      />

      {poolBounded && (
        <div style={{ marginBottom: 12, color: "#475467" }}>
          你的额度池：总额 {me.data!.codeQuota}，已用（自己发码 {me.data!.used ?? 0} + 已分配 {me.data!.allocated ?? 0}），
          <b> 剩余可分配 {poolRemaining}</b>
        </div>
      )}

      <Table
        rowKey="id"
        loading={accounts.isLoading}
        dataSource={accounts.data}
        columns={columns}
        locale={{ emptyText: <EmptyState title="还没有分销账号" description="新建一个分销账号并给定配额，对方即可登录、在额度内自助发码。" actionText={createBtn} onAction={() => setCreateOpen(true)} /> }}
        pagination={{ hideOnSinglePage: true }}
      />

      <Modal title={createTitle} open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={{ role: "USER", codeQuota: poolBounded ? Math.max(0, Math.min(100, poolRemaining ?? 0)) : 100, productIds: [] }}
          onFinish={(v: { username: string; password: string; codeQuota: number | null; role: string; productIds?: string[] }) => create.mutate(v)}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3, message: "至少 3 位" }]}>
            <Input placeholder="登录名" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="codeQuota"
            label={
              <span>
                发码配额 <HelpTip text={quotaTip} />
              </span>
            }
            extra={poolBounded ? `不能超过你的剩余可分配额度 ${poolRemaining}` : undefined}
          >
            <InputNumber min={0} max={poolBounded ? (poolRemaining ?? 0) : undefined} style={{ width: "100%" }} placeholder="留空 = 不限" />
          </Form.Item>
          <Form.Item
            name="productIds"
            label={
              <span>
                可见产品 <HelpTip text={operator ? "只能勾选你自己可见的产品。不选 = 对方登录后看不到任何产品。" : "只有勾选的产品该分销才能看到并发码。不选 = 暂不分配。"} />
              </span>
            }
          >
            <Select mode="multiple" allowClear placeholder="选择允许对方发码的产品" options={productOptions} />
          </Form.Item>
          <Form.Item name="role" label="角色" hidden={!admin}>
            <Select options={roleOptions} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending} block>
            创建
          </Button>
        </Form>
      </Modal>

      <Modal title={`编辑 · ${editTarget?.username ?? ""}`} open={!!editTarget} onCancel={() => setEditTarget(null)} footer={null} destroyOnClose>
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
                  发码配额 <HelpTip text="该账号最多能发多少个激活码。留空 = 不限。已发出的码（含被隐藏的）仍计入配额。" />
                </span>
              }
              extra={
                poolBounded
                  ? `可分配上限 ${(poolRemaining ?? 0) + (editTarget.codeQuota ?? 0)}（剩余 ${poolRemaining} + 该分销当前 ${editTarget.codeQuota ?? 0}）`
                  : undefined
              }
            >
              <InputNumber
                min={0}
                max={poolBounded ? (poolRemaining ?? 0) + (editTarget.codeQuota ?? 0) : undefined}
                style={{ width: "100%" }}
                placeholder="留空 = 不限"
              />
            </Form.Item>
            <Form.Item
              name="productIds"
              label={
                <span>
                  可见产品 <HelpTip text="覆盖式设置。移除某产品后，该分销名下属于该产品的码会从其视图隐藏（数据保留、客户端激活不受影响）。" />
                </span>
              }
            >
              <Select mode="multiple" allowClear placeholder="选择允许对方发码的产品" options={productOptions} />
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
