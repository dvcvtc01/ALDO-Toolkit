import { z } from "zod";

const ipv4Segment = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const ipv4Regex = new RegExp(`^${ipv4Segment}(\\.${ipv4Segment}){3}$`);
const cidrRegex = new RegExp(`^${ipv4Segment}(\\.${ipv4Segment}){3}\\/(\\d|[1-2]\\d|3[0-2])$`);

const endpointSchema = z.object({
  name: z.string().trim().min(2),
  fqdn: z.string().trim().min(3)
});

export const wizardSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().trim().max(1000).optional(),
  environmentType: z.enum(["air-gapped", "limited-connectivity"]),
  deploymentModel: z.literal("physical"),
  domainName: z.string().trim().min(3),
  dnsServers: z.array(z.string().regex(ipv4Regex)).min(1),
  nodeCountTarget: z.number().int().min(3).max(16),
  managementIpPool: z.string().trim().min(3),
  ingressIp: z.string().regex(ipv4Regex),
  deploymentRange: z.string().regex(cidrRegex),
  containerNetworkRange: z.string().regex(cidrRegex),
  identityProviderHost: z.string().trim().min(3),
  ingressEndpoints: z.array(endpointSchema).min(1),
  notes: z.string().trim().max(4000).optional()
});

export type WizardProjectInput = z.infer<typeof wizardSchema>;
export type WizardFieldKey =
  | "name"
  | "description"
  | "environmentType"
  | "deploymentModel"
  | "domainName"
  | "dnsServers"
  | "nodeCountTarget"
  | "managementIpPool"
  | "ingressIp"
  | "deploymentRange"
  | "containerNetworkRange"
  | "identityProviderHost"
  | "ingressEndpoints"
  | "notes";

export type WizardValidationResult = {
  valid: boolean;
  summary: string[];
  fieldErrors: Partial<Record<WizardFieldKey, string>>;
};

export const defaultWizardInput: WizardProjectInput = {
  name: "",
  description: "",
  environmentType: "air-gapped",
  deploymentModel: "physical",
  domainName: "",
  dnsServers: ["10.10.0.10"],
  nodeCountTarget: 3,
  managementIpPool: "10.20.0.10-10.20.0.50",
  ingressIp: "10.20.0.20",
  deploymentRange: "10.30.0.0/24",
  containerNetworkRange: "10.40.0.0/24",
  identityProviderHost: "",
  ingressEndpoints: [{ name: "portal", fqdn: "" }],
  notes: ""
};

const getTopLevelField = (path: Array<string | number>): WizardFieldKey | null => {
  const top = path[0];
  if (typeof top !== "string") {
    return null;
  }

  const directFields: WizardFieldKey[] = [
    "name",
    "description",
    "environmentType",
    "deploymentModel",
    "domainName",
    "dnsServers",
    "nodeCountTarget",
    "managementIpPool",
    "ingressIp",
    "deploymentRange",
    "containerNetworkRange",
    "identityProviderHost",
    "ingressEndpoints",
    "notes"
  ];

  return directFields.includes(top as WizardFieldKey) ? (top as WizardFieldKey) : null;
};

const addIssue = (
  summary: string[],
  fieldErrors: Partial<Record<WizardFieldKey, string>>,
  message: string,
  field: WizardFieldKey | null
): void => {
  if (!summary.includes(message)) {
    summary.push(message);
  }
  if (field && !fieldErrors[field]) {
    fieldErrors[field] = message;
  }
};

export const validateWizard = (input: WizardProjectInput): WizardValidationResult => {
  const parsed = wizardSchema.safeParse(input);
  const summary: string[] = [];
  const fieldErrors: Partial<Record<WizardFieldKey, string>> = {};

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = getTopLevelField(issue.path);
      addIssue(summary, fieldErrors, issue.message, field);
    }
  }

  if (input.deploymentModel !== "physical") {
    addIssue(
      summary,
      fieldErrors,
      "Disconnected operations management instance must be deployed on physical machines.",
      "deploymentModel"
    );
  }

  if (input.nodeCountTarget < 3 || input.nodeCountTarget > 16) {
    addIssue(
      summary,
      fieldErrors,
      "Management instance requires between 3 and 16 physical machines.",
      "nodeCountTarget"
    );
  }

  if (input.ingressEndpoints.length === 0) {
    addIssue(
      summary,
      fieldErrors,
      "At least one ingress endpoint is required for DNS validation.",
      "ingressEndpoints"
    );
  }

  return {
    valid: summary.length === 0,
    summary,
    fieldErrors
  };
};

export const validateWizardInline = (input: WizardProjectInput): string[] => validateWizard(input).summary;
