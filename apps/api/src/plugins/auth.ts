import type { Role } from "@aldo/shared";
import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { config } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireRole: (roles: Role[]) => (request: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp(async (app) => {
  await app.register(import("@fastify/jwt"), {
    secret: config.JWT_SECRET
  });

  app.decorate("authenticate", async (request) => {
    await request.jwtVerify();
  });

  app.decorate("requireRole", (roles: Role[]) => {
    return async (request) => {
      await request.jwtVerify();
      if (!roles.includes(request.user.role)) {
        throw app.httpErrors.forbidden("Insufficient role privileges.");
      }
    };
  });
});
