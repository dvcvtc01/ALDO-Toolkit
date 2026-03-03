import { describe, expect, it } from "vitest";

import { runEvidenceSchema, runTypeSchema } from "../src/schemas/runs.js";

describe("runs schema", () => {
  it("accepts envcheck run type", () => {
    expect(runTypeSchema.parse("envcheck")).toBe("envcheck");
  });

  it("accepts artifact metadata with filename", () => {
    const parsed = runEvidenceSchema.parse({
      status: "completed",
      executedBy: {
        hostname: "HOST01",
        username: "operator",
        runnerVersion: "0.3.0"
      },
      transcriptLines: [],
      resultJson: {
        summary: {
          overall: "Green"
        }
      },
      artifacts: [
        {
          filename: "stdout-stderr.txt",
          relativePath: "stdout-stderr.txt",
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          sizeBytes: 128
        }
      ]
    });

    expect(parsed.artifacts[0]?.filename).toBe("stdout-stderr.txt");
  });
});
