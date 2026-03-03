import { describe, expect, it } from "vitest";

import { validateAcquisitionChecklist } from "../src/validators/acquisition-validator.js";

describe("validateAcquisitionChecklist", () => {
  it("fails when subscription, approval, and rbac are not present", () => {
    const result = validateAcquisitionChecklist({
      azureSubscriptionActive: false,
      approvalGranted: false,
      hasRequiredRbac: false,
      understandsNoBypass: true,
      versionNotes: "Version under review",
      expectedArtifacts: [
        {
          relativePath: "payload/update.zip",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ],
      providedArtifactRoot: "C:\\artifacts"
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(3);
  });
});
