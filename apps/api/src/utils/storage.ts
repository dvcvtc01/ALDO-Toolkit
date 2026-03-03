import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";

export const ensureDir = async (directoryPath: string): Promise<void> => {
  await fs.mkdir(directoryPath, { recursive: true });
};

export const getProjectDir = (projectId: string): string => path.join(config.DATA_DIR, "projects", projectId);

export const ensureProjectSubdir = async (
  projectId: string,
  section: "acquire" | "pki" | "exports" | "runs"
): Promise<string> => {
  const dir = path.join(getProjectDir(projectId), section);
  await ensureDir(dir);
  return dir;
};

export const writeJsonFile = async (filePath: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const writeTextFile = async (filePath: string, content: string): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
};
