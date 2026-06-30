import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const productSchema = z.object({
  name: z.string().min(1),
});

export const issueSchema = z.object({
  productId: z.string().min(1),
  count: z.number().int().min(1).max(1000),
  maxDevices: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
  ownerId: z.string().optional(),
});

export const revokeSchema = z.object({
  codeId: z.string().min(1),
  deviceId: z.string().min(1),
});

export const codePatchSchema = z.object({
  maxDevices: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

export const batchDisableSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const accountCreateSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(6),
  codeQuota: z.number().int().min(0).nullable().optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  productIds: z.array(z.string().min(1)).optional(), // 分销可见产品白名单
});

export const accountUpdateSchema = z.object({
  codeQuota: z.number().int().min(0).nullable().optional(),
  disabled: z.boolean().optional(),
  productIds: z.array(z.string().min(1)).optional(), // 覆盖式设置白名单
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});
