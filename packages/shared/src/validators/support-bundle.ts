import { createHash } from "node:crypto";

export type SupportBundleInputFile = {
  path: string;
  content: Buffer | string;
};

export type SupportBundleManifest = {
  formatVersion: "1.0";
  generatedAt: string;
  mode: "direct" | "indirect" | "fallback";
  files: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
  }>;
};

export const buildDeterministicSupportBundleManifest = (
  files: SupportBundleInputFile[],
  mode: "direct" | "indirect" | "fallback",
  generatedAt: string
): SupportBundleManifest => {
  const normalized = files
    .map((file) => {
      const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
      const hash = createHash("sha256").update(data).digest("hex");
      return {
        path: file.path.replace(/\\/g, "/"),
        sha256: hash,
        sizeBytes: data.byteLength
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en"));

  return {
    formatVersion: "1.0",
    generatedAt,
    mode,
    files: normalized
  };
};
