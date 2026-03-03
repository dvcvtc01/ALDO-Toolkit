import { describe, expect, it } from "vitest";

import { buildDeterministicSupportBundleManifest } from "../src/validators/support-bundle.js";

describe("buildDeterministicSupportBundleManifest", () => {
  it("sorts files deterministically and emits hashes", () => {
    const manifest = buildDeterministicSupportBundleManifest(
      [
        { path: "b.txt", content: "second" },
        { path: "a.txt", content: "first" }
      ],
      "direct",
      "2026-03-03T10:00:00.000Z"
    );

    expect(manifest.files[0]?.path).toBe("a.txt");
    expect(manifest.files[1]?.path).toBe("b.txt");
    expect(manifest.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
