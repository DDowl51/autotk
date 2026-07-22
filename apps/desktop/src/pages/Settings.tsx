import { useEffect, useMemo, useState } from "react";
import { Form, Input, InputNumber, Button, Space, ColorPicker, App as AntApp } from "antd";
import { CheckOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useHub } from "../hubState";
import { useAppTheme } from "../appTheme";
import { loadSettings, saveSettings } from "../settings";
import { getPublisherApi } from "../publish-ipc";
import { PageHeader, SectionCard } from "../ui";
import { C, ACCENTS } from "../theme";
import { QrPanel } from "./QrPanel";

// 后台（master）设置桥（桌面 app 内才有；浏览器预览为 undefined → 该节隐藏）。
type MasterSettings = { vlmUrl: string; subnet: string };
type MasterApi = { getSettings: () => Promise<MasterSettings>; saveSettings: (s: MasterSettings) => Promise<MasterSettings> };
const getMasterApi = (): MasterApi | undefined => (window as unknown as { master?: MasterApi }).master;

export function Settings() {
  const { hubUrl, setHubUrl, reconnect, connected, embedded, stalledMinutes, setStalledMinutes } = useHub();
  const { accent, setAccent } = useAppTheme();
  const { message } = AntApp.useApp();
  const publisher = useMemo(() => getPublisherApi(), []);
  const [url, setUrl] = useState(hubUrl);
  const [videoRoot, setVideoRoot] = useState(loadSettings().videoRoot);
  const [stall, setStall] = useState(stalledMinutes);

  // 后台识别设置（GPU 地址 + 网段）
  const master = useMemo(() => getMasterApi(), []);
  const [vlmUrl, setVlmUrl] = useState("");
  const [subnet, setSubnet] = useState("");
  const [savingMaster, setSavingMaster] = useState(false);
  useEffect(() => {
    if (!master) return;
    master
      .getSettings()
      .then((s) => {
        setVlmUrl(s.vlmUrl || "");
        setSubnet(s.subnet || "");
      })
      .catch(() => {});
  }, [master]);
  const saveMaster = async () => {
    if (!master) return;
    setSavingMaster(true);
    try {
      await master.saveSettings({ vlmUrl: vlmUrl.trim(), subnet: subnet.trim() });
      message.success("已保存，正在用新设置重启后台识别（约几秒）…");
    } catch {
      message.error("保存失败");
    } finally {
      setSavingMaster(false);
    }
  };

  const saveHub = () => {
    setHubUrl(url.trim());
    reconnect();
    message.success("已保存并重连");
  };
  const saveRoot = () => {
    saveSettings({ videoRoot: videoRoot.trim() });
    message.success("已保存");
  };
  const pickRoot = async () => {
    if (!publisher) return;
    const dir = await publisher.chooseRoot();
    if (dir) {
      setVideoRoot(dir);
      saveSettings({ videoRoot: dir });
      message.success("已设置根文件夹");
    }
  };

  return (
    <>
      <PageHeader title="设置" />

      <SectionCard title="连接手机">
        {embedded ? (
          <>
            <div style={{ color: "#8595a4", fontSize: 13, marginBottom: 12 }}>
              控制中心已在本机运行（{connected ? "运行中" : "启动中…"}）。用手机 App 扫下面的二维码即可连上，无需填地址。
            </div>
            <QrPanel />
          </>
        ) : (
          <>
            <div style={{ color: "#8595a4", fontSize: 13, marginBottom: 12 }}>
              浏览器预览模式：手动填 Hub 地址。当前：{connected ? "已连接" : "未连接"}
            </div>
            <Form layout="vertical" style={{ maxWidth: 460 }}>
              <Form.Item label="Hub 地址">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:4000" />
              </Form.Item>
              <Button type="primary" onClick={saveHub}>
                保存并重连
              </Button>
            </Form>
          </>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      {master && (
        <>
          <SectionCard title="识别服务与设备发现（GPU / 网段）">
            <div style={{ color: "#8595a4", fontSize: 13, marginBottom: 12 }}>
              GPU 识别服务（perception）地址与要扫描的网段。都可留空：地址空=本机 :8000；网段空=自动挑本机私网卡（192.168/10/172.16-31，排除 VPN 段）。改完保存会用新设置重启后台识别（约几秒），手机会重新自动发现。
            </div>
            <Form layout="vertical" style={{ maxWidth: 460 }}>
              <Form.Item label="GPU 识别服务地址（VLM）" extra="perception 服务地址；与桌面端同机时留空即用本机 :8000。">
                <Input value={vlmUrl} onChange={(e) => setVlmUrl(e.target.value)} placeholder="http://192.168.11.191:8000（留空=本机 :8000）" />
              </Form.Item>
              <Form.Item label="扫描网段" extra="手机所在的 /24 段，如 192.168.11（会扫 .1–254）。多个段用逗号分隔，如 192.168.1, 192.168.11。留空=自动挑本机私网卡（覆盖多数网络）。">
                <Input value={subnet} onChange={(e) => setSubnet(e.target.value)} placeholder="留空=自动；或 192.168.11，多个用逗号分隔" />
              </Form.Item>
              <Button type="primary" loading={savingMaster} onClick={saveMaster}>
                保存并重启后台
              </Button>
            </Form>
          </SectionCard>

          <div style={{ height: 16 }} />
        </>
      )}

      <SectionCard title="外观">
        <div style={{ color: "#8595a4", fontSize: 13, marginBottom: 14 }}>主题色（信号色）。</div>
        <Form layout="vertical" style={{ maxWidth: 460 }}>
          <Form.Item label="主题色" style={{ marginBottom: 0 }}>
            <Space size={12} align="center">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  title={a.name}
                  onClick={() => setAccent(a.value)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 0,
                    background: a.value,
                    border: accent === a.value ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    color: "#0a0c11",
                  }}
                >
                  {accent === a.value && <CheckOutlined style={{ fontSize: 14 }} />}
                </button>
              ))}
              <span style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
              <ColorPicker
                value={accent}
                onChange={(c) => setAccent(c.toHexString())}
                presets={[{ label: "预设", colors: ACCENTS.map((a) => a.value) }]}
              >
                <Button size="small">自定义…</Button>
              </ColorPicker>
            </Space>
          </Form.Item>
        </Form>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="监控">
        <div style={{ color: "#8595a4", fontSize: 13, marginBottom: 12 }}>
          设备「在线且运行中」但超过该时长没有任何进展（统计数不变），标记为「疑似卡住」。
        </div>
        <Form layout="vertical" style={{ maxWidth: 460 }}>
          <Form.Item label="疑似卡住阈值（分钟）">
            <InputNumber
              min={1}
              max={120}
              value={stall}
              onChange={(v) => setStall(v ?? 5)}
              style={{ width: 160 }}
            />
          </Form.Item>
          <Button
            type="primary"
            onClick={() => {
              setStalledMinutes(stall);
              message.success("已保存");
            }}
          >
            保存
          </Button>
        </Form>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="视频根文件夹">
        <div style={{ color: "#8595a4", fontSize: 13, marginBottom: 12 }}>
          发布功能的视频根目录：每台设备在此根目录下对应一个「以设备名命名」的子文件夹，把当天要发的视频放进去。
        </div>
        {publisher ? (
          <Space.Compact style={{ maxWidth: 560, width: "100%" }}>
            <Input
              value={videoRoot}
              readOnly
              placeholder="点右侧「选择文件夹」"
              prefix={<FolderOpenOutlined style={{ color: C.faint }} />}
            />
            <Button type="primary" icon={<FolderOpenOutlined />} onClick={pickRoot}>
              选择文件夹
            </Button>
          </Space.Compact>
        ) : (
          <Form layout="vertical" style={{ maxWidth: 460 }}>
            <Form.Item
              label="根文件夹路径"
              extra="在桌面应用内打开时可直接「选择文件夹」；当前为浏览器预览，手动填写路径。"
            >
              <Input
                value={videoRoot}
                onChange={(e) => setVideoRoot(e.target.value)}
                placeholder="/Users/you/autotk-videos"
              />
            </Form.Item>
            <Button onClick={saveRoot}>保存</Button>
          </Form>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="关于">
        <div style={{ color: "#9fb0c0", lineHeight: 2 }}>
          <div>控制中心 · v1.0.0</div>
        </div>
      </SectionCard>
    </>
  );
}
