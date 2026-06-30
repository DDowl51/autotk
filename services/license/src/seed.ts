import { PrismaClient } from "@prisma/client";
import { hashPassword } from "./adapters/password";

// 初始化首个超级管理员（幂等）。用 ADMIN_USER / ADMIN_PASS 环境变量，默认 admin/admin123。
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const username = process.env.ADMIN_USER ?? "admin";
  const password = process.env.ADMIN_PASS ?? "admin123";
  const existing = await prisma.account.findUnique({ where: { username } });
  if (existing) {
    console.log(`管理员 ${username} 已存在，跳过`);
  } else {
    await prisma.account.create({
      data: { username, passwordHash: await hashPassword(password), role: "ADMIN" },
    });
    console.log(`已创建超级管理员：${username}`);
  }
  await prisma.$disconnect();
}

void main();
