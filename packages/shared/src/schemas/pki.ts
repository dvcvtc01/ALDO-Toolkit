import { z } from "zod";

export const certificateSummarySchema = z.object({
  thumbprint: z.string().trim().min(8),
  subject: z.string().trim().min(1),
  issuer: z.string().trim().min(1),
  sanDns: z.array(z.string().trim()).default([]),
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime(),
  isSelfSigned: z.boolean(),
  chainId: z.string().trim().min(1),
  cdpUrls: z.array(z.string().url()).default([]),
  ocspUrls: z.array(z.string().url()).default([])
});

export const pkiValidationRequestSchema = z.object({
  deployDate: z.string().datetime(),
  certificates: z.array(certificateSummarySchema).min(1)
});

export type CertificateSummary = z.infer<typeof certificateSummarySchema>;
export type PkiValidationRequest = z.infer<typeof pkiValidationRequestSchema>;
