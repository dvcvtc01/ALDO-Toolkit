import type { AcquisitionChecklistInput } from "../schemas/acquisition.js";
import type { ValidationIssue, ValidationResult } from "./project-validator.js";

export const validateAcquisitionChecklist = (input: AcquisitionChecklistInput): ValidationResult => {
  const issues: ValidationIssue[] = [];

  if (!input.azureSubscriptionActive) {
    issues.push({
      code: "AZURE_SUBSCRIPTION_REQUIRED",
      severity: "error",
      message: "Acquisition requires an active Azure subscription."
    });
  }

  if (!input.approvalGranted) {
    issues.push({
      code: "APPROVAL_REQUIRED",
      severity: "error",
      message: "Acquisition requires approved access to disconnected operations."
    });
  }

  if (!input.hasRequiredRbac) {
    issues.push({
      code: "RBAC_REQUIRED",
      severity: "error",
      message: "RBAC permission to create a disconnected operations instance is required."
    });
  }

  if (!input.understandsNoBypass) {
    issues.push({
      code: "NO_BYPASS_ACK_REQUIRED",
      severity: "error",
      message: "Toolkit cannot bypass Microsoft control-plane requirements."
    });
  }

  return {
    valid: issues.length === 0,
    issues
  };
};
