import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import { buildSupportBundle } from "../src/support-bundle/builder.js";
import type { WorkerProject, WorkerRun, WorkerValidationRecord } from "../src/support-bundle/repository.js";

const tmpDirs: string[] = [];

const createProject = (): WorkerProject => ({
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  config: {
    name: "Demo Project",
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
  createdAt: "2026-03-04T09:00:00.000Z",
  updatedAt: "2026-03-04T09:00:00.000Z"
});

const createRuns = (): WorkerRun[] => [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    projectId: "11111111-1111-4111-8111-111111111111",
    type: "acquire_scan",
    status: "completed",
    startedAt: "2026-03-04T09:05:00.000Z",
    finishedAt: "2026-03-04T09:06:00.000Z",
    executedBy: {
      hostname: "HOST01",
      username: "operator",
      runnerVersion: "0.4.0"
    },
    transcriptText: "acquire transcript",
    transcriptLines: [],
    resultJson: {
      valid: true,
      root: "C:\\artifacts",
      matchedArtifact: {
        relativePath: "payload/update.zip"
      }
    },
    artifacts: [],
    requestJson: {
      providedArtifactRoot: "C:\\artifacts"
    },
    createdAt: "2026-03-04T09:05:00.000Z",
    updatedAt: "2026-03-04T09:06:00.000Z"
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    projectId: "11111111-1111-4111-8111-111111111111",
    type: "netcheck",
    status: "completed",
    startedAt: "2026-03-04T09:10:00.000Z",
    finishedAt: "2026-03-04T09:11:00.000Z",
    executedBy: {
      hostname: "HOST02",
      username: "operator",
      runnerVersion: "0.4.0"
    },
    transcriptText: "netcheck transcript",
    transcriptLines: [],
    resultJson: {
      valid: true
    },
    artifacts: [],
    requestJson: {},
    createdAt: "2026-03-04T09:10:00.000Z",
    updatedAt: "2026-03-04T09:11:00.000Z"
  }
];

const createValidations = (): WorkerValidationRecord[] => [
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    validationType: "project",
    result: { valid: true },
    createdAt: "2026-03-04T09:00:00.000Z"
  }
];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

describe("buildSupportBundle", () => {
  it("writes expected bundle structure into zip", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aldo-support-bundle-test-"));
    tmpDirs.push(tempDir);

    const result = await buildSupportBundle({
      bundleId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      project: createProject(),
      validations: createValidations(),
      includedRuns: createRuns(),
      runbookMarkdown: "# Runbook",
      validationReport: { schemaVersion: "1.0" },
      generatedAtUtc: "2026-03-04T10:00:00.000Z",
      aldoVersion: "0.4.0",
      outputBaseDir: tempDir
    });

    expect(result.zipSize).toBeGreaterThan(0);
    expect(result.zipSha256).toMatch(/^[a-f0-9]{64}$/);

    const zipBuffer = await fs.readFile(result.zipPath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const zipPaths = Object.keys(zip.files).sort();

    const root = "ALDO_SupportBundle_demo-project_20260304T100000Z/";
    expect(zipPaths).toContain(`${root}bundle-metadata.json`);
    expect(zipPaths).toContain(`${root}manifest.json`);
    expect(zipPaths).toContain(`${root}checksums.txt`);
    expect(zipPaths).toContain(`${root}project/project.json`);
    expect(zipPaths).toContain(`${root}exports/Runbook.md`);
    expect(zipPaths).toContain(`${root}exports/validation-report.json`);
    expect(zipPaths).toContain(`${root}runs/acquire_scan/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run.json`);
    expect(zipPaths).toContain(`${root}runs/acquire_scan/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/results.json`);
    expect(zipPaths).toContain(
      `${root}runs/acquire_scan/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transcript.txt`
    );
  });
});
