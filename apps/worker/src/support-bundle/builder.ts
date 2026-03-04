import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildChecksumsText,
  buildDeterministicSupportBundleManifest,
  type SupportBundleManifest
} from "@aldo/shared";
import JSZip from "jszip";

import type { WorkerProject, WorkerRun, WorkerValidationRecord } from "./repository.js";

type BundleFileDescriptor = {
  path: string;
  content: string;
};

const normalizePath = (value: string): string => value.replace(/\\/g, "/");

const slugify = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "project";
};

const formatTimestampToken = (isoDate: string): string =>
  isoDate.replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");

const isAbsolutePath = (value: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || /^\/[^/]/.test(value);

const sensitiveKeyPattern = /secret|password|token|passphrase|private.?key|cert(.+)?bundle|pfx/i;

const sanitizeValue = (value: unknown, keyName?: string): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (keyName && sensitiveKeyPattern.test(keyName)) {
      return "[redacted]";
    }
    if (isAbsolutePath(value)) {
      return "[absolute-path-redacted]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, keyName));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, itemValue] of Object.entries(record)) {
      output[key] = sanitizeValue(itemValue, key);
    }
    return output;
  }

  return value;
};

const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

const writeJson = async (filePath: string, payload: unknown): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const writeText = async (filePath: string, text: string): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, "utf8");
};

const collectRelativeFilePaths = async (rootDir: string): Promise<string[]> => {
  const output: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        output.push(normalizePath(path.relative(rootDir, fullPath)));
      }
    }
  };

  await walk(rootDir);
  output.sort((a, b) => a.localeCompare(b, "en"));
  return output;
};

const readFilesForManifest = async (
  rootDir: string,
  relativePaths: string[]
): Promise<Array<{ path: string; content: Buffer }>> =>
  Promise.all(
    relativePaths.map(async (relativePath) => ({
      path: relativePath,
      content: await fs.readFile(path.join(rootDir, relativePath))
    }))
  );

const buildTranscriptText = (run: WorkerRun): string => {
  if (typeof run.transcriptText === "string" && run.transcriptText.trim().length > 0) {
    return run.transcriptText;
  }

  if (Array.isArray(run.transcriptLines) && run.transcriptLines.length > 0) {
    return run.transcriptLines.map((line) => JSON.stringify(line)).join("\n");
  }

  return "";
};

const toRunJson = (run: WorkerRun): Record<string, unknown> => ({
  id: run.id,
  projectId: run.projectId,
  type: run.type,
  status: run.status,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  executedBy: run.executedBy,
  requestJson: sanitizeValue(run.requestJson),
  artifacts: run.artifacts.map((artifact) => ({
    filename: artifact.filename,
    ...(artifact.relativePath ? { relativePath: artifact.relativePath } : {}),
    sha256: artifact.sha256,
    sizeBytes: artifact.sizeBytes,
    ...(artifact.modifiedAt ? { modifiedAt: artifact.modifiedAt } : {})
  }))
});

const toMetadataRunSummary = (run: WorkerRun) => ({
  id: run.id,
  type: run.type,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  status: run.status,
  executionHost: run.executedBy?.hostname ?? null,
  runnerVersion: run.executedBy?.runnerVersion ?? null
});

export type BuildSupportBundleInput = {
  bundleId: string;
  project: WorkerProject;
  validations: WorkerValidationRecord[];
  includedRuns: WorkerRun[];
  runbookMarkdown: string;
  validationReport: unknown;
  generatedAtUtc: string;
  aldoVersion: string;
  outputBaseDir: string;
};

export type BuildSupportBundleResult = {
  bundleRootName: string;
  zipPath: string;
  zipSize: number;
  zipSha256: string;
  manifest: SupportBundleManifest;
  checksumsText: string;
};

