import type { Role } from "@aldo/shared";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      userId: string;
      username: string;
      role: Role;
    };
    user: {
      userId: string;
      username: string;
      role: Role;
    };
  }
}
