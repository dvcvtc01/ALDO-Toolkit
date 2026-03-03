import { describe, expect, it } from "vitest";

import { validateProjectWizard } from "../src/validators/project-validator.js";

const baseProject = {
  name: "Factory Cluster",
  environmentType: "air-gapped" as const,
  deploymentModel: "physical" as const,
  domainName: "corp.example.com",
  dnsServers: ["10.10.0.10"],
  nodeCountTarget: 3,
  managementIpPool: "10.20.0.10-10.20.0.50",
  ingressIp: "10.20.0.20",
  deploymentRange: "10.30.0.0/24",
  containerNetworkRange: "10.40.0.0/24",
  identityProviderHost: "idp.corp.example.com",
  ingressEndpoints: [{ name: "portal", fqdn: "portal.corp.example.com" }],
  notes: "test"
};

describe("validateProjectWizard", () => {
  it("passes for a valid project config", () => {
    const result = validateProjectWizard(baseProject);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when ingress is outside management pool", () => {
    const result = validateProjectWizard({
      ...baseProject,
      ingressIp: "10.50.0.2"
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "INGRESS_OUTSIDE_MANAGEMENT_POOL")).toBe(true);
  });

  it("fails when container range overlaps deployment range", () => {
    const result = validateProjectWizard({
      ...baseProject,
      containerNetworkRange: "10.30.0.64/26"
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "CONTAINER_RANGE_OVERLAP_DEPLOYMENT")).toBe(
      true
    );
  });
});