export const buildSupportBundle = async (
  input: BuildSupportBundleInput
): Promise<BuildSupportBundleResult> => {
  const projectSlug = slugify(input.project.config.name);
  const bundleRootName = `ALDO_SupportBundle_${projectSlug}_${formatTimestampToken(input.generatedAtUtc)}`;
  const stagingBase = path.join(input.outputBaseDir, "staging");
  const stagingRoot = path.join(stagingBase, bundleRootName);

  await fs.rm(stagingBase, { recursive: true, force: true });
  await ensureDir(stagingRoot);

  const bundleMetadata = {
    schemaVersion: "support-bundle-v1",
    bundleId: input.bundleId,
    projectId: input.project.id,
    projectName: input.project.config.name,
    projectSlug,
    generatedAtUtc: input.generatedAtUtc,
    aldoVersion: input.aldoVersion,
    validationRecordCount: input.validations.length,
    includedRuns: input.includedRuns.map(toMetadataRunSummary)
  };

  const projectSnapshot = sanitizeValue({
    id: input.project.id,
    ownerUserId: input.project.ownerUserId,
    health: input.project.health,
    createdAt: input.project.createdAt,
    updatedAt: input.project.updatedAt,
    config: input.project.config
  });

  const filesToWrite: BundleFileDescriptor[] = [
    {
      path: "bundle-metadata.json",
      content: JSON.stringify(bundleMetadata, null, 2)
    },
    {
      path: "project/project.json",
      content: JSON.stringify(projectSnapshot, null, 2)
    },
    {
      path: "exports/Runbook.md",
      content: input.runbookMarkdown
    },
    {
      path: "exports/validation-report.json",
      content: JSON.stringify(sanitizeValue(input.validationReport), null, 2)
    }
  ];

  for (const run of input.includedRuns) {
    const runBase = `runs/${run.type}/${run.id}`;
    filesToWrite.push({
      path: `${runBase}/run.json`,
      content: JSON.stringify(sanitizeValue(toRunJson(run)), null, 2)
    });
    filesToWrite.push({
      path: `${runBase}/results.json`,
      content: JSON.stringify(sanitizeValue(run.resultJson), null, 2)
    });
    filesToWrite.push({
      path: `${runBase}/transcript.txt`,
      content: buildTranscriptText(run)
    });
  }

  for (const file of filesToWrite) {
    await writeText(path.join(stagingRoot, file.path), file.content);
  }

  const manifestTargetPaths = (await collectRelativeFilePaths(stagingRoot)).filter(
    (relativePath) => relativePath !== "manifest.json" && relativePath !== "checksums.txt"
  );
  const manifestInputFiles = await readFilesForManifest(stagingRoot, manifestTargetPaths);
  const manifest = buildDeterministicSupportBundleManifest(
    manifestInputFiles.map((file) => ({
      path: file.path,
      content: file.content
    })),
    input.generatedAtUtc
  );
  await writeJson(path.join(stagingRoot, "manifest.json"), manifest);

  const checksumTargetPaths = (await collectRelativeFilePaths(stagingRoot)).filter(
    (relativePath) => relativePath !== "checksums.txt"
  );
  const checksumFiles = await readFilesForManifest(stagingRoot, checksumTargetPaths);
  const checksumManifest = buildDeterministicSupportBundleManifest(
    checksumFiles.map((file) => ({
      path: file.path,
      content: file.content
    })),
    input.generatedAtUtc
  );
  const checksumsText = buildChecksumsText(checksumManifest.files);
  await writeText(path.join(stagingRoot, "checksums.txt"), checksumsText);

  const zipFilePaths = await collectRelativeFilePaths(stagingBase);
  const zip = new JSZip();
  for (const relativePath of zipFilePaths) {
    const absolutePath = path.join(stagingBase, relativePath);
    const fileBuffer = await fs.readFile(absolutePath);
    zip.file(normalizePath(relativePath), fileBuffer, { date: new Date(0) });
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });
  const zipPath = path.join(input.outputBaseDir, "bundle.zip");
  await ensureDir(path.dirname(zipPath));
  await fs.writeFile(zipPath, zipBuffer);

  const zipSha256 = createHash("sha256").update(zipBuffer).digest("hex");

  return {
    bundleRootName,
    zipPath,
    zipSize: zipBuffer.byteLength,
    zipSha256,
    manifest,
    checksumsText
  };
};
