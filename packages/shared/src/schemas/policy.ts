import { z } from "zod";

export const policyRuleSeveritySchema = z.enum(["critical", "warning", "info"]);
export const policyCheckStatusSchema = z.enum(["pass", "warn", "fail", "not_applicable"]);
export const policyOverallStatusSchema = z.enum(["pass", "warn", "fail"]);

export const policyRuleKeySchema = z.enum([
  "PROJECT_VALIDATION_PASSED",
  "ACQUISITION_PREREQUISITES_CONFIRMED",
  "RUN_ACQUIRE_SCAN_COMPLETED",
  "RUN_NETCHECK_COMPLETED",
  "RUN_PKI_VALIDATE_COMPLETED",
  "RUN_ENVCHECK_COMPLETED"
]);

export const policyRuleSchema = z.object({
  key: policyRuleKeySchema,
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  severity: policyRuleSeveritySchema,
  required: z.boolean(),
  enabled: z.boolean()
});

export const policyPackSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  description: z.string().trim().min(1),
  rules: z.array(policyRuleSchema).min(1)
});

export const policyEvaluationRequestSchema = z.object({
  packId: z.string().trim().min(1).optional()
});

export const policyCheckSchema = z.object({
  key: policyRuleKeySchema,
  status: policyCheckStatusSchema,
  severity: policyRuleSeveritySchema,
  message: z.string().trim().min(1),
  evidence: z.record(z.unknown()).optional()
});

export const policyEvaluationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passCount: z.number().int().nonnegative(),
  warnCount: z.number().int().nonnegative(),
  failCount: z.number().int().nonnegative()
});

export const policyEvaluationSchema = z.object({
  packId: z.string().trim().min(1),
  packVersion: z.string().trim().min(1),
  evaluatedAt: z.string().datetime(),
  overallStatus: policyOverallStatusSchema,
  summary: policyEvaluationSummarySchema,
  checks: z.array(policyCheckSchema).min(1)
});

export const policyEvaluationRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  evaluation: policyEvaluationSchema
});

export type PolicyRuleSeverity = z.infer<typeof policyRuleSeveritySchema>;
export type PolicyCheckStatus = z.infer<typeof policyCheckStatusSchema>;
export type PolicyOverallStatus = z.infer<typeof policyOverallStatusSchema>;
export type PolicyRuleKey = z.infer<typeof policyRuleKeySchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type PolicyPack = z.infer<typeof policyPackSchema>;
export type PolicyEvaluationRequest = z.infer<typeof policyEvaluationRequestSchema>;
export type PolicyCheck = z.infer<typeof policyCheckSchema>;
export type PolicyEvaluationSummary = z.infer<typeof policyEvaluationSummarySchema>;
export type PolicyEvaluation = z.infer<typeof policyEvaluationSchema>;
export type PolicyEvaluationRecord = z.infer<typeof policyEvaluationRecordSchema>;
