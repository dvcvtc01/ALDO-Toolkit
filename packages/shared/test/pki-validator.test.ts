import { describe, expect, it } from "vitest";

import { validatePkiBundle } from "../src/validators/pki-validator.js";

const certificates = Array.from({ length: 24 }, (_, index) => ({
  thumbprint: `thumbprint-${index}`,
  subject: `CN=cert-${index}`,
  issuer: "CN=corp-root-ca",
  sanDns: [`host-${index}.corp.example.com`],
  notBefore: "2026-01-01T00:00:00.000Z",
  notAfter: "2028-06-01T00:00:00.000Z",
  isSelfSigned: false,
  chainId: "corp-root-ca",
  cdpUrls: ["http://crl.corp.example.com/root.crl"],
  ocspUrls: ["http://ocsp.corp.example.com"]
}));

describe("validatePkiBundle", () => {
  it("passes for a compliant bundle", () => {
    const result = validatePkiBundle({
      deployDate: "2026-03-01T00:00:00.000Z",
      certificates
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.summary.certificateCount).toBe(24);
  });

  it("fails for self-signed certs and insufficient cert count", () => {
    const result = validatePkiBundle({
      deployDate: "2026-03-01T00:00:00.000Z",
      certificates: [
        {
          ...certificates[0],
          isSelfSigned: true,
          notAfter: "2027-01-01T00:00:00.000Z"
        }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "SELF_SIGNED_NOT_ALLOWED")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "CERTIFICATE_COUNT_INVALID")).toBe(true);
  });
});
