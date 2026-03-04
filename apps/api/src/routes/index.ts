import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import argon2 from "argon2";
import {
  bootstrapAdminSchema,
  loginSchema,
  pkiValidationRequestSchema,
  projectPatchSchema,
  projectWizardSchema,
  runCreateRequestSchema,
  runEvidenceSchema,
  runStatusSchema,
  runTypeSchema,
  userCreateSchema,
  validatePkiBundle,
  validateProjectWizard
} from "@aldo/shared";
import type { FastifyPluginCallback } from "fastify";
import { z } from "zod";

import {
  countUsers,
  createProject,
  createRun,
  createSupportBundle,
  createUser,
  deleteProject,
  getProjectById,
  getRunById,
  getSupportBundleById,
  getUserById,
  getUserByUsername,
  insertExportRecord,
  insertValidationRecord,
  listExports,
  listProjects,
  listRunsByProject,
  listSupportBundlesByProject,
  listUsers,
  listValidationRecords,
  submitRunEvidence,
  updateSupportBundleStatus,
  updateProject
} from "../db/repositories.js";
import { enqueueSupportBundleBuild } from "../queue/jobs.js";
import { buildRunbookMarkdown, buildValidationReport } from "../services/export-builder.js";
import { calculateProjectHealth } from "../services/project-health.js";
import { parseCertificateBundle } from "../utils/certificates.js";
import { runDnsCheck, runTcpCheck } from "../utils/network.js";
import { ensureProjectSubdir, writeJsonFile, writeTextFile } from "../utils/storage.js";

const projectIdParamsSchema = z.object({
  projectId: z.string().uuid()
});

const runIdParamsSchema = z.object({
  runId: z.string().uuid()
});

const bundleIdParamsSchema = z.object({
  bundleId: z.string().uuid()
});

const runsQuerySchema = z.object({
  type: runTypeSchema.optional(),
  status: runStatusSchema.optional()
});

const createTokenResponse = (token: string) => ({
  tokenType: "Bearer",
  accessToken: token
});

const getMultipartFieldValue = (field: unknown): string | undefined => {
  if (!field) {
    return undefined;
  }

  const candidate: unknown = Array.isArray(field) ? field.at(0) : field;
  if (!candidate || typeof candidate !== "object" || !("value" in candidate)) {
    return undefined;
  }

  const value = (candidate as { value?: unknown }).value;
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  return undefined;
};

