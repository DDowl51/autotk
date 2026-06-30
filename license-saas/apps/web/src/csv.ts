export interface CsvColumn<T> {
  key: keyof T;
  label: string;
}

/** 对象数组 → CSV 文本（带表头）。含逗号/引号/换行的值按 RFC4180 转义。 */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")).join("\n");
  return rows.length ? `${header}\n${body}` : header;
}

/** 触发浏览器下载 CSV（带 UTF-8 BOM，Excel 打开中文不乱码）。 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
