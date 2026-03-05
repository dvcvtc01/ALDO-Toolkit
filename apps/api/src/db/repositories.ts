import { randomUUID } from "node:crypto";

import type {
  PolicyEvaluation,
  ProjectWizardInput,
  Role,
  RunStatus,
  RunType,
  SupportBundleManifest,
  SupportBundleStatus
} from "@aldo/shared";
import { type PoolClient } from "pg";

import { pool } from "./client.js";

export type DbUser = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
};

export type DbProject = {
  id: string;
  ownerUserId: string;
  config: ProjectWizardInput;
  health: "Green" | "Amber" | "Red";
  createdAt: string;
  updatedAt: string;
};

export type DbRun = {
  id: string;
  projectId: string;
  type: RunType;
  status: RunStatus;
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
    relativePath?: string | undefined;
    sha256: string;
    sizeBytes: number;
    modifiedAt?: string | undefined;
  }>;
  requestJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbSupportBundle = {
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

export type DbPolicyEvaluation = {
  id: string;
  projectId: string;
  packId: string;
  packVersion: string;
  overallStatus: "pass" | "warn" | "fail";
  evaluation: PolicyEvaluation;
  createdBy: string | null;
  createdAt: string;
};

const mapUser = (row: Record<string, unknown>): DbUser => ({
  id: String(row.id),
  username: String(row.username),
  displayName: String(row.display_name),
  passwordHash: String(row.password_hash),
  role: row.role as Role,
  createdAt: new Date(String(row.created_at)).toISOString()
});

const mapProject = (row: Record<string, unknown>): DbProject => ({
  id: String(row.id),
  ownerUserId: String(row.owner_user_id),
  config: row.config as ProjectWizardInput,
  health: row.health as "Green" | "Amber" | "Red",
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const mapRunArtifacts = (value: unknown): DbRun["artifacts"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const artifacts: DbRun["artifacts"] = [];
  for (const artifact of value) {
    if (typeof artifact !== "object" || artifact === null) {
      continue;
    }

    const record = artifact as Record<string, unknown>;
    if (typeof record.sha256 !== "string") {
      continue;
    }

    const filename =
      typeof record.filename === "string"
        ? record.filename
        : typeof record.relativePath === "string"
          ? record.relativePath.split("/").at(-1) ?? "artifact"
          : "artifact";

    const mappedArtifact: DbRun["artifacts"][number] = {
      filename,
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
};

const mapRun = (row: Record<string, unknown>): DbRun => ({
  id: String(row.id),
  projectId: String(row.project_id),
  type: row.type as RunType,
  status: row.status as RunStatus,
  startedAt: new Date(String(row.started_at)).toISOString(),
  finishedAt:
    typeof row.finished_at === "string" || row.finished_at instanceof Date
      ? new Date(row.finished_at).toISOString()
      : null,
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
  artifacts: mapRunArtifacts(row.artifacts),
  requestJson:
    typeof row.request_json === "object" && row.request_json
      ? (row.request_json as Record<string, unknown>)
      : {},
  createdBy: typeof row.created_by === "string" ? row.created_by : null,
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const mapSupportBundle = (row: Record<string, unknown>): DbSupportBundle => ({
  id: String(row.id),
  projectId: String(row.project_id),
  status: row.status as SupportBundleStatus,
  createdAt: new Date(String(row.created_at)).toISOString(),
  startedAt:
    typeof row.started_at === "string" || row.started_at instanceof Date
      ? new Date(row.started_at).toISOString()
      : null,
  finishedAt:
    typeof row.finished_at === "string" || row.finished_at instanceof Date
      ? new Date(row.finished_at).toISOString()
      : null,
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

const mapPolicyEvaluation = (row: Record<string, unknown>): DbPolicyEvaluation => ({
  id: String(row.id),
  projectId: String(row.project_id),
  packId: String(row.pack_id),
  packVersion: String(row.pack_version),
  overallStatus: row.overall_status as "pass" | "warn" | "fail",
  evaluation: row.evaluation_json as PolicyEvaluation,
  createdBy: typeof row.created_by === "string" ? row.created_by : null,
  createdAt: new Date(String(row.created_at)).toISOString()
});

const exec = async <T>(
  client: PoolClient | undefined,
  query: string,
  params: unknown[] = []
): Promise<T[]> => {
  const executor = client ?? pool;
  const result = await executor.query(query, params);
  return result.rows as T[];
};

export const countUsers = async (): Promise<number> => {
  const rows = await exec<{ count: string }>(undefined, "SELECT COUNT(*)::text AS count FROM users");
  return Number.parseInt(rows[0]?.count ?? "0", 10);
};

export const getUserByUsername = async (username: string): Promise<DbUser | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM users WHERE username = $1",
    [username]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapUser(rows[0]!);
};

export const getUserById = async (id: string): Promise<DbUser | null> => {
  const rows = await exec<Record<string, unknown>>(undefined, "SELECT * FROM users WHERE id = $1", [id]);
  if (rows.length === 0) {
    return null;
  }
  return mapUser(rows[0]!);
};

export const listUsers = async (): Promise<DbUser[]> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM users ORDER BY created_at ASC",
    []
  );
  return rows.map(mapUser);
};

export const createUser = async (
  values: {
    username: string;
    displayName: string;
    passwordHash: string;
    role: Role;
  },
  client?: PoolClient
): Promise<DbUser> => {
  const id = randomUUID();
  const rows = await exec<Record<string, unknown>>(
    client,
    `
      INSERT INTO users (id, username, display_name, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [id, values.username, values.displayName, values.passwordHash, values.role]
  );
  return mapUser(rows[0]!);
};

export const createProject = async (
  ownerUserId: string,
  config: ProjectWizardInput,
  health: "Green" | "Amber" | "Red"
): Promise<DbProject> => {
  const id = randomUUID();
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      INSERT INTO projects (id, owner_user_id, config, health)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING *
    `,
    [id, ownerUserId, JSON.stringify(config), health]
  );
  return mapProject(rows[0]!);
};

export const listProjects = async (): Promise<DbProject[]> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM projects ORDER BY created_at DESC",
    []
  );
  return rows.map(mapProject);
};

export const getProjectById = async (projectId: string): Promise<DbProject | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM projects WHERE id = $1 LIMIT 1",
    [projectId]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapProject(rows[0]!);
};

export const updateProject = async (
  projectId: string,
  config: ProjectWizardInput,
  health: "Green" | "Amber" | "Red"
): Promise<DbProject | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      UPDATE projects
      SET config = $2::jsonb, health = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [projectId, JSON.stringify(config), health]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapProject(rows[0]!);
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
  const rows = await exec<{ id: string }>(
    undefined,
    "DELETE FROM projects WHERE id = $1 RETURNING id",
    [projectId]
  );
  return rows.length > 0;
};

export const insertAcquisitionRecord = async (
  projectId: string,
  createdBy: string,
  payload: unknown
): Promise<string> => {
  const id = randomUUID();
  await exec(
    undefined,
    `
      INSERT INTO acquisition_records (id, project_id, created_by, payload)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [id, projectId, createdBy, JSON.stringify(payload)]
  );
  return id;
};

export const insertValidationRecord = async (
  projectId: string,
  validationType: string,
  createdBy: string | null,
  payload: unknown,
  result: unknown
): Promise<string> => {
  const id = randomUUID();
  await exec(
    undefined,
    `
      INSERT INTO validation_records (id, project_id, validation_type, created_by, payload, result)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    `,
    [id, projectId, validationType, createdBy, JSON.stringify(payload), JSON.stringify(result)]
  );
  return id;
};

export const listValidationRecords = async (projectId: string): Promise<
  Array<{
    id: string;
    validationType: string;
    payload: unknown;
    result: unknown;
    createdAt: string;
  }>
> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM validation_records WHERE project_id = $1 ORDER BY created_at DESC",
    [projectId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    validationType: String(row.validation_type),
    payload: row.payload,
    result: row.result,
    createdAt: new Date(String(row.created_at)).toISOString()
  }));
};

export const insertExportRecord = async (
  projectId: string,
  createdBy: string,
  runbookMd: string,
  validationReport: unknown
): Promise<string> => {
  const id = randomUUID();
  await exec(
    undefined,
    `
      INSERT INTO exports (id, project_id, created_by, runbook_md, validation_report)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [id, projectId, createdBy, runbookMd, JSON.stringify(validationReport)]
  );
  return id;
};

export const listExports = async (projectId: string): Promise<
  Array<{
    id: string;
    runbookMd: string;
    validationReport: unknown;
    createdAt: string;
  }>
> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM exports WHERE project_id = $1 ORDER BY created_at DESC",
    [projectId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    runbookMd: String(row.runbook_md),
    validationReport: row.validation_report,
    createdAt: new Date(String(row.created_at)).toISOString()
  }));
};

