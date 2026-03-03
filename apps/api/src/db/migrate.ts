import type { FastifyBaseLogger } from "fastify";

import { pool } from "./client.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Operator', 'Viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id),
    config JSONB NOT NULL,
    health TEXT NOT NULL CHECK (health IN ('Green', 'Amber', 'Red')) DEFAULT 'Amber',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS acquisition_records (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS validation_records (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    validation_type TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    payload JSONB NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS exports (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    runbook_md TEXT NOT NULL,
    validation_report JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('acquire_scan', 'netcheck')),
    status TEXT NOT NULL CHECK (status IN ('requested', 'in_progress', 'completed', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    executed_by JSONB,
    transcript_text TEXT,
    transcript_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    result_json JSONB,
    artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS run_logs (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('direct', 'indirect', 'fallback')),
    payload JSONB NOT NULL,
    support_bundle JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_validation_records_project ON validation_records(project_id, validation_type);`,
  `CREATE INDEX IF NOT EXISTS idx_run_logs_project ON run_logs(project_id);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_type_status ON runs(type, status);`
];

export const runMigrations = async (logger: FastifyBaseLogger): Promise<void> => {
  for (const statement of statements) {
    await pool.query(statement);
  }
  logger.info("Database migrations complete");
};
