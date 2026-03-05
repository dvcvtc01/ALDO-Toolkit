import { describe, expect, it } from "vitest";

import type { DbPolicyEvaluation, DbProject, DbRun } from "../src/db/repositories.js";
import { buildRunbookMarkdown, buildValidationReport } from "../src/services/export-builder.js";

const createProject = (): DbProject => ({
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  config: {
    name: "demo",
    environmentType: "air-gapped",
    deploymentModel: "physical",
    domainName: "corp.example.com",
    dnsServers: ["10.10.0.10"],
    nodeCountTarget: 3,
    managementIpPool: "10.20.0.10-10.20.0.50",
    ingressIp: "10.20.0.20",
    deploymentRange: "10.30.0.0/24",
    containerNetworkRange: "10.40.0.0/24",
    identityProviderHost: "adfs.corp.example.com",
    ingressEndpoints: [{ name: "portal", fqdn: "portal.corp.example.com" }],
    description: "demo",
    notes: "demo"
  },
  health: "Amber",
  createdAt: "2026-03-03T10:00:00.000Z",
  updatedAt: "2026-03-03T10:00:00.000Z"
});

const createEnvcheckRun = (): DbRun => ({
  id: "33333333-3333-4333-8333-333333333333",
  projectId: "11111111-1111-4111-8111-111111111111",
  type: "envcheck",
  status: "completed",
  startedAt: "2026-03-03T10:15:00.000Z",
  finishedAt: "2026-03-03T10:20:00.000Z",
  executedBy: {
    hostname: "HOST01",
    username: "operator",
    runnerVersion: "0.4.0"
  },
  transcriptText: "sample transcript",
  transcriptLines: [],
  resultJson: {
    summary: {
      overall: "Red",
      topFailures: [{ category: "Network", name: "DNS", message: "Endpoint resolution failed" }],
      keyErrors: ["Endpoint resolution failed"]
    }
  },
  artifacts: [
    {
      filename: "summary.json",
      relativePath: "summary.json",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sizeBytes: 256,
      modifiedAt: "2026-03-03T10:20:00.000Z"
    }
  ],
  requestJson: {},
  createdBy: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-03-03T10:15:00.000Z",
  updatedAt: "2026-03-03T10:20:00.000Z"
});

const createPolicyEvaluation = (): DbPolicyEvaluation => ({
  id: "44444444-4444-4444-8444-444444444444",
  projectId: "11111111-1111-4111-8111-111111111111",
  packId: "baseline-disconnectedops-v1",
  packVersion: "1.0.0",
  overallStatus: "warn",
  evaluation: {
    packId: "baseline-disconnectedops-v1",
    packVersion: "1.0.0",
    evaluatedAt: "2026-03-03T10:25:00.000Z",
    overallStatus: "warn",
    summary: {
      total: 6,
      passCount: 5,
      warnCount: 1,
      failCount: 0
    },
    checks: [
      {
        key: "RUN_ENVCHECK_COMPLETED",
        severity: "warning",
        status: "warn",
        message: "No envcheck run evidence found."
      }
    ]
  },
  createdBy: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-03-03T10:25:00.000Z"
});

describe("export builder", () => {
  it("includes envcheck summary and artifacts in validation report", () => {
    const report = buildValidationReport(createProject(), [], "2026-03-03T10:30:00.000Z", createEnvcheckRun());
    const envcheck = report.envcheck as {
      available: boolean;
      overall: string;
      topFailures: string[];
      artifactMetadata: Array<{ filename: string }>;
    };

    expect(envcheck.available).toBe(true);
    expect(envcheck.overall).toBe("Red");
    expect(envcheck.topFailures[0]).toContain("Network/DNS");
    expect(envcheck.artifactMetadata[0]?.filename).toBe("summary.json");
  });

  it("renders envcheck block in runbook", () => {
    const markdown = buildRunbookMarkdown(createProject(), [], "2026-03-03T10:30:00.000Z", createEnvcheckRun());

    expect(markdown).toContain("## Environment Checker (Latest)");
    expect(markdown).toContain("Summary: Red");
    expect(markdown).toContain("summary.json");
  });

  it("includes latest policy summary in report", () => {
    const report = buildValidationReport(
      createProject(),
      [],
      "2026-03-03T10:30:00.000Z",
      createEnvcheckRun(),
      createPolicyEvaluation()
    );
    const policy = report.policyEvaluation as {
      packId: string;
      overallStatus: string;
      evaluation: {
        summary: {
          warnCount: number;
        };
      };
    };

    expect(policy.packId).toBe("baseline-disconnectedops-v1");
    expect(policy.overallStatus).toBe("warn");
    expect(policy.evaluation.summary.warnCount).toBe(1);
  });
});
