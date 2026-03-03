import type { PkiValidationRequest } from "../schemas/pki.js";
import type { ValidationIssue, ValidationResult } from "./project-validator.js";

type ReachabilityMap = Record<string, boolean>;

export type PkiValidationResult = ValidationResult & {
  summary: {
    certificateCount: number;
    uniqueChains: number;
    cdpEndpoints: string[];
    ocspEndpoints: string[];
  };
};

const addYears = (date: Date, years: number): Date => {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
};

export const validatePkiBundle = (
  input: PkiValidationRequest,
  reachability: ReachabilityMap = {}
): PkiValidationResult => {
  const issues: ValidationIssue[] = [];
  const deployDate = new Date(input.deployDate);
  const minExpiry = addYears(deployDate, 2);

  if (input.certificates.length !== 24) {
    issues.push({
      code: "CERTIFICATE_COUNT_INVALID",
      severity: "error",
      message: "Disconnected operations requires exactly 24 external certificates."
    });
  }

  const chainIds = new Set(input.certificates.map((cert) => cert.chainId));
  if (chainIds.size > 1) {
    issues.push({
      code: "CHAIN_MISMATCH",
      severity: "error",
      message: "All certificates must share a single trust chain."
    });
  }

  const cdpEndpoints = new Set<string>();
  const ocspEndpoints = new Set<string>();

  input.certificates.forEach((cert) => {
    if (cert.isSelfSigned) {
      issues.push({
        code: "SELF_SIGNED_NOT_ALLOWED",
        severity: "error",
        message: `Self-signed certificate detected: ${cert.subject}.`
      });
    }

    if (new Date(cert.notAfter) < minExpiry) {
      issues.push({
        code: "CERTIFICATE_EXPIRY_TOO_SOON",
        severity: "error",
        message: `Certificate expires before 2 years from deploy date: ${cert.subject}.`
      });
    }

    if (cert.sanDns.length === 0) {
      issues.push({
        code: "SAN_MISSING",
        severity: "error",
        message: `Certificate SAN DNS entries are required: ${cert.subject}.`
      });
    }

    cert.cdpUrls.forEach((url) => cdpEndpoints.add(url));
    cert.ocspUrls.forEach((url) => ocspEndpoints.add(url));
  });

  [...cdpEndpoints, ...ocspEndpoints].forEach((endpoint) => {
    if (endpoint in reachability && !reachability[endpoint]) {
      issues.push({
        code: "REVOCATION_ENDPOINT_UNREACHABLE",
        severity: "warning",
        message: `CRL/OCSP endpoint appears unreachable: ${endpoint}.`
      });
    }
  });

  if (cdpEndpoints.size === 0) {
    issues.push({
      code: "CDP_ENDPOINT_MISSING",
      severity: "warning",
      message: "No CRL/CDP endpoints were found; revocation checks may fail in air-gapped environments."
    });
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    summary: {
      certificateCount: input.certificates.length,
      uniqueChains: chainIds.size,
      cdpEndpoints: [...cdpEndpoints],
      ocspEndpoints: [...ocspEndpoints]
    }
  };
};
