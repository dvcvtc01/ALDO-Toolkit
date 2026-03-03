import { Worker } from "bullmq";
import pino from "pino";

import { workerConfig } from "./config.js";

const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug"
});

const worker = new Worker(
  "aldo-jobs",
  async (job) => {
    await Promise.resolve();
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        data: job.data
      },
      "Processing job"
    );

    switch (job.name) {
      case "evidence.collection.placeholder":
        return {
          status: "completed",
          processedAt: new Date().toISOString(),
          note: "Placeholder processor. Full OperationsModule integration is planned post-MVP."
        };
      default:
        throw new Error(`Unsupported job type: ${job.name}`);
    }
  },
  {
    connection: {
      url: workerConfig.REDIS_URL
    },
    concurrency: workerConfig.WORKER_CONCURRENCY
  }
);

worker.on("ready", () => {
  logger.info("ALDO worker is ready");
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, "Job completed");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err: error }, "Job failed");
});

const shutdown = async (): Promise<void> => {
  await worker.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
