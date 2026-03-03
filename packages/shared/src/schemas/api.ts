import { z } from "zod";

import { roleSchema } from "./auth.js";
import { projectWizardSchema } from "./project.js";

export const healthStatusSchema = z.enum(["Green", "Amber", "Red"]);

export const projectEntitySchema = projectWizardSchema.extend({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  health: healthStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const userEntitySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  role: roleSchema,
  createdAt: z.string().datetime()
});

export type ProjectEntity = z.infer<typeof projectEntitySchema>;
export type UserEntity = z.infer<typeof userEntitySchema>;
