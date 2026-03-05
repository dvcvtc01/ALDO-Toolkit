import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/repositories.js", async () => {
  const actual = await vi.importActual("../src/db/repositories.js");
  return {
    ...(actual as object),
    getProjectById: vi.fn(),
    getLatestPolicyEvaluation: vi.fn()
  };
});

import { buildApp } from "../src/app.js";
import * as repositories from "../src/db/repositories.js";

const getProjectByIdMock = vi.mocked(repositories.getProjectById);
const getLatestPolicyEvaluationMock = vi.mocked(repositories.getLatestPolicyEvaluation);

const projectFixture = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  health: "Amber" as const,
  createdAt: "2026-03-05T10:00:00.000Z",
  updatedAt: "2026-03-05T10:00:00.000Z",
  config: {
    name: "policy-test",
    environmentType: "air-gapped" as const,
    deploymentModel: "physical" as const,
    domainName: "corp.example.com",
    dnsServers: ["10.10.0.10"],
    nodeCountTarget: 3,
    managementIpPool: "10.20.0.10-10.20.0.50",
    ingressIp: "10.20.0.20",
    deploymentRange: "10.30.0.0/24",
    containerNetworkRange: "10.40.0.0/24",
    identityProviderHost: "adfs.corp.example.com",
    ingressEndpoints: [{ name: "portal", fqdn: "portal.corp.example.com" }]
  }
};

describe("policy routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when an unknown policy pack is requested", async () => {
    getProjectByIdMock.mockResolvedValueOnce(projectFixture);

    const app = await buildApp({ logger: false }, { skipMigrations: true });
    await app.ready();

    const token = app.jwt.sign({
      userId: "33333333-3333-4333-8333-333333333333",
      username: "operator",
      role: "Operator"
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectFixture.id}/policy-evaluations`,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        packId: "missing-pack"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Unknown policy pack: missing-pack."
    });

    await app.close();
  });

  it("returns 404 when latest policy evaluation does not exist", async () => {
    getProjectByIdMock.mockResolvedValueOnce(projectFixture);
    getLatestPolicyEvaluationMock.mockResolvedValueOnce(null);

    const app = await buildApp({ logger: false }, { skipMigrations: true });
    await app.ready();

    const token = app.jwt.sign({
      userId: "33333333-3333-4333-8333-333333333333",
      username: "viewer",
      role: "Viewer"
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectFixture.id}/policy-evaluations/latest`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      message: "No policy evaluations found for this project."
    });

    await app.close();
  });
});
