import { randomBytes } from "node:crypto";
import type { PoolAccount } from "../core/account-pool";
import type { StatePort, SignedIpaRecord } from "../core/ports";
import type { EnrollOutcome } from "../core/signing-orchestrator";

/**
 * 运行时存储（内存版）：实现 StatePort（账号池 + 签名 IPA 缓存），
 * 另管「签名 IPA 字节」和「扫码 session」。
 *
 * 现为内存实现；方法全 async，将来换文件/DB 落盘（账号设备集要持久化）可原位替换。
 * 凭据（p12/p8）不在这里，归 accounts.json + 适配器。
 */

export type SessionState = "pending" | "ready" | "pool-full" | "error";

export interface OtaSession {
  token: string;
  app: string;
  createdAt: number;
  state: SessionState;
  ready?: Extract<EnrollOutcome, { state: "ready" }>;
  error?: string;
}

export class OtaStore implements StatePort {
  private accounts: PoolAccount[];
  private readonly ipaMeta = new Map<string, SignedIpaRecord>(); // key: account::app
  private readonly ipaBytes = new Map<string, Buffer>(); // token -> 字节
  private readonly sessions = new Map<string, OtaSession>();

  constructor(
    accounts: PoolAccount[],
    private readonly now: () => number = Date.now,
    /** 设备集变更时落盘（可选）。snapshot = { 账号名: udid[] }。 */
    private readonly persist?: (snapshot: Record<string, string[]>) => Promise<void>,
  ) {
    this.accounts = accounts.map((a) => ({ ...a, devices: [...a.devices] }));
  }

  private k(account: string, app: string): string {
    return `${account}::${app}`;
  }

  private snapshot(): Record<string, string[]> {
    return Object.fromEntries(this.accounts.map((a) => [a.name, [...a.devices]]));
  }

  // ---- StatePort：账号池 ----
  async listAccounts(): Promise<PoolAccount[]> {
    return this.accounts.map((a) => ({ ...a, devices: [...a.devices] }));
  }
  async saveAccount(account: PoolAccount): Promise<void> {
    const i = this.accounts.findIndex((a) => a.name === account.name);
    if (i >= 0) this.accounts[i] = { ...account, devices: [...account.devices] };
    else this.accounts.push({ ...account, devices: [...account.devices] });
    if (this.persist) await this.persist(this.snapshot());
  }

  // ---- StatePort：签名 IPA 缓存 ----
  async getSignedIpa(account: string, app: string): Promise<SignedIpaRecord | undefined> {
    return this.ipaMeta.get(this.k(account, app));
  }
  async putSignedIpa(account: string, app: string, ipa: Buffer, profileVersion: string): Promise<SignedIpaRecord> {
    const token = randomBytes(12).toString("hex");
    const rec: SignedIpaRecord = { token, profileVersion };
    this.ipaMeta.set(this.k(account, app), rec);
    this.ipaBytes.set(token, ipa);
    return rec;
  }
  async invalidateAccountIpas(account: string): Promise<void> {
    for (const [key, rec] of [...this.ipaMeta]) {
      if (key.startsWith(`${account}::`)) {
        this.ipaBytes.delete(rec.token);
        this.ipaMeta.delete(key);
      }
    }
  }

  // ---- 签名 IPA 字节 ----
  getIpa(token: string): Buffer | undefined {
    return this.ipaBytes.get(token);
  }

  // ---- 扫码 session ----
  createSession(app: string): string {
    const token = randomBytes(9).toString("hex");
    this.sessions.set(token, { token, app, createdAt: this.now(), state: "pending" });
    return token;
  }
  getSession(token: string): OtaSession | undefined {
    return this.sessions.get(token);
  }
  markReady(token: string, ready: Extract<EnrollOutcome, { state: "ready" }>): void {
    const s = this.sessions.get(token);
    if (s) {
      s.state = "ready";
      s.ready = ready;
    }
  }
  markPoolFull(token: string): void {
    const s = this.sessions.get(token);
    if (s) s.state = "pool-full";
  }
  markError(token: string, message: string): void {
    const s = this.sessions.get(token);
    if (s) {
      s.state = "error";
      s.error = message;
    }
  }
}
