import { z } from "zod";

export const roleSchema = z.enum(["Admin", "Operator", "Viewer"]);

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128)
});

export const bootstrapAdminSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(3).max(128)
});

export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(3).max(128),
  role: roleSchema
});

export type Role = z.infer<typeof roleSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
