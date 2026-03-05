import type { RunStatus, RunType } from "../schemas/runs.js";
import type {
  PolicyCheck,
  PolicyCheckStatus,
  PolicyEvaluation,
  PolicyPack,
  PolicyRule
} from "../schemas/policy.js";

export type PolicyRunSnapshot = {
  id: string;
  type: RunType;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  requestJson: Record<string, unknown>;
};

export type PolicyProjectValidation = {
  valid: boolean;
  issues: Array<{
    code: string;
    message: string;
    severity: "error" | "warning";
  }>;
};

export type PolicyEvaluationInput = {
  evaluatedAt?: string;
  projectValidation: PolicyProjectValidation;
  latestRuns: Partial<Record<RunType, PolicyRunSnapshot>>;
};

const hasAcquirePrerequisiteAcks = (run: PolicyRunSnapshot | undefined): boolean => {
  if (!run || typeof run.requestJson !== "object" || run.requestJson === null) {
    return false;
  }

  const request = run.requestJson;
  return (
    request.azureSubscriptionActive === true &&
    request.approvalGranted === true &&
    request.hasRequiredRbac === true &&
    request.understandsNoBypass === true
  );
};

const completedRunCheck = (
  rule: PolicyRule,
  runType: RunType,
  run: PolicyRunSnapshot | undefined
): PolicyCheck => {
  if (!run) {
    return {
      key: rule.key,
      status: rule.required ? "fail" : "warn",
      severity: rule.severity,
      message: `No ${runType} run evidence found.`,
      evidence: {
        runType
      }
    };
  }

  if (run.status === "completed") {
    return {
      key: rule.key,
      status: "pass",
      severity: rule.severity,
      message: `${runType} run completed.`,
      evidence: {
        runId: run.id,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt
      }
    };
  }

  const incompleteStatus: PolicyCheckStatus = rule.required ? "fail" : "warn";
  return {
    key: rule.key,
    status: incompleteStatus,
    severity: rule.severity,
    message: `${runType} run status is ${run.status}.`,
    evidence: {
      runId: run.id,
      status: run.status
    }
  };
};

const evaluateRule = (rule: PolicyRule, input: PolicyEvaluationInput): PolicyCheck => {
  if (!rule.enabled) {
    return {
      key: rule.key,
      status: "not_applicable",
      severity: rule.severity,
      message: "Rule disabled."
    };
  }

  switch (rule.key) {
    case "PROJECT_VALIDATION_PASSED": {
      if (input.projectValidation.valid) {
        return {
          key: rule.key,
          status: "pass",
          severity: rule.severity,
          message: "Project validation passed."
        };
      }

      const errors = input.projectValidation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => `${issue.code}: ${issue.message}`);
      return {
        key: rule.key,
        status: "fail",
        severity: rule.severity,
        message: "Project validation has errors.",
        evidence: {
          errors
        }
      };
    }

    case "ACQUISITION_PREREQUISITES_CONFIRMED": {
      const acquireRun = input.latestRuns.acquire_scan;
      const acknowledged = hasAcquirePrerequisiteAcks(acquireRun);
      if (acknowledged) {
        return {
          key: rule.key,
          status: "pass",
          severity: rule.severity,
          message: "Acquire prerequisites are acknowledged in latest acquire scan request.",
          evidence: {
            runId: acquireRun?.id ?? null
          }
        };
      }

      return {
        key: rule.key,
        status: "fail",
        severity: rule.severity,
        message:
          "Acquire prerequisites are missing or unconfirmed (subscription, approval, RBAC, no-bypass acknowledgement).",
        evidence: {
          runId: acquireRun?.id ?? null
        }
      };
    }

    case "RUN_ACQUIRE_SCAN_COMPLETED":
      return completedRunCheck(rule, "acquire_scan", input.latestRuns.acquire_scan);
    case "RUN_NETCHECK_COMPLETED":
      return completedRunCheck(rule, "netcheck", input.latestRuns.netcheck);
    case "RUN_PKI_VALIDATE_COMPLETED":
      return completedRunCheck(rule, "pki_validate", input.latestRuns.pki_validate);
    case "RUN_ENVCHECK_COMPLETED":
      return completedRunCheck(rule, "envcheck", input.latestRuns.envcheck);
  }
};

export const evaluatePolicyPack = (policyPack: PolicyPack, input: PolicyEvaluationInput): PolicyEvaluation => {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const checks = policyPack.rules.map((rule) => evaluateRule(rule, input));
  const countedChecks = checks.filter((check) => check.status !== "not_applicable");

  const passCount = countedChecks.filter((check) => check.status === "pass").length;
  const warnCount = countedChecks.filter((check) => check.status === "warn").length;
  const failCount = countedChecks.filter((check) => check.status === "fail").length;

  const overallStatus = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  return {
    packId: policyPack.id,
    packVersion: policyPack.version,
    evaluatedAt,
    overallStatus,
    summary: {
      total: countedChecks.length,
      passCount,
      warnCount,
      failCount
    },
    checks
  };
};
