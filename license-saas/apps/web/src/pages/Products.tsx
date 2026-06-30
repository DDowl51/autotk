import { useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Typography,
  Alert,
  Space,
  Popconfirm,
  App as AntApp,
  type TableColumnsType,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Product } from "../types";
import { PageHeader, EmptyState, Mono } from "../ui";

/** 创建/重置后展示 key+secret（仅此一次）。 */
function showSecret(key: string | undefined, secret: string, title: string) {
  Modal.success({
    title,
    width: 560,
    content: (
      <div>
        <Alert
          type="warning"
          showIcon
          style={{ margin: "8px 0 16px" }}
          message="secret 只显示这一次"
          description="这是产品接入 SDK 时用于请求签名的 HMAC 密钥，服务端不会再明文展示。请立即复制保存到安全的地方；丢了只能「重新生成」（会让旧密钥失效）。"
        />
        {key && (
          <div style={{ marginBottom: 10 }}>
            产品 Key（可公开，客户端用）：<Mono copyable>{key}</Mono>
          </div>
        )}
        <div>
          Secret（保密）：<Mono copyable>{secret}</Mono>
        </div>
      </div>
    ),
  });
}

export function Products() {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const products = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/admin/products") });

  const create = useMutation({
    mutationFn: (name: string) => api<{ id: string; key: string; secret: string }>("/admin/products", { method: "POST", body: { name } }),
    onSuccess: (r) => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["products"] });
      showSecret(r.key, r.secret, "产品已创建");
    },
    onError: (e) => message.error((e as Error).message),
  });

  const regen = useMutation({
    mutationFn: (id: string) => api<{ secret: string }>(`/admin/products/${id}/regenerate-secret`, { method: "POST" }),
    onSuccess: (r) => showSecret(undefined, r.secret, "新 secret 已生成（旧的已失效）"),
    onError: (e) => message.error((e as Error).message),
  });

  const columns: TableColumnsType<Product> = [
    { title: "名称", dataIndex: "name", render: (v: string) => <b>{v}</b> },
    { title: "Key", dataIndex: "key", render: (v: string) => <Mono copyable>{v}</Mono> },
    { title: "创建时间", dataIndex: "createdAt", render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm") },
    {
      title: "操作",
      width: 160,
      render: (_v, r) => (
        <Popconfirm
          title="重新生成 secret？"
          description="旧 secret 会立即失效，已用旧密钥接入的客户端需更新，否则验签失败。"
          onConfirm={() => regen.mutate(r.id)}
        >
          <Button size="small" icon={<ReloadOutlined />}>
            重置 secret
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="产品"
        subtitle="每个产品有一对 key / secret，供它的客户端接入 SDK"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            新建产品
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="key 与 secret 是做什么的？"
        description={
          <Space direction="vertical" size={2}>
            <span>· <b>Key</b>：产品的公开标识，嵌在客户端里，请求时带上，用来告诉服务端“我是哪个产品”。可公开。</span>
            <span>· <b>Secret</b>：HMAC 签名密钥，客户端用它给每个请求算签名，服务端用同一把验签，防伪造。<b>必须保密</b>，只在创建/重置时显示一次。</span>
          </Space>
        }
      />

      <Table
        rowKey="id"
        loading={products.isLoading}
        dataSource={products.data}
        columns={columns}
        locale={{
          emptyText: (
            <EmptyState title="还没有产品" description="先创建一个产品，拿到 key/secret 后即可接入 SDK 并发码。" actionText="新建产品" onAction={() => setOpen(true)} />
          ),
        }}
        pagination={{ hideOnSinglePage: true }}
      />

      <Modal title="新建产品" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form layout="vertical" onFinish={(v: { name: string }) => create.mutate(v.name)}>
          <Form.Item name="name" label="产品名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如：autotk" />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            创建后会生成 key + secret，secret 仅显示一次，请立即保存。
          </Typography.Paragraph>
          <Button type="primary" htmlType="submit" loading={create.isPending} block>
            创建
          </Button>
        </Form>
      </Modal>
    </>
  );
}
