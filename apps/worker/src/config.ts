import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  DATABASE_URL: z.string().url().default("postgres://aldo:aldo@localhost:5432/aldo"),
  DATA_DIR: z.string().default(path.resolve(process.cwd(), "data")),
  ALDO_VERSION: z.string().default("0.5.0"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2)
});

export const workerConfig = schema.parse(process.env);
