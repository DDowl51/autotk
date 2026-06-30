// 改设备名的操作日志（审计），按 deviceId 留痕，持久化到 localStorage。

export interface RenameOp {
  deviceId: string;
  from: string;
  to: string;
  ts: number;
}

const KEY = "mc.renameHistory";
const CAP = 100;

export function addRename(list: RenameOp[], op: RenameOp, cap = CAP): RenameOp[] {
  return [op, ...list].slice(0, cap);
}

export function renamesFor(list: RenameOp[], deviceId: string): RenameOp[] {
  return list.filter((o) => o.deviceId === deviceId);
}

export function loadRenames(): RenameOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRenames(list: RenameOp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* 忽略 */
  }
}
