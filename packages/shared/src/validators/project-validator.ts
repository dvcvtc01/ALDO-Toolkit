import type { ProjectWizardInput } from "../schemas/project.js";
import { cidrToRange, isIpInRange, parseIpPool, rangesOverlap } from "../utils/ip.js";

export type ValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export const validateProjectWizard = (input: ProjectWizardInput): ValidationResult => {
  const issues: ValidationIssue[] = [];

  if (input.deploymentModel !== "physical") {
    issues.push({
      code: "DEPLOYMENT_MODEL_UNSUPPORTED",
      severity: "error",
      message: "Disconnected operations management instance must be deployed on physical machines."
    });
  }

  if (input.nodeCountTarget < 3 || input.nodeCountTarget > 16) {
    issues.push({
      code: "NODE_COUNT_INVALID",
      severity: "error",
      message: "Management instance requires between 3 and 16 physical machines."
    });
  }

  let managementPoolRange: { start: number; end: number } | undefined;
  try {
    managementPoolRange = parseIpPool(input.managementIpPool);
  } catch (error) {
    issues.push({
      code: "MANAGEMENT_POOL_INVALID",
      severity: "error",
      message: error instanceof Error ? error.message : "Management IP pool format is invalid."
    });
  }

  let deploymentRange: { start: number; end: number } | undefined;
  let containerRange: { start: number; end: number } | undefined;
  try {
    deploymentRange = cidrToRange(input.deploymentRange);
  } catch {
    issues.push({
      code: "DEPLOYMENT_RANGE_INVALID",
      severity: "error",
      message: "Deployment range must be a valid IPv4 CIDR."
    });
  }

  try {
    containerRange = cidrToRange(input.containerNetworkRange);
  } catch {
    issues.push({
      code: "CONTAINER_RANGE_INVALID",
      severity: "error",
      message: "Container network range must be a valid IPv4 CIDR."
    });
  }

  if (managementPoolRange && !isIpInRange(input.ingressIp, managementPoolRange)) {
    issues.push({
      code: "INGRESS_OUTSIDE_MANAGEMENT_POOL",
      severity: "error",
      message: "Ingress IP must be inside the management IP pool."
    });
  }

  if (deploymentRange && isIpInRange(input.ingressIp, deploymentRange)) {
    issues.push({
      code: "INGRESS_OVERLAPS_DEPLOYMENT_RANGE",
      severity: "error",
      message: "Ingress IP must not overlap the deployment IP range."
    });
  }

  if (deploymentRange && containerRange && rangesOverlap(deploymentRange, containerRange)) {
    issues.push({
      code: "CONTAINER_RANGE_OVERLAP_DEPLOYMENT",
      severity: "error",
      message: "Container network range must not overlap deployment range."
    });
  }

  if (managementPoolRange && containerRange && rangesOverlap(managementPoolRange, containerRange)) {
    issues.push({
      code: "CONTAINER_RANGE_OVERLAP_MANAGEMENT",
      severity: "error",
      message: "Container network range must not overlap management IP pool."
    });
  }

  if (input.ingressEndpoints.length === 0) {
    issues.push({
      code: "INGRESS_ENDPOINTS_EMPTY",
      severity: "error",
      message: "At least one ingress endpoint is required for DNS validation."
    });
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
};
