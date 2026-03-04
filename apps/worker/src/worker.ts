import { Worker } from "bullmq";
import pino from "pino";

import { workerConfig } from "./config.js";
import { processSupportBundleBuildJob } from "./support-bundle/job.js";
import { closeWorkerDb } from "./support-bundle/repository.js";

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
      case "support_bundle_build":
        if (
          !job.data ||
          typeof job.data !== "object" ||
          !("bundleId" in job.data) ||
          typeof (job.data as { bundleId?: unknown }).bundleId !== "string"
        ) {
          throw new Error("support_bundle_build requires a string bundleId in job data.");
        }
        return processSupportBundleBuildJob((job.data as { bundleId: string }).bundleId, logger);
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
  await closeWorkerDb();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
