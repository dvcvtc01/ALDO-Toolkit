import { Queue } from "bullmq";

import { config } from "../config.js";

const queueName = "aldo-jobs";

let queue: Queue | null = null;

const getQueue = (): Queue => {
  if (!queue) {
    queue = new Queue(queueName, {
      connection: {
        url: config.REDIS_URL
      }
    });
  }
  return queue;
};

export const enqueueSupportBundleBuild = async (bundleId: string): Promise<void> => {
  const jobQueue = getQueue();
  await jobQueue.add(
    "support_bundle_build",
    { bundleId },
    {
      removeOnComplete: 200,
      removeOnFail: 500
    }
  );
};

export const closeJobQueue = async (): Promise<void> => {
  if (queue) {
    await queue.close();
    queue = null;
  }
};
