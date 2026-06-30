import { useState } from "react";
import { Table, Button, type TableColumnsType } from "antd";
import { useHub } from "../hubState";
import { collectAlerts, type AlertItem } from "../devices";
import { PageHeader, Mono, EmptyHint } from "../ui";

const ACK_KEY = "mc.ackedAlerts";
const keyOf = (a: AlertItem) => `${a.deviceId}:${a.alert}:${a.ts}`;

function loadAcked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ACK_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveAcked(s: Set<string>) {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export function Alerts() {
  const { map } = useHub();
  const [acked, setAcked] = useState<Set<string>>(loadAcked);
  const alerts = collectAlerts(map).filter((a) => !acked.has(keyOf(a)));

  const ack = (a: AlertItem) => {
    const next = new Set(acked);
    next.add(keyOf(a));
    setAcked(next);
    saveAcked(next);
  };

  const columns: TableColumnsType<AlertItem> = [
    { title: "设备", dataIndex: "deviceName", render: (v: string) => <Mono>{v}</Mono> },
    { title: "告警", dataIndex: "alert", render: (v: string) => <span style={{ color: "#fca5a5" }}>{v}</span> },
    { title: "时间", dataIndex: "ts", render: (v: number) => new Date(v).toLocaleString() },
    {
      title: "操作",
      width: 90,
      render: (_v, a) => (
        <Button size="small" onClick={() => ack(a)}>
          确认
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="告警中心" subtitle={`${alerts.length} 条待处理`} />
      <Table
        rowKey={keyOf}
        dataSource={alerts}
        columns={columns}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <EmptyHint title="暂无待处理告警" lines={["手机端遇到弹窗卡死 / 长时间无进展会在这里高亮"]} />
          ),
        }}
      />
    </>
  );
}
