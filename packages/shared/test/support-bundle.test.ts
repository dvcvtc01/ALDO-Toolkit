import { describe, expect, it } from "vitest";

import {
  buildChecksumsText,
  buildDeterministicSupportBundleManifest
} from "../src/validators/support-bundle.js";

describe("buildDeterministicSupportBundleManifest", () => {
  it("sorts files deterministically and emits stable hashes", () => {
    const manifest = buildDeterministicSupportBundleManifest(
      [
        { path: "b.txt", content: "second" },
        { path: "a.txt", content: "first" }
      ],
      "2026-03-03T10:00:00.000Z"
    );

    expect(manifest.files[0]?.path).toBe("a.txt");
    expect(manifest.files[1]?.path).toBe("b.txt");
    expect(manifest.files[0]?.sha256).toBe(
      "a7937b64b8caa58f03721bb6bacf5c78cb235febe0e70b1b84cd99541461a08e"
    );
    expect(manifest.files[1]?.sha256).toBe(
      "16367aacb67a4a017c8da8ab95682ccb390863780f7114dda0a0e0c55644c7c4"
    );
  });

  it("builds sorted checksums text", () => {
    const checksums = buildChecksumsText([
      { path: "z/z.txt", sha256: "b".repeat(64), sizeBytes: 20 },
      { path: "a/a.txt", sha256: "a".repeat(64), sizeBytes: 10 }
    ]);

    expect(checksums).toBe(`${"a".repeat(64)}  a/a.txt\n${"b".repeat(64)}  z/z.txt\n`);
  });
});
