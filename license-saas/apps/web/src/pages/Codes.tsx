import { useMemo, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  InputNumber,
  Select,
  Space,
  DatePicker,
  Input,
  Popconfirm,
  Typography,
  Alert,
  App as AntApp,
  type TableColumnsType,
} from "antd";
import { PlusOutlined, StopOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, isAdmin } from "../api";
import type { Code, Product } from "../types";
import { PageHeader, StatusTag, EmptyState, Mono, HelpTip } from "../ui";
import { toCsv, downloadCsv } from "../csv";
import { codeStatusView } from "../status";

export function Codes() {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const admin = isAdmin();
  const [productId, setProductId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [editing, setEditing] = useState<Code | null>(null);

  const products = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/admin/products") });
  const codes = useQuery({
    queryKey: ["codes", productId],
    queryFn: () => api<Code[]>(`/admin/codes${productId ? `?productId=${productId}` : ""}`),
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    products.data?.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [products.data]);

  const productName = (c: Code) => c.productName ?? (c.productId ? nameById.get(c.productId) : undefined) ?? "—";

  const rows = (codes.data ?? []).filter((c) => !status || c.status === status);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["codes"] });

  const issue = useMutation({
    mutationFn: (v: { productId: string; count: number; maxDevices: number; expiresAt?: string; ownerId?: string }) =>
      api<{ codes: string[] }>("/admin/codes", { method: "POST", body: v }),
    onSuccess: (r) => {
      setIssueOpen(false);
      invalidate();
      Modal.success({
        title: `已生成 ${r.codes.length} 个激活码`,
        width: 480,
        content: (
          <Typography.Paragraph copyable={{ text: r.codes.join("\n") }}>
            <pre className="mono" style={{ maxHeight: 300, overflow: "auto", background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              {r.codes.join("\n")}
            </pre>
          </Typography.Paragraph>
        ),
      });
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg.startsWith("quota_exceeded")) {
        const m = msg.match(/(\d+)\/(\d+)/);
        message.error(m ? `发码配额已用完（${m[1]}/${m[2]}），请联系管理员提升配额` : "发码配额已用完，请联系管理员");
      } else {
        message.error(msg);
      }
    },
  });

  const edit = useMutation({
    mutationFn: (v: { id: string; maxDevices?: number; expiresAt?: string | null; note?: string | null }) =>
      api(`/admin/codes/${v.id}`, { method: "PATCH", body: { maxDevices: v.maxDevices, expiresAt: v.expiresAt, note: v.note } }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
      message.success("已保存");
    },
    onError: (e) => message.error((e as Error).message),
  });

  const disableOne = useMutation({
    mutationFn: (id: string) => api(`/admin/codes/${id}/disable`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      message.success("已停用");
    },
    onError: (e) => message.error((e as Error).message),
  });

  const batchDisable = useMutation({
    mutationFn: (ids: string[]) => api("/admin/codes/batch/disable", { method: "POST", body: { ids } }),
    onSuccess: () => {
      setSelected([]);
      invalidate();
      message.success("已批量停用");
    },
    onError: (e) => message.error((e as Error).message),
  });

  const productOptions = products.data?.map((p) => ({ value: p.id, label: p.name }));

  const exportCsv = () => {
    const exportRows: Record<string, unknown>[] = rows.map((c) => ({
      激活码: c.code,
      产品: productName(c),
      状态: codeStatusView(c.status, c.expiresAt).label,
      设备数: c.devices,
      上限: c.maxDevices,
      有效期: c.expiresAt ? dayjs(c.expiresAt).format("YYYY-MM-DD") : "永久",
      归属: admin ? c.ownerName ?? "" : undefined,
      备注: c.note ?? "",
    }));
    const cols: { key: string; label: string }[] = [
      { key: "激活码", label: "激活码" },
      { key: "产品", label: "产品" },
      { key: "状态", label: "状态" },
      { key: "设备数", label: "设备数" },
      { key: "上限", label: "上限" },
      { key: "有效期", label: "有效期" },
      ...(admin ? [{ key: "归属", label: "归属" }] : []),
      { key: "备注", label: "备注" },
    ];
    downloadCsv(`codes-${dayjs().format("YYYYMMDD-HHmm")}.csv`, toCsv(exportRows, cols));
  };

  const columns: TableColumnsType<Code> = [
    { title: "激活码", dataIndex: "code", render: (v: string) => <Mono copyable>{v}</Mono> },
    { title: "产品", render: (_v, r) => productName(r) },
    ...(admin ? [{ title: "归属", render: (_v: unknown, r: Code) => r.ownerName ?? "—" }] : []),
    { title: "状态", render: (_v, r) => <StatusTag status={r.status} expiresAt={r.expiresAt} /> },
    { title: "设备数/上限", render: (_v, r) => `${r.devices}/${r.maxDevices}` },
    { title: "有效期", dataIndex: "expiresAt", render: (v: string | null) => (v ? dayjs(v).format("YYYY-MM-DD") : "永久") },
    {
      title: "操作",
      width: 150,
      render: (_v, r) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => setEditing(r)}>
            编辑
          </Button>
          <Popconfirm title="确定停用此码？" onConfirm={() => disableOne.mutate(r.id)}>
            <Button size="small" type="link" danger disabled={r.status === "DISABLED"}>
              停用
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={admin ? "激活码" : "我的激活码"}
        subtitle="生成、查看、编辑与停用激活码"
        extra={
          <>
            <Button icon={<DownloadOutlined />} disabled={rows.length === 0} onClick={exportCsv}>
              导出 CSV
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIssueOpen(true)}>
              发码
            </Button>
          </>
        }
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select placeholder="全部产品" allowClear style={{ width: 200 }} value={productId} onChange={setProductId} options={productOptions} />
        <Select
          placeholder="全部状态"
          allowClear
          style={{ width: 140 }}
          value={status}
          onChange={setStatus}
          options={[
            { value: "UNUSED", label: "未激活" },
            { value: "ACTIVE", label: "已激活" },
            { value: "DISABLED", label: "已停用" },
          ]}
        />
        {selected.length > 0 && (
          <Popconfirm title={`确定停用选中的 ${selected.length} 个码？`} onConfirm={() => batchDisable.mutate(selected)}>
            <Button danger icon={<StopOutlined />} loading={batchDisable.isPending}>
              批量停用（{selected.length}）
            </Button>
          </Popconfirm>
        )}
      </Space>

      <Table
        rowKey="id"
        loading={codes.isLoading}
        dataSource={rows}
        columns={columns}
        rowSelection={{ selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]) }}
        locale={{
          emptyText: (
            <EmptyState
              title="还没有激活码"
              description="点右上角「发码」批量生成。每个码可设置可绑定的设备数与有效期。"
              actionText="发码"
              onAction={() => setIssueOpen(true)}
            />
          ),
        }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />

      <Modal title="批量发码" open={issueOpen} onCancel={() => setIssueOpen(false)} footer={null} destroyOnClose>
        {!admin && (productOptions?.length ?? 0) === 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="还没有可发码的产品"
            description="管理员尚未给你分配任何产品，请联系管理员开通后再发码。"
          />
        )}
        <Form
          layout="vertical"
          initialValues={{ count: 10, maxDevices: 1, productId }}
          onFinish={(v: { productId: string; count: number; maxDevices: number; expiresAt?: Dayjs; ownerId?: string }) =>
            issue.mutate({
              productId: v.productId,
              count: v.count,
              maxDevices: v.maxDevices,
              expiresAt: v.expiresAt ? v.expiresAt.endOf("day").toISOString() : undefined,
              ownerId: v.ownerId,
            })
          }
        >
          <Form.Item name="productId" label="产品" rules={[{ required: true, message: "请选择产品" }]}>
            <Select options={productOptions} placeholder="选择产品" />
          </Form.Item>
          <Form.Item name="count" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={1000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="maxDevices"
            label={
              <span>
                每码可绑设备数 <HelpTip text="一个激活码最多能在多少台设备上激活，超出会被拒绝。" />
              </span>
            }
            rules={[{ required: true }]}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="expiresAt"
            label={
              <span>
                有效期至 <HelpTip text="留空 = 永久有效。到期后该码无法再激活/续期。" />
              </span>
            }
          >
            <DatePicker style={{ width: "100%" }} placeholder="留空 = 永久" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={issue.isPending} block>
            生成
          </Button>
        </Form>
      </Modal>

      <Modal title="编辑激活码" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        {editing && (
          <>
            <Alert type="info" showIcon style={{ marginBottom: 16 }} message={<Mono>{editing.code}</Mono>} />
            <Form
              layout="vertical"
              initialValues={{
                maxDevices: editing.maxDevices,
                expiresAt: editing.expiresAt ? dayjs(editing.expiresAt) : undefined,
                note: editing.note ?? undefined,
              }}
              onFinish={(v: { maxDevices: number; expiresAt?: Dayjs | null; note?: string }) =>
                edit.mutate({
                  id: editing.id,
                  maxDevices: v.maxDevices,
                  expiresAt: v.expiresAt ? v.expiresAt.endOf("day").toISOString() : null,
                  note: v.note ?? null,
                })
              }
            >
              <Form.Item name="maxDevices" label="可绑设备数" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="expiresAt" label="有效期至（清空 = 永久）">
                <DatePicker style={{ width: "100%" }} allowClear placeholder="永久" />
              </Form.Item>
              <Form.Item name="note" label="备注">
                <Input.TextArea rows={2} maxLength={200} placeholder="可选，便于自己识别" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={edit.isPending} block>
                保存
              </Button>
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}
