import { z } from "zod";

export const supportBundleStatusSchema = z.enum(["queued", "building", "ready", "failed"]);

export const supportBundleManifestFileSchema = z.object({
  path: z.string().trim().min(1),
  sha256: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative()
});

export const supportBundleManifestSchema = z.object({
  formatVersion: z.literal("1.0"),
  generatedAtUtc: z.string().datetime(),
  files: z.array(supportBundleManifestFileSchema)
});

export const supportBundleEntitySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: supportBundleStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  requestedByUserId: z.string().uuid().nullable(),
  filePath: z.string().nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  sha256: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/).nullable(),
  manifestJson: supportBundleManifestSchema.nullable(),
  error: z.string().nullable()
});

export type SupportBundleStatus = z.infer<typeof supportBundleStatusSchema>;
export type SupportBundleManifest = z.infer<typeof supportBundleManifestSchema>;
export type SupportBundleEntity = z.infer<typeof supportBundleEntitySchema>;
