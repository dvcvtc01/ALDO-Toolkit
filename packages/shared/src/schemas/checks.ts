import { z } from "zod";

export const dnsCheckResultSchema = z.object({
  endpoint: z.string().trim().min(1),
  resolved: z.boolean(),
  addresses: z.array(z.string().trim()).default([]),
  message: z.string().trim().optional()
});

export const tcpCheckResultSchema = z.object({
  targetIp: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  reachable: z.boolean(),
  latencyMs: z.number().nonnegative().optional(),
  message: z.string().trim().optional()
});

export const environmentCheckerResultSchema = z.object({
  executed: z.boolean(),
  status: z.enum(["pending", "passed", "failed", "skipped"]),
  summary: z.string().trim(),
  transcriptPath: z.string().trim().optional()
});

export const runnerEvidencePayloadSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(["direct", "indirect", "fallback"]),
  dnsChecks: z.array(dnsCheckResultSchema),
  tcpChecks: z.array(tcpCheckResultSchema),
  environmentChecker: environmentCheckerResultSchema,
  transcript: z.array(z.record(z.unknown())),
  collectedAt: z.string().datetime()
});

export type DnsCheckResult = z.infer<typeof dnsCheckResultSchema>;
export type TcpCheckResult = z.infer<typeof tcpCheckResultSchema>;
export type RunnerEvidencePayload = z.infer<typeof runnerEvidencePayloadSchema>;
