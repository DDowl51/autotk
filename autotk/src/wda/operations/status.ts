import { request } from "../client";
import type { Status } from "../types";

/** 查询 WDA 状态（无需 session）。 */
export default function status(): Promise<Status> {
  return request<Status>("/status");
}
