export type Role = "ADMIN" | "OPERATOR" | "USER";

const TOKEN_KEY = "license_admin_token";
const ROLE_KEY = "license_admin_role";
const USER_KEY = "license_admin_user";

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const getRole = (): Role | null => localStorage.getItem(ROLE_KEY) as Role | null;
export const getUsername = (): string | null => localStorage.getItem(USER_KEY);
export const isAdmin = (): boolean => getRole() === "ADMIN";
export const isOperator = (): boolean => getRole() === "OPERATOR";
/** 能否管理账号（建/改分销）：ADMIN 或运营。建产品仍仅 ADMIN。 */
export const canManageAccounts = (): boolean => isAdmin() || isOperator();

/** 角色中文标签（前端展示统一走这里）。 */
export const roleLabel = (r: Role | null | undefined): string =>
  r === "ADMIN" ? "管理员" : r === "OPERATOR" ? "运营" : "分销";

export function setSession(s: { token: string; role: Role; username?: string } | null): void {
  if (!s) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, s.token);
  localStorage.setItem(ROLE_KEY, s.role);
  if (s.username) localStorage.setItem(USER_KEY, s.username);
}

/** fetch 客户端：自动带 token，401 时清会话。 */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const tok = getToken();
  if (tok) headers.authorization = `Bearer ${tok}`;

  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const data: unknown = await res.json().catch(() => null);
  if (res.status === 401) setSession(null);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (data && typeof data === "object" && "message" in data) {
      const m = (data as { message: unknown }).message;
      msg = Array.isArray(m) ? m.join("; ") : String(m);
    }
    throw new Error(msg);
  }
  return data as T;
}
