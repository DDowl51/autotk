import type { AccountRepo, AdminRole, AdminTokenSigner, PasswordVerifier } from "./ports";

export type LoginResult =
  | { ok: true; token: string; expiresAt: number; role: AdminRole }
  | { ok: false };

/** 管理端登录：校验用户名/密码（bcrypt）→ 签管理 JWT。只依赖端口，可单测。 */
export class AuthService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly passwords: PasswordVerifier,
    private readonly signer: AdminTokenSigner,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const acc = await this.accounts.findByUsername(username);
    if (!acc) return { ok: false };
    if (acc.disabled) return { ok: false };
    if (!(await this.passwords.verify(password, acc.passwordHash))) return { ok: false };
    const { token, expiresAt } = await this.signer.sign({ accountId: acc.id, role: acc.role });
    return { ok: true, token, expiresAt, role: acc.role };
  }
}
