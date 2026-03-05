import type { PolicyPack } from "../schemas/policy.js";

export const DEFAULT_POLICY_PACK_ID = "baseline-disconnectedops-v1";

const baselineDisconnectedOpsPack: PolicyPack = {
  id: DEFAULT_POLICY_PACK_ID,
  name: "Baseline DisconnectedOps",
  version: "1.0.0",
  description:
    "Baseline readiness policy for Azure Local disconnected operations planning and pre-flight evidence.",
  rules: [
    {
      key: "PROJECT_VALIDATION_PASSED",
      label: "Project Wizard Validation",
      description: "Project inputs satisfy required topology and network constraints.",
      severity: "critical",
      required: true,
      enabled: true
    },
    {
      key: "ACQUISITION_PREREQUISITES_CONFIRMED",
      label: "Acquisition Prerequisites Confirmed",
      description: "Latest acquire scan confirms subscription, approval, RBAC, and no-bypass acknowledgement.",
      severity: "critical",
      required: true,
      enabled: true
    },
    {
      key: "RUN_ACQUIRE_SCAN_COMPLETED",
      label: "Acquire Scan Completed",
      description: "Latest acquire scan run completed on a runner host.",
      severity: "critical",
      required: true,
      enabled: true
    },
    {
      key: "RUN_NETCHECK_COMPLETED",
      label: "Network Checks Completed",
      description: "Latest network check run completed from execution host network perspective.",
      severity: "critical",
      required: true,
      enabled: true
    },
    {
      key: "RUN_PKI_VALIDATE_COMPLETED",
      label: "PKI Validation Completed",
      description: "Latest PKI validation run evidence exists and completed successfully.",
      severity: "critical",
      required: true,
      enabled: true
    },
    {
      key: "RUN_ENVCHECK_COMPLETED",
      label: "Environment Checker Completed",
      description: "Environment Checker run completed; treated as warning if missing in baseline pack.",
      severity: "warning",
      required: false,
      enabled: true
    }
  ]
};

const policyPacks: PolicyPack[] = [baselineDisconnectedOpsPack];

const clonePolicyPack = (policyPack: PolicyPack): PolicyPack => ({
  ...policyPack,
  rules: policyPack.rules.map((rule) => ({ ...rule }))
});

export const listPolicyPacks = (): PolicyPack[] => policyPacks.map(clonePolicyPack);

export const getPolicyPackById = (id: string): PolicyPack | null => {
  const policyPack = policyPacks.find((candidate) => candidate.id === id);
  return policyPack ? clonePolicyPack(policyPack) : null;
};
