import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/repositories.js", async () => {
  const actual = await vi.importActual("../src/db/repositories.js");
  return {
    ...(actual as object),
    getSupportBundleById: vi.fn()
  };
});

import { buildApp } from "../src/app.js";
import * as repositories from "../src/db/repositories.js";

const getSupportBundleByIdMock = vi.mocked(repositories.getSupportBundleById);

describe("support bundle download route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when bundle is not ready", async () => {
    const app = await buildApp({ logger: false }, { skipMigrations: true });
    await app.ready();

    const bundleId = "44444444-4444-4444-8444-444444444444";
    getSupportBundleByIdMock.mockResolvedValueOnce({
      id: bundleId,
      projectId: "11111111-1111-4111-8111-111111111111",
      status: "queued",
      createdAt: "2026-03-04T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      requestedByUserId: "22222222-2222-4222-8222-222222222222",
      filePath: null,
      fileSize: null,
      sha256: null,
      manifestJson: null,
      error: null
    });

    const token = app.jwt.sign({
      userId: "33333333-3333-4333-8333-333333333333",
      username: "viewer",
      role: "Viewer"
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/support-bundles/${bundleId}/download`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "Support bundle is not ready for download."
    });

    await app.close();
  });
});
