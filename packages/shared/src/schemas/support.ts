import { z } from "zod";

export const supportBundleSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
  mode: z.enum(["direct", "indirect", "fallback"]),
  createdAt: z.string().datetime(),
  files: z.array(
    z.object({
      path: z.string().trim().min(1),
      sha256: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/),
      sizeBytes: z.number().int().nonnegative()
    })
  ),
  metadata: z.record(z.unknown())
});

export type SupportBundle = z.infer<typeof supportBundleSchema>;
