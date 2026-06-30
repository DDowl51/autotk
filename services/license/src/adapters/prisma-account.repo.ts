import type { PrismaClient } from "@prisma/client";
import type { AccountRecord, AccountRepo } from "../domain/ports";

export class PrismaAccountRepo implements AccountRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUsername(username: string): Promise<AccountRecord | null> {
    const a = await this.prisma.account.findUnique({ where: { username } });
    return a
      ? {
          id: a.id,
          username: a.username,
          passwordHash: a.passwordHash,
          role: a.role,
          disabled: a.disabled,
        }
      : null;
  }
}
