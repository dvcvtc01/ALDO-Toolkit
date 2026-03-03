import { randomUUID } from "node:crypto";

import type { ProjectWizardInput, Role } from "@aldo/shared";
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
