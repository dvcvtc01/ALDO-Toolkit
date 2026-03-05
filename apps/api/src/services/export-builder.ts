import {
  buildRunbookMarkdown as buildRunbookMarkdownShared,
  buildValidationReport as buildValidationReportShared,
  type ExportPolicyEvaluationInput,
  type ExportProjectInput,
  type ExportRunInput,
  type ExportValidationRecord
} from "@aldo/shared";

import type { DbPolicyEvaluation, DbProject, DbRun } from "../db/repositories.js";

type ValidationRecord = {
  id: string;
  validationType: string;
  result: unknown;
  createdAt: string;
};

const toSharedProject = (project: DbProject): ExportProjectInput => ({
  id: project.id,
  health: project.health,
  config: {
    name: project.config.name,
    environmentType: project.config.environmentType,
    nodeCountTarget: project.config.nodeCountTarget,
    deploymentModel: project.config.deploymentModel
  }
});

const toSharedValidationRecords = (validations: ValidationRecord[]): ExportValidationRecord[] =>
  validations.map((validation) => ({
    id: validation.id,
    validationType: validation.validationType,
    result: validation.result,
    createdAt: validation.createdAt
  }));

const toSharedRun = (run: DbRun | null): ExportRunInput | null => {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    resultJson: run.resultJson,
    artifacts: run.artifacts.map((artifact) => ({
      filename: artifact.filename,
      ...(artifact.relativePath ? { relativePath: artifact.relativePath } : {}),
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      ...(artifact.modifiedAt ? { modifiedAt: artifact.modifiedAt } : {})
    }))
  };
};

const toSharedPolicyEvaluation = (
  evaluation: DbPolicyEvaluation | null
): ExportPolicyEvaluationInput | null => {
  if (!evaluation) {
    return null;
  }

  return {
    id: evaluation.id,
    createdAt: evaluation.createdAt,
    packId: evaluation.packId,
    packVersion: evaluation.packVersion,
    overallStatus: evaluation.overallStatus,
    evaluation: {
      evaluatedAt: evaluation.evaluation.evaluatedAt,
      summary: evaluation.evaluation.summary
    }
  };
};

export const buildRunbookMarkdown = (
  project: DbProject,
  validations: ValidationRecord[],
  generatedAt: string,
  latestEnvcheckRun: DbRun | null = null,
  latestPolicyEvaluation: DbPolicyEvaluation | null = null
): string =>
  buildRunbookMarkdownShared(
    toSharedProject(project),
    toSharedValidationRecords(validations),
    generatedAt,
    toSharedRun(latestEnvcheckRun),
    toSharedPolicyEvaluation(latestPolicyEvaluation)
  );

export const buildValidationReport = (
  project: DbProject,
  validations: ValidationRecord[],
  generatedAt: string,
  latestEnvcheckRun: DbRun | null = null,
  latestPolicyEvaluation: DbPolicyEvaluation | null = null
) =>
  buildValidationReportShared(
    toSharedProject(project),
    toSharedValidationRecords(validations),
    generatedAt,
    toSharedRun(latestEnvcheckRun),
    toSharedPolicyEvaluation(latestPolicyEvaluation)
  );
