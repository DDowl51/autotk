import { z } from "zod";

export const activateSchema = z.object({
  code: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
});

export const heartbeatSchema = z.object({
  deviceId: z.string().min(1),
});