export const createRun = async (
  projectId: string,
  type: RunType,
  requestJson: Record<string, unknown>,
  createdBy: string | null
): Promise<DbRun> => {
  const id = randomUUID();
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      INSERT INTO runs (
        id, project_id, type, status, started_at, request_json, created_by
      )
      VALUES ($1, $2, $3, 'requested', NOW(), $4::jsonb, $5)
      RETURNING *
    `,
    [id, projectId, type, JSON.stringify(requestJson), createdBy]
  );
  return mapRun(rows[0]!);
};

export const listRunsByProject = async (
  projectId: string,
  filters: {
    type?: RunType;
    status?: RunStatus;
  } = {}
): Promise<DbRun[]> => {
  const where: string[] = ["project_id = $1"];
  const params: unknown[] = [projectId];
  let index = 2;

  if (filters.type) {
    where.push(`type = $${index}`);
    params.push(filters.type);
    index++;
  }

  if (filters.status) {
    where.push(`status = $${index}`);
    params.push(filters.status);
  }

  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      SELECT * FROM runs
      WHERE ${where.join(" AND ")}
      ORDER BY started_at DESC
    `,
    params
  );
  return rows.map(mapRun);
};

export const getRunById = async (runId: string): Promise<DbRun | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM runs WHERE id = $1 LIMIT 1",
    [runId]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapRun(rows[0]!);
};