export const routes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

  app.post(
    "/auth/bootstrap",
    {
      schema: {
        tags: ["auth"],
        body: bootstrapAdminSchema
      }
    },
    async (request, reply) => {
      const existingUsers = await countUsers();
      if (existingUsers > 0) {
        return reply.code(409).send({ message: "Bootstrap is only allowed when no users exist." });
      }

      const payload = bootstrapAdminSchema.parse(request.body);
      const hash = await argon2.hash(payload.password, { type: argon2.argon2id });
      const user = await createUser({
        username: payload.username.toLowerCase(),
        displayName: payload.displayName,
        passwordHash: hash,
        role: "Admin"
      });

      const token = await reply.jwtSign({
        userId: user.id,
        username: user.username,
        role: user.role
      });

      return {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          createdAt: user.createdAt
        },
        ...createTokenResponse(token)
      };
    }
  );

  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        body: loginSchema
      }
    },
    async (request, reply) => {
      const payload = loginSchema.parse(request.body);
      const user = await getUserByUsername(payload.username.toLowerCase());
      if (!user) {
        return reply.code(401).send({ message: "Invalid credentials." });
      }

      const validPassword = await argon2.verify(user.passwordHash, payload.password);
      if (!validPassword) {
        return reply.code(401).send({ message: "Invalid credentials." });
      }

      const token = await reply.jwtSign({
        userId: user.id,
        username: user.username,
        role: user.role
      });

      return {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          createdAt: user.createdAt
        },
        ...createTokenResponse(token)
      };
    }
  );

  app.get(
    "/auth/me",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["auth"]
      }
    },
    async (request, reply) => {
      const user = await getUserById(request.user.userId);
      if (!user) {
        return reply.code(401).send({ message: "User not found." });
      }
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt
      };
    }
  );

  app.get(
    "/users",
    {
      preHandler: [app.requireRole(["Admin"])],
      schema: {
        tags: ["users"]
      }
    },
    async () => {
      const users = await listUsers();
      return users.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt
      }));
    }
  );

  app.post(
    "/users",
    {
      preHandler: [app.requireRole(["Admin"])],
      schema: {
        tags: ["users"],
        body: userCreateSchema
      }
    },
    async (request, reply) => {
      const payload = userCreateSchema.parse(request.body);
      const existing = await getUserByUsername(payload.username.toLowerCase());
      if (existing) {
        return reply.code(409).send({ message: "Username already exists." });
      }

      const hash = await argon2.hash(payload.password, { type: argon2.argon2id });
      const user = await createUser({
        username: payload.username.toLowerCase(),
        displayName: payload.displayName,
        passwordHash: hash,
        role: payload.role
      });

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt
      };
    }
  );

  app.get(
    "/projects",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["projects"]
      }
    },
    async () => {
      const projects = await listProjects();
      return projects.map((project) => ({
        id: project.id,
        ownerUserId: project.ownerUserId,
        health: project.health,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        ...project.config
      }));
    }
  );

  app.get(
    "/projects/:projectId",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["projects"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }
      return {
        id: project.id,
        ownerUserId: project.ownerUserId,
        health: project.health,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        ...project.config
      };
    }
  );

  app.post(
    "/projects",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["projects"],
        body: projectWizardSchema
      }
    },
    async (request) => {
      const payload = projectWizardSchema.parse(request.body);
      const validation = validateProjectWizard(payload);
      const project = await createProject(request.user.userId, payload, calculateProjectHealth(payload));

      await insertValidationRecord(project.id, "project", request.user.userId, payload, validation);

      return {
        id: project.id,
        ownerUserId: project.ownerUserId,
        health: project.health,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        validation,
        ...project.config
      };
    }
  );

  app.patch(
    "/projects/:projectId",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["projects"],
        params: projectIdParamsSchema,
        body: projectPatchSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const existing = await getProjectById(projectId);
      if (!existing) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const patch = projectPatchSchema.parse(request.body);
      const merged = projectWizardSchema.parse({
        ...existing.config,
        ...patch
      });

      const validation = validateProjectWizard(merged);
      const project = await updateProject(projectId, merged, calculateProjectHealth(merged));
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      await insertValidationRecord(project.id, "project", request.user.userId, merged, validation);

      return {
        id: project.id,
        ownerUserId: project.ownerUserId,
        health: project.health,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        validation,
        ...project.config
      };
    }
  );

  app.delete(
    "/projects/:projectId",
    {
      preHandler: [app.requireRole(["Admin"])],
      schema: {
        tags: ["projects"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const deleted = await deleteProject(projectId);
      if (!deleted) {
        return reply.code(404).send({ message: "Project not found." });
      }
      return reply.code(204).send();
    }
  );

  app.post(
    "/projects/:projectId/validate/project",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["validations"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const validation = validateProjectWizard(project.config);
      await insertValidationRecord(projectId, "project", request.user.userId, project.config, validation);
      return validation;
    }
  );

  app.post(
    "/projects/:projectId/validate/pki",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["validations"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const upload = await request.file();
      if (!upload) {
        return reply.code(400).send({ message: "Certificate bundle file is required." });
      }

      const deployDateRaw = getMultipartFieldValue(upload.fields?.deployDate) ?? new Date().toISOString();
      const deployDate = new Date(deployDateRaw);
      if (Number.isNaN(deployDate.getTime())) {
        return reply.code(400).send({ message: "deployDate must be a valid ISO date string." });
      }
      const passphrase = getMultipartFieldValue(upload.fields?.passphrase);
      const uploadDir = await ensureProjectSubdir(projectId, "pki");
      const sanitizedFilename = upload.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(uploadDir, `${Date.now()}-${sanitizedFilename}`);

      await pipeline(upload.file, createWriteStream(filePath));

      const certificates = await parseCertificateBundle(filePath, passphrase);
      const input = pkiValidationRequestSchema.parse({
        deployDate: deployDate.toISOString(),
        certificates
      });

      const allEndpoints = [...new Set(certificates.flatMap((cert) => [...cert.cdpUrls, ...cert.ocspUrls]))];
      const reachability: Record<string, boolean> = {};

      await Promise.all(
        allEndpoints.map(async (endpoint) => {
          try {
            const parsed = new URL(endpoint);
            const hostCheck = await runDnsCheck(parsed.hostname);
            if (!hostCheck.resolved) {
              reachability[endpoint] = false;
              return;
            }
            const tcp = await runTcpCheck(
              parsed.hostname,
              parsed.port
                ? Number.parseInt(parsed.port, 10)
                : parsed.protocol === "https:"
                  ? 443
                  : 80
            );
            reachability[endpoint] = tcp.reachable;
          } catch {
            reachability[endpoint] = false;
          }
        })
      );

      const result = validatePkiBundle(input, reachability);
      await insertValidationRecord(projectId, "pki", request.user.userId, input, result);
      await writeJsonFile(path.join(uploadDir, `pki-result-${Date.now()}.json`), { input, result });

      return {
        input,
        result
      };
    }
  );

  app.get(
    "/projects/:projectId/validations",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["validations"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }
      return listValidationRecords(projectId);
    }
  );

  app.post(
    "/projects/:projectId/exports/generate",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["exports"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const validations = await listValidationRecords(projectId);
      const envcheckRuns = await listRunsByProject(projectId, { type: "envcheck" });
      const latestEnvcheckRun =
        envcheckRuns.find((run) => run.status === "completed" || run.status === "failed") ??
        envcheckRuns[0] ??
        null;
      const generatedAt = new Date().toISOString();
      const runbook = buildRunbookMarkdown(project, validations, generatedAt, latestEnvcheckRun);
      const report = buildValidationReport(project, validations, generatedAt, latestEnvcheckRun);
      const exportId = randomUUID();

      const exportDir = await ensureProjectSubdir(projectId, "exports");
      const baseName = `export-${generatedAt.replaceAll(":", "-")}-${exportId}`;
      const runbookPath = path.join(exportDir, `${baseName}-Runbook.md`);
      const reportPath = path.join(exportDir, `${baseName}-validation-report.json`);

      await writeTextFile(runbookPath, runbook);
      await writeJsonFile(reportPath, report);
      await insertExportRecord(projectId, request.user.userId, runbook, report);

      return {
        id: exportId,
        generatedAt,
        runbookPath,
        validationReportPath: reportPath,
        runbook,
        validationReport: report
      };
    }
  );

  app.get(
    "/projects/:projectId/exports",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["exports"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }
      return listExports(projectId);
    }
  );

  app.post(
    "/projects/:projectId/support-bundles",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["support-bundles"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const bundle = await createSupportBundle(projectId, request.user.userId);

      try {
        await enqueueSupportBundleBuild(bundle.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unable to enqueue support bundle job.";
        await updateSupportBundleStatus(bundle.id, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: errorMessage
        });
        return reply.code(500).send({ message: errorMessage });
      }

      return bundle;
    }
  );

  app.get(
    "/projects/:projectId/support-bundles",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["support-bundles"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const bundles = await listSupportBundlesByProject(projectId);
      return bundles.map((bundle) => ({
        ...bundle,
        filePath: bundle.filePath ? path.basename(bundle.filePath) : null
      }));
    }
  );

  app.get(
    "/support-bundles/:bundleId",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["support-bundles"],
        params: bundleIdParamsSchema
      }
    },
    async (request, reply) => {
      const { bundleId } = bundleIdParamsSchema.parse(request.params);
      const bundle = await getSupportBundleById(bundleId);
      if (!bundle) {
        return reply.code(404).send({ message: "Support bundle not found." });
      }

      return {
        ...bundle,
        filePath: bundle.filePath ? path.basename(bundle.filePath) : null
      };
    }
  );

  app.get(
    "/support-bundles/:bundleId/download",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["support-bundles"],
        params: bundleIdParamsSchema
      }
    },
    async (request, reply) => {
      const { bundleId } = bundleIdParamsSchema.parse(request.params);
      const bundle = await getSupportBundleById(bundleId);
      if (!bundle) {
        return reply.code(404).send({ message: "Support bundle not found." });
      }

      if (bundle.status !== "ready" || !bundle.filePath) {
        return reply.code(409).send({ message: "Support bundle is not ready for download." });
      }

      try {
        await fs.access(bundle.filePath);
      } catch {
        return reply.code(404).send({ message: "Support bundle file not found." });
      }

      const filename = `ALDO_SupportBundle_${bundle.projectId}_${bundle.id}.zip`;
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      return reply.send(createReadStream(bundle.filePath));
    }
  );

  app.post(
    "/projects/:projectId/runs",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["runs"],
        params: projectIdParamsSchema,
        body: runCreateRequestSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const payload = runCreateRequestSchema.parse(request.body);
      const run = await createRun(projectId, payload.type, payload.requestJson, request.user.userId);
      return run;
    }
  );

  app.post(
    "/runs/:runId/evidence",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["runs"],
        params: runIdParamsSchema,
        body: runEvidenceSchema
      }
    },
    async (request, reply) => {
      const { runId } = runIdParamsSchema.parse(request.params);
      const existing = await getRunById(runId);
      if (!existing) {
        return reply.code(404).send({ message: "Run not found." });
      }

      const payload = runEvidenceSchema.parse(request.body);
      const isTerminalStatus = payload.status === "completed" || payload.status === "failed";
      const finishedAt = isTerminalStatus
        ? (payload.finishedAt ?? new Date().toISOString())
        : payload.finishedAt;

      const evidenceUpdate: Parameters<typeof submitRunEvidence>[1] = {
        status: payload.status,
        executedBy: payload.executedBy,
        transcriptLines: payload.transcriptLines,
        resultJson: payload.resultJson,
        artifacts: payload.artifacts
      };
      if (payload.startedAt) {
        evidenceUpdate.startedAt = payload.startedAt;
      }
      if (finishedAt) {
        evidenceUpdate.finishedAt = finishedAt;
      }
      if (payload.transcriptText) {
        evidenceUpdate.transcriptText = payload.transcriptText;
      }

      const run = await submitRunEvidence(runId, evidenceUpdate);

      if (!run) {
        return reply.code(404).send({ message: "Run not found." });
      }

      const runRoot = await ensureProjectSubdir(existing.projectId, "runs");
      const runDir = path.join(runRoot, runId);
      await writeJsonFile(path.join(runDir, "evidence.json"), {
        runId,
        projectId: existing.projectId,
        receivedAt: new Date().toISOString(),
        payload
      });
      await writeJsonFile(path.join(runDir, "result.json"), payload.resultJson);
      await writeJsonFile(path.join(runDir, "artifacts.json"), payload.artifacts);
      await writeJsonFile(path.join(runDir, "transcript-lines.json"), payload.transcriptLines);
      if (payload.transcriptText) {
        await writeTextFile(path.join(runDir, "transcript.txt"), payload.transcriptText);
      }

      await insertValidationRecord(
        existing.projectId,
        existing.type === "acquire_scan"
          ? "runner_acquire_scan"
          : existing.type === "netcheck"
            ? "runner_netcheck"
            : existing.type === "pki_validate"
              ? "runner_pki_validate"
            : "runner_envcheck",
        request.user.userId,
        {
          runId,
          type: existing.type,
          requestJson: existing.requestJson
        },
        payload.resultJson
      );

      return run;
    }
  );

  app.get(
    "/projects/:projectId/runs",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["runs"],
        params: projectIdParamsSchema,
        querystring: runsQuerySchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const query = runsQuerySchema.parse(request.query ?? {});
      return listRunsByProject(projectId, {
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {})
      });
    }
  );

  app.get(
    "/runs/:runId",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["runs"],
        params: runIdParamsSchema
      }
    },
    async (request, reply) => {
      const { runId } = runIdParamsSchema.parse(request.params);
      const run = await getRunById(runId);
      if (!run) {
        return reply.code(404).send({ message: "Run not found." });
      }
      return run;
    }
  );

  done();
};
