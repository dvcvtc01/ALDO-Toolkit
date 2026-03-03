import { z } from "zod";

export const runTypeSchema = z.enum(["acquire_scan", "netcheck"]);
export const runStatusSchema = z.enum(["requested", "in_progress", "completed", "failed"]);

export const runCreateRequestSchema = z.object({
  type: runTypeSchema,
  requestJson: z.record(z.unknown()).default({})
});

export const runExecutedBySchema = z.object({
  hostname: z.string().trim().min(1),
  username: z.string().trim().min(1),
  runnerVersion: z.string().trim().min(1)
});

export const runArtifactSchema = z.object({
  relativePath: z.string().trim().min(1),
  sha256: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.string().datetime().optional()
});

export const runEvidenceSchema = z.object({
  status: runStatusSchema,
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  executedBy: runExecutedBySchema,
  transcriptText: z.string().optional(),
  transcriptLines: z.array(z.record(z.unknown())).default([]),
  resultJson: z.unknown(),
  artifacts: z.array(runArtifactSchema).default([])
});

export const runEntitySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: runTypeSchema,
  status: runStatusSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  executedBy: runExecutedBySchema.nullable(),
  transcriptText: z.string().nullable(),
  transcriptLines: z.array(z.record(z.unknown())),
  resultJson: z.unknown().nullable(),
  artifacts: z.array(runArtifactSchema),
  requestJson: z.record(z.unknown()),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type RunType = z.infer<typeof runTypeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunCreateRequest = z.infer<typeof runCreateRequestSchema>;
export type RunEvidence = z.infer<typeof runEvidenceSchema>;
export type RunEntity = z.infer<typeof runEntitySchema>;