export const submitRunEvidence = async (
  runId: string,
  payload: {
    status: RunStatus;
    startedAt?: string;
    finishedAt?: string;
    executedBy: {
      hostname: string;
      username: string;
      runnerVersion: string;
    };
    transcriptText?: string;
    transcriptLines: Array<Record<string, unknown>>;
    resultJson: unknown;
    artifacts: Array<{
      filename: string;
      relativePath?: string | undefined;
      sha256: string;
      sizeBytes: number;
      modifiedAt?: string | undefined;
    }>;
  }
): Promise<DbRun | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      UPDATE runs
      SET
        status = $2,
        started_at = COALESCE($3::timestamptz, started_at),
        finished_at = $4::timestamptz,
        executed_by = $5::jsonb,
        transcript_text = $6,
        transcript_lines = $7::jsonb,
        result_json = $8::jsonb,
        artifacts = $9::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      runId,
      payload.status,
      payload.startedAt ?? null,
      payload.finishedAt ?? null,
      JSON.stringify(payload.executedBy),
      payload.transcriptText ?? null,
      JSON.stringify(payload.transcriptLines),
      JSON.stringify(payload.resultJson),
      JSON.stringify(payload.artifacts)
    ]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapRun(rows[0]!);
};

export const createSupportBundle = async (
  projectId: string,
  requestedByUserId: string | null
): Promise<DbSupportBundle> => {
  const id = randomUUID();
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      INSERT INTO support_bundles (
        id, project_id, status, requested_by_user_id
      )
      VALUES ($1, $2, 'queued', $3)
      RETURNING *
    `,
    [id, projectId, requestedByUserId]
  );
  return mapSupportBundle(rows[0]!);
};

export const listSupportBundlesByProject = async (projectId: string): Promise<DbSupportBundle[]> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      SELECT *
      FROM support_bundles
      WHERE project_id = $1
      ORDER BY created_at DESC
    `,
    [projectId]
  );
  return rows.map(mapSupportBundle);
};

