import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2)
});

export const workerConfig = schema.parse(process.env);
