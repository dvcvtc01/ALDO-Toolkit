import type { DbProject, DbRun } from "../db/repositories.js";

type ValidationRecord = {
  id: string;
  validationType: string;
  result: unknown;
  createdAt: string;
};

export const buildRunbookMarkdown = (
  project: DbProject,
  validations: ValidationRecord[],
  generatedAt: string,
  latestEnvcheckRun: DbRun | null = null
): string => {
  const envcheck = summarizeEnvcheckRun(latestEnvcheckRun);
  const sectionLines = validations.map((validation, index) => {
    const payload = JSON.stringify(validation.result, null, 2);
    return [
      `### ${index + 1}. ${validation.validationType}`,
      `- Record: \`${validation.id}\``,
      `- Created: ${validation.createdAt}`,
      "```json",
      payload,
      "```"
    ].join("\n");
  });

  return [
    "# ALDO Toolkit Runbook",
    "",
    "## Project Context",
    `- Project ID: \`${project.id}\``,
    `- Project Name: ${project.config.name}`,
    `- Environment Type: ${project.config.environmentType}`,
    `- Node Count Target: ${project.config.nodeCountTarget}`,
    `- Deployment Model: ${project.config.deploymentModel}`,
    `- Generated At: ${generatedAt}`,
    "",
    "## Non-negotiable Controls",
    "- Acquisition requires active Azure subscription, approval, and RBAC.",
    "- Toolkit does not bypass Microsoft control-plane requirements.",
    "- Disconnected operations management instance is physical-machine only (3-16 nodes).",
    "- PKI requires 24 external certs on a shared trust chain; no self-signed certs.",
    "- Network requires ingress IP on management pool and external 443 routing.",
    "- Update flow is documented and must be followed exactly.",
    "",
    "## Validation Records",
    ...(sectionLines.length > 0 ? sectionLines : ["No validation records have been captured yet."]),
    "",
    "## Environment Checker (Latest)",
    `- Available: ${envcheck.available ? "yes" : "no"}`,
    `- Run ID: ${envcheck.runId ?? "n/a"}`,
    `- Started: ${envcheck.startedAt ?? "n/a"}`,
    `- Finished: ${envcheck.finishedAt ?? "n/a"}`,
    `- Status: ${envcheck.status}`,
    `- Summary: ${envcheck.overall}`,
    `- Top Failures: ${envcheck.topFailures.length > 0 ? envcheck.topFailures.join(" | ") : "none"}`,
    `- Artifacts: ${envcheck.artifactMetadata.length}`,
    ...envcheck.artifactMetadata.map(
      (artifact, index) =>
        `  - ${index + 1}. ${artifact.filename} (${artifact.sizeBytes} bytes, sha256=${artifact.sha256})`
    ),
    "",
    "## Update Process Checklist",
    "1. Stage update zip package.",
    "2. Import OperationsModule on the execution host.",
    "3. Upload update package and wait for staging completion.",
    "4. Export BitLocker keys and archive evidence.",
    "",
    "## Log Collection Modes",
    "- Direct: API receives raw logs and stores support bundle.",
    "- Indirect: Runner stages logs and forwards summarized bundle.",
    "- Fallback: Minimal connectivity mode with deferred upload."
  ].join("\n");
};

const parseOverallState = (value: unknown): "Green" | "Amber" | "Red" | "Unknown" => {
  if (typeof value !== "string") {
    return "Unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "green" || normalized === "pass" || normalized === "passed") {
    return "Green";
  }
  if (normalized === "amber" || normalized === "warning" || normalized === "warn") {
    return "Amber";
  }
  if (normalized === "red" || normalized === "fail" || normalized === "failed" || normalized === "error") {
    return "Red";
  }
  return "Unknown";
};

const summarizeEnvcheckRun = (run: DbRun | null) => {
  if (!run) {
    return {
      available: false,
      runId: null as string | null,
      startedAt: null as string | null,
      finishedAt: null as string | null,
      status: "not_run",
      overall: "Unknown" as "Green" | "Amber" | "Red" | "Unknown",
      topFailures: [] as string[],
      keyErrors: [] as string[],
      artifactMetadata: [] as Array<{
        filename: string;
        relativePath?: string;
        sha256: string;
        sizeBytes: number;
        modifiedAt?: string;
      }>
    };
  }

  const resultRecord =
    typeof run.resultJson === "object" && run.resultJson !== null
      ? (run.resultJson as Record<string, unknown>)
      : {};
  const summaryRecord =
    typeof resultRecord.summary === "object" && resultRecord.summary !== null
      ? (resultRecord.summary as Record<string, unknown>)
      : {};

  const topFailures = Array.isArray(summaryRecord.topFailures)
    ? summaryRecord.topFailures
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }
          if (typeof entry === "object" && entry !== null) {
            const record = entry as Record<string, unknown>;
            const category =
              typeof record.category === "string" && record.category.trim().length > 0
                ? record.category
                : "General";
            const checkName =
              typeof record.name === "string" && record.name.trim().length > 0 ? record.name : "check";
            const message =
              typeof record.message === "string" && record.message.trim().length > 0
                ? record.message
                : "failed";
            return `${category}/${checkName}: ${message}`;
          }
          return null;
        })
        .filter((entry): entry is string => Boolean(entry))
    : [];

  const keyErrors = Array.isArray(summaryRecord.keyErrors)
    ? summaryRecord.keyErrors.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    available: true,
    runId: run.id,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    overall: parseOverallState(summaryRecord.overall ?? summaryRecord.overallState ?? run.status),
    topFailures,
    keyErrors,
    artifactMetadata: run.artifacts.map((artifact) => ({
      filename: artifact.filename || artifact.relativePath || "artifact",
      ...(artifact.relativePath ? { relativePath: artifact.relativePath } : {}),
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      ...(artifact.modifiedAt ? { modifiedAt: artifact.modifiedAt } : {})
    }))
  };
};

export const buildValidationReport = (
  project: DbProject,
  validations: ValidationRecord[],
  generatedAt: string,
  latestEnvcheckRun: DbRun | null = null
) => ({
  schemaVersion: "1.0",
  generatedAt,
  project: {
    id: project.id,
    name: project.config.name,
    health: project.health,
    environmentType: project.config.environmentType
  },
  envcheck: summarizeEnvcheckRun(latestEnvcheckRun),
  validations
});
