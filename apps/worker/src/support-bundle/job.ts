import fs from "node:fs/promises";
import path from "node:path";

import { buildRunbookMarkdown, buildValidationReport, type RunType } from "@aldo/shared";
import type { Logger } from "pino";

import { workerConfig } from "../config.js";
import { buildSupportBundle } from "./builder.js";
import {
  getLatestPolicyEvaluation,
  getProjectById,
  getSupportBundleById,
  listLatestCompletedRunsByType,
  listValidationRecords,
  markSupportBundleBuilding,
  markSupportBundleFailed,
  markSupportBundleReady
} from "./repository.js";

const supportedRunTypesForBundle: RunType[] = [
  "acquire_scan",
  "netcheck",
  "pki_validate",
  "envcheck"
];

const getAldoVersion = async (): Promise<string> => {
  try {
    const packageJsonPath = new URL("../../../../package.json", import.meta.url);
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { version?: unknown };
    if (typeof packageJson.version === "string" && packageJson.version.trim().length > 0) {
      return packageJson.version;
    }
  } catch {
    // fallback to configured default
  }

  return workerConfig.ALDO_VERSION;
};

export const processSupportBundleBuildJob = async (
  bundleId: string,
  logger: Logger
): Promise<{
  bundleId: string;
  status: "ready";
  zipPath: string;
  zipSize: number;
  sha256: string;
}> => {
  const bundle = await getSupportBundleById(bundleId);
  if (!bundle) {
    throw new Error(`Support bundle ${bundleId} was not found.`);
  }

  const startedAtIso = new Date().toISOString();
  await markSupportBundleBuilding(bundle.id, startedAtIso);

  try {
    const project = await getProjectById(bundle.projectId);
    if (!project) {
      throw new Error(`Project ${bundle.projectId} was not found.`);
    }

    const [validations, latestRuns, latestPolicyEvaluation, aldoVersion] = await Promise.all([
      listValidationRecords(project.id),
      listLatestCompletedRunsByType(project.id, supportedRunTypesForBundle),
      getLatestPolicyEvaluation(project.id),
      getAldoVersion()
    ]);

    const latestEnvcheckRun = latestRuns.find((run) => run.type === "envcheck") ?? null;
    const generatedAtUtc = new Date().toISOString();
    const runbook = buildRunbookMarkdown(
      project,
      validations,
      generatedAtUtc,
      latestEnvcheckRun,
      latestPolicyEvaluation
    );
    const validationReport = buildValidationReport(
      project,
      validations,
      generatedAtUtc,
      latestEnvcheckRun,
      latestPolicyEvaluation
    );

    const outputBaseDir = path.join(workerConfig.DATA_DIR, "support-bundles", project.id, bundle.id);
    const builtBundle = await buildSupportBundle({
      bundleId: bundle.id,
      project,
      validations,
      includedRuns: latestRuns,
      runbookMarkdown: runbook,
      validationReport,
      generatedAtUtc,
      aldoVersion,
      outputBaseDir
    });

    const finishedAtIso = new Date().toISOString();
    await markSupportBundleReady(bundle.id, {
      finishedAtIso,
      filePath: builtBundle.zipPath,
      fileSize: builtBundle.zipSize,
      sha256: builtBundle.zipSha256,
      manifestJson: builtBundle.manifest
    });

    logger.info(
      {
        bundleId: bundle.id,
        projectId: project.id,
        zipPath: builtBundle.zipPath,
        zipSize: builtBundle.zipSize
      },
      "Support bundle built"
    );

    return {
      bundleId: bundle.id,
      status: "ready",
      zipPath: builtBundle.zipPath,
      zipSize: builtBundle.zipSize,
      sha256: builtBundle.zipSha256
    };
  } catch (error) {
    const finishedAtIso = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : "Support bundle job failed.";
    await markSupportBundleFailed(bundle.id, {
      finishedAtIso,
      error: errorMessage
    });
    throw error;
  }
};
