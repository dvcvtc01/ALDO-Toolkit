import { z } from "zod";

export const artifactFileSchema = z.object({
  relativePath: z.string().trim().min(1),
  sha256: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative().optional()
});

export const acquisitionChecklistSchema = z.object({
  azureSubscriptionActive: z.boolean(),
  approvalGranted: z.boolean(),
  hasRequiredRbac: z.boolean(),
  understandsNoBypass: z.literal(true),
  versionNotes: z.string().trim().min(1).max(2000),
  expectedArtifacts: z.array(artifactFileSchema).min(1),
  providedArtifactRoot: z.string().trim().min(1)
});

export type AcquisitionChecklistInput = z.infer<typeof acquisitionChecklistSchema>;
export type ArtifactFileInput = z.infer<typeof artifactFileSchema>;
