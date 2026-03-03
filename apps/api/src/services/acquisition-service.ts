import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactFileInput } from "@aldo/shared";

import { sha256File } from "../utils/hash.js";

export type ArtifactVerificationResult = {
  relativePath: string;
  expectedSha256: string;
  actualSha256: string | null;
  exists: boolean;
  validHash: boolean;
  sizeBytes: number | null;
};

export const verifyArtifacts = async (
  artifactRoot: string,
  expectedArtifacts: ArtifactFileInput[]
): Promise<ArtifactVerificationResult[]> => {
  const results: ArtifactVerificationResult[] = [];

  for (const artifact of expectedArtifacts) {
    const targetPath = path.resolve(artifactRoot, artifact.relativePath);
    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) {
        results.push({
          relativePath: artifact.relativePath,
          expectedSha256: artifact.sha256.toLowerCase(),
          actualSha256: null,
          exists: false,
          validHash: false,
          sizeBytes: null
        });
        continue;
      }

      const actualSha256 = (await sha256File(targetPath)).toLowerCase();
      results.push({
        relativePath: artifact.relativePath,
        expectedSha256: artifact.sha256.toLowerCase(),
        actualSha256,
        exists: true,
        validHash: actualSha256 === artifact.sha256.toLowerCase(),
        sizeBytes: stat.size
      });
    } catch {
      results.push({
        relativePath: artifact.relativePath,
        expectedSha256: artifact.sha256.toLowerCase(),
        actualSha256: null,
        exists: false,
        validHash: false,
        sizeBytes: null
      });
    }
  }

  return results;
};
