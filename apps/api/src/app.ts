import path from "node:path";

import type { FastifyInstance, FastifyServerOptions } from "fastify";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler
} from "fastify-type-provider-zod";

import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { authPlugin } from "./plugins/auth.js";
import { closeJobQueue } from "./queue/jobs.js";
import { routes } from "./routes/index.js";
import { ensureDir } from "./utils/storage.js";

export const buildApp = async (
  options: FastifyServerOptions = {},
  bootstrap: { skipMigrations?: boolean } = {}
): Promise<FastifyInstance> => {
  const app = Fastify({
    logger:
      config.NODE_ENV === "development"
        ? {
            level: "info",
            transport: {
              target: "pino-pretty",
              options: {
                colorize: true
              }
            }
          }
        : true,
    ...options
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(import("@fastify/sensible"));
  await app.register(import("@fastify/cors"), {
    origin: config.WEB_ORIGIN,
    credentials: true
  });
  await app.register(import("@fastify/multipart"), {
    limits: {
      fileSize: 1024 * 1024 * 512
    }
  });
  await app.register(import("@fastify/swagger"), {
    openapi: {
      info: {
        title: "ALDO Toolkit API",
        version: "0.5.0",
        description: "Azure Local DisconnectedOps Toolkit API"
      },
      tags: [
        { name: "auth" },
        { name: "users" },
        { name: "projects" },
        { name: "validations" },
        { name: "policies" },
        { name: "exports" },
        { name: "runs" },
        { name: "support-bundles" }
      ]
    },
    transform: jsonSchemaTransform
  });
  await app.register(import("@fastify/swagger-ui"), {
    routePrefix: "/docs"
  });
  await app.register(authPlugin);
  await app.register(routes, { prefix: "/api/v1" });

  app.get("/openapi.json", () => app.swagger());

  app.addHook("onReady", async () => {
    await ensureDir(config.DATA_DIR);
    await ensureDir(path.join(config.DATA_DIR, "projects"));
    if (!bootstrap.skipMigrations) {
      await runMigrations(app.log);
    }
  });

  app.addHook("onClose", async () => {
    await closeJobQueue();
  });

  return app;
};