export const getSupportBundleById = async (bundleId: string): Promise<DbSupportBundle | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
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

export const updateSupportBundleStatus = async (
  bundleId: string,
  payload: {
    status: SupportBundleStatus;
    startedAt?: string | null;
    finishedAt?: string | null;
    filePath?: string | null;
    fileSize?: number | null;
    sha256?: string | null;
    manifestJson?: SupportBundleManifest | null;
    error?: string | null;
  }
): Promise<DbSupportBundle | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      UPDATE support_bundles
      SET
        status = $2,
        started_at = COALESCE($3::timestamptz, started_at),
        finished_at = COALESCE($4::timestamptz, finished_at),
        file_path = COALESCE($5, file_path),
        file_size = COALESCE($6::bigint, file_size),
        sha256 = COALESCE($7, sha256),
        manifest_json = COALESCE($8::jsonb, manifest_json),
        error = $9
      WHERE id = $1
      RETURNING *
    `,
    [
      bundleId,
      payload.status,
      payload.startedAt ?? null,
      payload.finishedAt ?? null,
      payload.filePath ?? null,
      payload.fileSize ?? null,
      payload.sha256 ?? null,
      payload.manifestJson ? JSON.stringify(payload.manifestJson) : null,
      payload.error ?? null
    ]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapSupportBundle(rows[0]!);
};

export const insertRunLog = async (
  projectId: string,
  mode: "direct" | "indirect" | "fallback",
  payload: unknown,
  supportBundle: unknown
): Promise<string> => {
  const id = randomUUID();
  await exec(
    undefined,
    `
      INSERT INTO run_logs (id, project_id, mode, payload, support_bundle)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
    `,
    [id, projectId, mode, JSON.stringify(payload), JSON.stringify(supportBundle)]
  );
  return id;
};

export const insertPolicyEvaluation = async (
  projectId: string,
  createdBy: string | null,
  evaluation: PolicyEvaluation
): Promise<DbPolicyEvaluation> => {
  const id = randomUUID();
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      INSERT INTO policy_evaluations (
        id, project_id, pack_id, pack_version, overall_status, evaluation_json, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING *
    `,
    [
      id,
      projectId,
      evaluation.packId,
      evaluation.packVersion,
      evaluation.overallStatus,
      JSON.stringify(evaluation),
      createdBy
    ]
  );
  return mapPolicyEvaluation(rows[0]!);
};

export const listPolicyEvaluations = async (projectId: string): Promise<DbPolicyEvaluation[]> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      SELECT *
      FROM policy_evaluations
      WHERE project_id = $1
      ORDER BY created_at DESC
    `,
    [projectId]
  );
  return rows.map(mapPolicyEvaluation);
};

export const getLatestPolicyEvaluation = async (projectId: string): Promise<DbPolicyEvaluation | null> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    `
      SELECT *
      FROM policy_evaluations
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [projectId]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapPolicyEvaluation(rows[0]!);
};

export const listRunLogs = async (projectId: string): Promise<
  Array<{
    id: string;
    mode: "direct" | "indirect" | "fallback";
    payload: unknown;
    supportBundle: unknown;
    createdAt: string;
  }>
> => {
  const rows = await exec<Record<string, unknown>>(
    undefined,
    "SELECT * FROM run_logs WHERE project_id = $1 ORDER BY created_at DESC",
    [projectId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    mode: row.mode as "direct" | "indirect" | "fallback",
    payload: row.payload,
    supportBundle: row.support_bundle,
    createdAt: new Date(String(row.created_at)).toISOString()
  }));
};
