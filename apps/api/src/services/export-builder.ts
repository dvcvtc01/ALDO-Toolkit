import type { DbProject } from "../db/repositories.js";

type ValidationRecord = {
  id: string;
  validationType: string;
  result: unknown;
  createdAt: string;
};

export const buildRunbookMarkdown = (
  project: DbProject,
  validations: ValidationRecord[],
  generatedAt: string
): string => {
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

export const buildValidationReport = (project: DbProject, validations: ValidationRecord[], generatedAt: string) => ({
  schemaVersion: "1.0",
  generatedAt,
  project: {
    id: project.id,
    name: project.config.name,
    health: project.health,
    environmentType: project.config.environmentType
  },
  validations
});
