import { createHash } from "node:crypto";

export type SupportBundleInputFile = {
  path: string;
  content: Buffer | string;
};

export type SupportBundleManifestFile = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

export type DeterministicSupportBundleManifest = {
  formatVersion: "1.0";
  generatedAtUtc: string;
  files: SupportBundleManifestFile[];
};

export const normalizeBundlePath = (filePath: string): string => filePath.replace(/\\/g, "/");

export const buildDeterministicSupportBundleManifest = (
  files: SupportBundleInputFile[],
  generatedAtUtc: string
): DeterministicSupportBundleManifest => {
  const normalized = files
    .map((file) => {
      const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
      const sha256 = createHash("sha256").update(data).digest("hex");
      return {
        path: normalizeBundlePath(file.path),
        sha256,
        sizeBytes: data.byteLength
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en"));

  return {
    formatVersion: "1.0",
    generatedAtUtc,
    files: normalized
  };
};

export const buildChecksumsText = (manifestFiles: SupportBundleManifestFile[]): string => {
  const sorted = [...manifestFiles].sort((a, b) => a.path.localeCompare(b.path, "en"));
  return `${sorted.map((file) => `${file.sha256}  ${file.path}`).join("\n")}\n`;
};
