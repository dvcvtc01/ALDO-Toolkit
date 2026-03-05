import { describe, expect, it } from "vitest";

import { evaluatePolicyPack } from "../src/services/policy-evaluator.js";
import { getPolicyPackById } from "../src/services/policy-packs.js";

describe("evaluatePolicyPack", () => {
  it("fails when required checks are missing", () => {
    const pack = getPolicyPackById("baseline-disconnectedops-v1");
    if (!pack) {
      throw new Error("Expected baseline policy pack to exist.");
    }

    const evaluation = evaluatePolicyPack(pack, {
      evaluatedAt: "2026-03-05T10:00:00.000Z",
      projectValidation: {
        valid: false,
        issues: [
          {
            code: "NODE_COUNT_INVALID",
            message: "Node count must be between 3 and 16.",
            severity: "error"
          }
        ]
      },
      latestRuns: {}
    });

    expect(evaluation.overallStatus).toBe("fail");
    expect(evaluation.summary.failCount).toBeGreaterThanOrEqual(1);
  });

  it("warns when only optional envcheck is missing", () => {
    const pack = getPolicyPackById("baseline-disconnectedops-v1");
    if (!pack) {
      throw new Error("Expected baseline policy pack to exist.");
    }

    const evaluation = evaluatePolicyPack(pack, {
      evaluatedAt: "2026-03-05T10:00:00.000Z",
      projectValidation: {
        valid: true,
        issues: []
      },
      latestRuns: {
        acquire_scan: {
          id: "11111111-1111-4111-8111-111111111111",
          type: "acquire_scan",
          status: "completed",
          startedAt: "2026-03-05T09:00:00.000Z",
          finishedAt: "2026-03-05T09:01:00.000Z",
          requestJson: {
            azureSubscriptionActive: true,
            approvalGranted: true,
            hasRequiredRbac: true,
            understandsNoBypass: true
          }
        },
        netcheck: {
          id: "22222222-2222-4222-8222-222222222222",
          type: "netcheck",
          status: "completed",
          startedAt: "2026-03-05T09:02:00.000Z",
          finishedAt: "2026-03-05T09:03:00.000Z",
          requestJson: {}
        },
        pki_validate: {
          id: "33333333-3333-4333-8333-333333333333",
          type: "pki_validate",
          status: "completed",
          startedAt: "2026-03-05T09:04:00.000Z",
          finishedAt: "2026-03-05T09:05:00.000Z",
          requestJson: {}
        }
      }
    });

    expect(evaluation.overallStatus).toBe("warn");
    expect(evaluation.summary.warnCount).toBe(1);
    expect(evaluation.summary.failCount).toBe(0);
  });

  it("passes when all checks are complete", () => {
    const pack = getPolicyPackById("baseline-disconnectedops-v1");
    if (!pack) {
      throw new Error("Expected baseline policy pack to exist.");
    }

    const evaluation = evaluatePolicyPack(pack, {
      evaluatedAt: "2026-03-05T10:00:00.000Z",
      projectValidation: {
        valid: true,
        issues: []
      },
      latestRuns: {
        acquire_scan: {
          id: "11111111-1111-4111-8111-111111111111",
          type: "acquire_scan",
          status: "completed",
          startedAt: "2026-03-05T09:00:00.000Z",
          finishedAt: "2026-03-05T09:01:00.000Z",
          requestJson: {
            azureSubscriptionActive: true,
            approvalGranted: true,
            hasRequiredRbac: true,
            understandsNoBypass: true
          }
        },
        netcheck: {
          id: "22222222-2222-4222-8222-222222222222",
          type: "netcheck",
          status: "completed",
          startedAt: "2026-03-05T09:02:00.000Z",
          finishedAt: "2026-03-05T09:03:00.000Z",
          requestJson: {}
        },
        pki_validate: {
          id: "33333333-3333-4333-8333-333333333333",
          type: "pki_validate",
          status: "completed",
          startedAt: "2026-03-05T09:04:00.000Z",
          finishedAt: "2026-03-05T09:05:00.000Z",
          requestJson: {}
        },
        envcheck: {
          id: "44444444-4444-4444-8444-444444444444",
          type: "envcheck",
          status: "completed",
          startedAt: "2026-03-05T09:06:00.000Z",
          finishedAt: "2026-03-05T09:07:00.000Z",
          requestJson: {}
        }
      }
    });

    expect(evaluation.overallStatus).toBe("pass");
    expect(evaluation.summary.warnCount).toBe(0);
    expect(evaluation.summary.failCount).toBe(0);
  });
});
