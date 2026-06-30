import { Card, Steps, Collapse, Typography, Tag } from "antd";
import { isAdmin } from "../api";
import { PageHeader, Mono } from "../ui";

const SDK_SAMPLE = `import { LicenseClient } from "@license/sdk";

const client = new LicenseClient({
  baseUrl: "https://你的域名",
  productKey: "prod_xxx",      // 产品 Key
  productSecret: "xxxxxxxx",   // 产品 Secret（建议混淆/加固）
  deviceId,                    // 设备唯一标识（iOS identifierForVendor）
  storage,                     // RN: 适配 Keychain/SecureStore
});

// 启动门禁
if (!(await client.isActivated())) {
  await client.activate(用户输入的激活码);
}
// 定时续期 + 接收远程封禁
await client.heartbeat();`;

export function Help() {
  const admin = isAdmin();

  const adminFaq = [
    {
      key: "ks",
      label: "key 和 secret 有什么区别？",
      children: (
        <Typography.Paragraph>
          <b>Key</b> 是产品的公开标识（可放进客户端、随请求带上）；<b>Secret</b> 是签名密钥（客户端用它给请求算 HMAC 签名，服务端验签防伪造），<b>必须保密、只显示一次</b>。
          泄露或怀疑泄露时到「产品」页「重置 secret」，旧密钥立即失效。
        </Typography.Paragraph>
      ),
    },
    {
      key: "dev",
      label: "“设备数上限”和“有效期”是什么？",
      children: (
        <Typography.Paragraph>
          <b>设备数上限</b>：一个激活码最多能在几台设备上激活，超出会被拒（防止一码多机滥用）。<br />
          <b>有效期</b>：到期后该码无法再激活/续期；留空 = 永久。两者都可在「激活码 · 编辑」里随时调整。
        </Typography.Paragraph>
      ),
    },
    {
      key: "ban",
      label: "怎么封禁某台设备 / 停用某个码？",
      children: (
        <Typography.Paragraph>
          「激活码」列表里「停用」整个码（其所有设备失效），或在设备维度做远程封禁（接口 <Mono>/admin/devices/revoke</Mono>）。被封设备下次心跳即被踢下线。
        </Typography.Paragraph>
      ),
    },
    {
      key: "reseller",
      label: "分销账号怎么用？",
      children: (
        <Typography.Paragraph>
          「账号」页新建分销并给定<b>发码配额</b>；分销用自己的账号登录后，只能看到/管理自己名下的码，并在配额内自助发码。
        </Typography.Paragraph>
      ),
    },
  ];

  const userFaq = [
    {
      key: "issue",
      label: "怎么发码给我的客户？",
      children: (
        <Typography.Paragraph>
          到「我的激活码 · 发码」批量生成（可设设备数、有效期），把生成的码发给终端用户，用户在 App 激活页输入即可。你的发码总数受管理员给的<b>配额</b>限制。
        </Typography.Paragraph>
      ),
    },
    {
      key: "limit",
      label: "“设备数上限”和“有效期”是什么？",
      children: (
        <Typography.Paragraph>
          设备数上限 = 一个码能在几台设备上激活；有效期 = 到期后失效（留空永久）。可在「编辑」里调整自己名下的码。
        </Typography.Paragraph>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="帮助 / 指南" subtitle={admin ? "管理员上手指南" : "分销上手指南"} />

      <Card title="快速上手" variant="borderless" style={{ marginBottom: 16 }}>
        {admin ? (
          <Steps
            direction="vertical"
            current={-1}
            items={[
              { title: "创建产品", description: "「产品」页新建，拿到 key + secret（secret 只显示一次，请保存）。" },
              { title: "发放激活码", description: "「激活码」页批量发码，设置每码可绑设备数与有效期。" },
              { title: "接入 SDK", description: "在你的 App 里用产品 key/secret 接 @license/sdk，做启动门禁 + 心跳（见下方示例）。" },
              { title: "（可选）开分销", description: "「账号」页建分销账号并给配额，让对方在额度内自助发码。" },
            ]}
          />
        ) : (
          <Steps
            direction="vertical"
            current={-1}
            items={[
              { title: "发码", description: "「我的激活码」页发码，设置设备数与有效期（受配额限制）。" },
              { title: "分发", description: "把激活码发给你的终端用户。" },
              { title: "用户激活", description: "用户在 App 激活页输入激活码即可启用。" },
            ]}
          />
        )}
      </Card>

      {admin && (
        <Card title={<span>SDK 接入示例 <Tag>客户端</Tag></span>} variant="borderless" style={{ marginBottom: 16 }}>
          <pre className="mono" style={{ background: "#0b1120", color: "#e2e8f0", padding: 16, borderRadius: 10, overflow: "auto", fontSize: 12.5, lineHeight: 1.7 }}>
            {SDK_SAMPLE}
          </pre>
        </Card>
      )}

      <Card title="常见问题" variant="borderless">
        <Collapse ghost items={admin ? adminFaq : userFaq} />
      </Card>
    </>
  );
}
