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

export const validateWizardInline = (input: WizardProjectInput): string[] => {
  const parsed = wizardSchema.safeParse(input);
  const issues = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);

  if (input.deploymentModel !== "physical") {
    issues.push("Virtual deployment is unsupported. Use physical machines only.");
  }

  if (input.nodeCountTarget < 3 || input.nodeCountTarget > 16) {
    issues.push("Management instance requires 3 to 16 nodes.");
  }

  return issues;
};
