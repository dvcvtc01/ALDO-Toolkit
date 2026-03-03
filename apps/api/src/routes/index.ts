import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import argon2 from "argon2";
import {
  acquisitionChecklistSchema,
  bootstrapAdminSchema,
  buildDeterministicSupportBundleManifest,
  loginSchema,
  pkiValidationRequestSchema,
  projectPatchSchema,
  projectWizardSchema,
  runnerEvidencePayloadSchema,
  userCreateSchema,
  validateAcquisitionChecklist,
  validatePkiBundle,
  validateProjectWizard
} from "@aldo/shared";
import type { FastifyPluginCallback } from "fastify";
import { z } from "zod";

import {
  createProject,
  createUser,
  deleteProject,
  getProjectById,
  getUserById,
  listExports,
  listProjects,
  listRunLogs,
  listUsers,
  listValidationRecords,
  updateProject,
  insertAcquisitionRecord,
  insertExportRecord,
  insertRunLog,
  insertValidationRecord,
  countUsers,
  getUserByUsername
} from "../db/repositories.js";
import { verifyArtifacts } from "../services/acquisition-service.js";
import { buildRunbookMarkdown, buildValidationReport } from "../services/export-builder.js";
import { calculateProjectHealth } from "../services/project-health.js";
import { parseCertificateBundle } from "../utils/certificates.js";
import { runDnsCheck, runTcpCheck } from "../utils/network.js";
import { ensureProjectSubdir, writeJsonFile, writeTextFile } from "../utils/storage.js";

const projectIdParamsSchema = z.object({
  projectId: z.string().uuid()
});

const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const networkCheckSchema = z.object({
  ingressIp: z.string().regex(ipv4Regex).optional(),
  endpoints: z.array(z.string().trim().min(1)).min(1).optional(),
  identityProviderHost: z.string().trim().optional()
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
    "/projects/:projectId/validate/acquisition",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["validations"],
        params: projectIdParamsSchema,
        body: acquisitionChecklistSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const payload = acquisitionChecklistSchema.parse(request.body);
      const baselineValidation = validateAcquisitionChecklist(payload);
      const artifactVerification = await verifyArtifacts(payload.providedArtifactRoot, payload.expectedArtifacts);
      const invalidArtifacts = artifactVerification.filter(
        (artifact) => !artifact.exists || !artifact.validHash
      ).length;

      const result = {
        ...baselineValidation,
        artifactVerification,
        artifactVerificationPassed: invalidArtifacts === 0
      };

      await insertAcquisitionRecord(projectId, request.user.userId, payload);
      await insertValidationRecord(projectId, "acquisition", request.user.userId, payload, result);

      const acquireDir = await ensureProjectSubdir(projectId, "acquire");
      await writeJsonFile(
        path.join(acquireDir, `acquisition-${new Date().toISOString().replaceAll(":", "-")}.json`),
        { payload, result }
      );

      return result;
    }
  );

  app.post(
    "/projects/:projectId/validate/network",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["validations"],
        params: projectIdParamsSchema,
        body: networkCheckSchema.optional()
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const overrides = networkCheckSchema.parse(request.body ?? {});
      const endpoints =
        overrides.endpoints && overrides.endpoints.length > 0
          ? overrides.endpoints
          : project.config.ingressEndpoints.map((endpoint) => endpoint.fqdn);
      const ingressIp = overrides.ingressIp ?? project.config.ingressIp;
      const identityProviderHost = overrides.identityProviderHost ?? project.config.identityProviderHost;

      const dnsChecks = await Promise.all(endpoints.map((endpoint) => runDnsCheck(endpoint)));
      const identityProviderCheck = await runDnsCheck(identityProviderHost);
      const tcpCheck = await runTcpCheck(ingressIp, 443);

      const result = {
        dnsChecks,
        identityProviderCheck,
        tcpCheck,
        valid:
          dnsChecks.every((check) => check.resolved) &&
          identityProviderCheck.resolved &&
          tcpCheck.reachable
      };

      await insertValidationRecord(
        projectId,
        "network",
        request.user.userId,
        {
          ingressIp,
          endpoints,
          identityProviderHost
        },
        result
      );

      return result;
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

      const deployDateRaw =
        getMultipartFieldValue(upload.fields?.deployDate) ?? new Date().toISOString();
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
            const tcp = await runTcpCheck(parsed.hostname, parsed.port ? Number.parseInt(parsed.port, 10) : parsed.protocol === "https:" ? 443 : 80);
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
      const generatedAt = new Date().toISOString();
      const runbook = buildRunbookMarkdown(project, validations, generatedAt);
      const report = buildValidationReport(project, validations, generatedAt);
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
    "/projects/:projectId/runs/evidence",
    {
      preHandler: [app.requireRole(["Admin", "Operator"])],
      schema: {
        tags: ["runs"],
        params: projectIdParamsSchema,
        body: runnerEvidencePayloadSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const payload = runnerEvidencePayloadSchema.parse(request.body);

      if (payload.projectId !== projectId) {
        return reply.code(400).send({ message: "Project ID mismatch between URL and payload." });
      }

      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }

      const runId = randomUUID();
      const runDir = path.join(await ensureProjectSubdir(projectId, "runs"), runId);
      await fs.mkdir(runDir, { recursive: true });

      const transcriptFile = path.join(runDir, "transcript.json");
      const dnsFile = path.join(runDir, "dns-checks.json");
      const tcpFile = path.join(runDir, "tcp-checks.json");
      const envCheckerFile = path.join(runDir, "environment-checker.json");

      await writeJsonFile(transcriptFile, payload.transcript);
      await writeJsonFile(dnsFile, payload.dnsChecks);
      await writeJsonFile(tcpFile, payload.tcpChecks);
      await writeJsonFile(envCheckerFile, payload.environmentChecker);

      const manifest = buildDeterministicSupportBundleManifest(
        [
          { path: "dns-checks.json", content: JSON.stringify(payload.dnsChecks) },
          { path: "environment-checker.json", content: JSON.stringify(payload.environmentChecker) },
          { path: "tcp-checks.json", content: JSON.stringify(payload.tcpChecks) },
          { path: "transcript.json", content: JSON.stringify(payload.transcript) }
        ],
        payload.mode,
        payload.collectedAt
      );

      await writeJsonFile(path.join(runDir, "support-bundle-manifest.json"), manifest);
      await insertRunLog(projectId, payload.mode, payload, manifest);
      await insertValidationRecord(projectId, "runner_evidence", request.user.userId, payload, {
        manifest,
        runId
      });

      return {
        runId,
        supportBundleManifest: manifest
      };
    }
  );

  app.get(
    "/projects/:projectId/runs",
    {
      preHandler: [app.requireRole(["Admin", "Operator", "Viewer"])],
      schema: {
        tags: ["runs"],
        params: projectIdParamsSchema
      }
    },
    async (request, reply) => {
      const { projectId } = projectIdParamsSchema.parse(request.params);
      const project = await getProjectById(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found." });
      }
      return listRunLogs(projectId);
    }
  );

  done();
};
