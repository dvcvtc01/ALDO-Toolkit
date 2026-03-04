import type { ProjectWizardInput, RunType, SupportBundleManifest, SupportBundleStatus } from "@aldo/shared";
import { Pool } from "pg";

import { workerConfig } from "../config.js";

const pool = new Pool({
  connectionString: workerConfig.DATABASE_URL
});

export type WorkerProject = {
  id: string;
  ownerUserId: string;
  config: ProjectWizardInput;
  health: "Green" | "Amber" | "Red";
  createdAt: string;
  updatedAt: string;
};

export type WorkerRun = {
  id: string;
  projectId: string;
  type: RunType;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  executedBy: {
    hostname: string;
    username: string;
    runnerVersion: string;
  } | null;
  transcriptText: string | null;
  transcriptLines: Array<Record<string, unknown>>;
  resultJson: unknown;
  artifacts: Array<{
    filename: string;
    relativePath?: string;
    sha256: string;
    sizeBytes: number;
    modifiedAt?: string;
  }>;
  requestJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkerValidationRecord = {
  id: string;
  validationType: string;
  result: unknown;
  createdAt: string;
};

export type WorkerSupportBundle = {
  id: string;
  projectId: string;
  status: SupportBundleStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedByUserId: string | null;
  filePath: string | null;
  fileSize: number | null;
  sha256: string | null;
  manifestJson: SupportBundleManifest | null;
  error: string | null;
};

const toIso = (value: unknown): string => new Date(String(value)).toISOString();

const mapProject = (row: Record<string, unknown>): WorkerProject => ({
  id: String(row.id),
  ownerUserId: String(row.owner_user_id),
  config: row.config as ProjectWizardInput,
  health: row.health as "Green" | "Amber" | "Red",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const mapRun = (row: Record<string, unknown>): WorkerRun => ({
  id: String(row.id),
  projectId: String(row.project_id),
  type: row.type as RunType,
  status: String(row.status),
  startedAt: toIso(row.started_at),
  finishedAt:
    typeof row.finished_at === "string" || row.finished_at instanceof Date ? toIso(row.finished_at) : null,
  executedBy:
    typeof row.executed_by === "object" && row.executed_by
      ? (row.executed_by as {
          hostname: string;
          username: string;
          runnerVersion: string;
        })
      : null,
  transcriptText: typeof row.transcript_text === "string" ? row.transcript_text : null,
  transcriptLines: Array.isArray(row.transcript_lines)
    ? (row.transcript_lines as Array<Record<string, unknown>>)
    : [],
  resultJson: row.result_json ?? null,
  artifacts: (() => {
    if (!Array.isArray(row.artifacts)) {
      return [];
    }

    const artifacts: WorkerRun["artifacts"] = [];
    for (const artifact of row.artifacts) {
      if (typeof artifact !== "object" || artifact === null) {
        continue;
      }

      const record = artifact as Record<string, unknown>;
      if (typeof record.sha256 !== "string") {
        continue;
      }

      const mappedArtifact: WorkerRun["artifacts"][number] = {
        filename:
          typeof record.filename === "string"
            ? record.filename
            : typeof record.relativePath === "string"
              ? record.relativePath.split("/").at(-1) ?? "artifact"
              : "artifact",
        sha256: record.sha256,
        sizeBytes: typeof record.sizeBytes === "number" ? Math.max(0, Math.floor(record.sizeBytes)) : 0
      };

      if (typeof record.relativePath === "string") {
        mappedArtifact.relativePath = record.relativePath;
      }
      if (typeof record.modifiedAt === "string") {
        mappedArtifact.modifiedAt = record.modifiedAt;
      }

      artifacts.push(mappedArtifact);
    }

    return artifacts;
  })(),
  requestJson:
    typeof row.request_json === "object" && row.request_json
      ? (row.request_json as Record<string, unknown>)
      : {},
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const mapValidationRecord = (row: Record<string, unknown>): WorkerValidationRecord => ({
  id: String(row.id),
  validationType: String(row.validation_type),
  result: row.result,
  createdAt: toIso(row.created_at)
});

const mapSupportBundle = (row: Record<string, unknown>): WorkerSupportBundle => ({
  id: String(row.id),
  projectId: String(row.project_id),
  status: row.status as SupportBundleStatus,
  createdAt: toIso(row.created_at),
  startedAt:
    typeof row.started_at === "string" || row.started_at instanceof Date ? toIso(row.started_at) : null,
  finishedAt:
    typeof row.finished_at === "string" || row.finished_at instanceof Date ? toIso(row.finished_at) : null,
  requestedByUserId: typeof row.requested_by_user_id === "string" ? row.requested_by_user_id : null,
  filePath: typeof row.file_path === "string" ? row.file_path : null,
  fileSize:
    typeof row.file_size === "number"
      ? Math.max(0, Math.floor(row.file_size))
      : typeof row.file_size === "string"
        ? (() => {
            const parsed = Number.parseInt(row.file_size, 10);
            return Number.isNaN(parsed) ? null : Math.max(0, parsed);
          })()
        : null,
  sha256: typeof row.sha256 === "string" ? row.sha256 : null,
  manifestJson:
    typeof row.manifest_json === "object" && row.manifest_json
      ? (row.manifest_json as SupportBundleManifest)
      : null,
  error: typeof row.error === "string" ? row.error : null
});

const queryRows = async <T extends Record<string, unknown>>(query: string, params: unknown[] = []) => {
  const result = await pool.query<T>(query, params);
  return result.rows;
};

export const getSupportBundleById = async (bundleId: string): Promise<WorkerSupportBundle | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT *
      FROM support_bundles
      WHERE id = $1
      LIMIT 1
    `,
    [bundleId]
  );

  if (rows.length === 0) {
    return null;
  }
  return mapSupportBundle(rows[0]!);
};

export const getProjectById = async (projectId: string): Promise<WorkerProject | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT *
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [projectId]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapProject(rows[0]!);
};

export const listValidationRecords = async (projectId: string): Promise<WorkerValidationRecord[]> => {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT *
      FROM validation_records
      WHERE project_id = $1
      ORDER BY created_at DESC
    `,
    [projectId]
  );
  return rows.map(mapValidationRecord);
};

export const listLatestCompletedRunsByType = async (
  projectId: string,
  runTypes: RunType[]
): Promise<WorkerRun[]> => {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT *
      FROM runs
      WHERE project_id = $1
        AND status = 'completed'
        AND type = ANY($2::text[])
      ORDER BY started_at DESC
    `,
    [projectId, runTypes]
  );

  const seen = new Set<string>();
  const latest: WorkerRun[] = [];
  for (const row of rows) {
    const type = String(row.type);
    if (seen.has(type)) {
      continue;
    }
    seen.add(type);
    latest.push(mapRun(row));
  }

  return latest;
};

export const markSupportBundleBuilding = async (
  bundleId: string,
  startedAtIso: string
): Promise<WorkerSupportBundle | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `
      UPDATE support_bundles
      SET
        status = 'building',
        started_at = $2::timestamptz,
        error = NULL
      WHERE id = $1
      RETURNING *
    `,
    [bundleId, startedAtIso]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapSupportBundle(rows[0]!);
};

export const markSupportBundleReady = async (
  bundleId: string,
  payload: {
    finishedAtIso: string;
    filePath: string;
    fileSize: number;
    sha256: string;
    manifestJson: SupportBundleManifest;
  }
): Promise<WorkerSupportBundle | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `
      UPDATE support_bundles
      SET
        status = 'ready',
        finished_at = $2::timestamptz,
        file_path = $3,
        file_size = $4::bigint,
        sha256 = $5,
        manifest_json = $6::jsonb,
        error = NULL
      WHERE id = $1
      RETURNING *
    `,
    [bundleId, payload.finishedAtIso, payload.filePath, payload.fileSize, payload.sha256, JSON.stringify(payload.manifestJson)]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapSupportBundle(rows[0]!);
};

export const markSupportBundleFailed = async (
  bundleId: string,
  payload: {
    finishedAtIso: string;
    error: string;
  }
): Promise<WorkerSupportBundle | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `
      UPDATE support_bundles
      SET
        status = 'failed',
        finished_at = $2::timestamptz,
        error = $3
      WHERE id = $1
      RETURNING *
    `,
    [bundleId, payload.finishedAtIso, payload.error]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapSupportBundle(rows[0]!);
};

export const closeWorkerDb = async (): Promise<void> => {
  await pool.end();
};
