import { z } from "zod";

import { isCidr, isIpv4, parseIpPool } from "../utils/ip.js";

const hostnameRegex =
  /^(?=.{1,253}$)(?:(?!-)[a-zA-Z0-9-]{1,63}(?<!-)\.)+(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/;

const ipPoolSchema = z
  .string()
  .trim()
  .min(7)
  .max(64)
  .refine((value) => {
    try {
      parseIpPool(value);
      return true;
    } catch {
      return false;
    }
  }, "Management IP pool must be CIDR, single IP, or start-end range.");

const cidrSchema = z.string().trim().refine((value) => isCidr(value), "Value must be a valid IPv4 CIDR.");
const ipv4Schema = z.string().trim().refine((value) => isIpv4(value), "Value must be a valid IPv4 address.");

const endpointSchema = z.object({
  name: z.string().trim().min(2).max(64),
  fqdn: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => hostnameRegex.test(value), "Endpoint FQDN must be a valid hostname.")
});

export const environmentTypeSchema = z.enum(["air-gapped", "limited-connectivity"]);
export const deploymentModelSchema = z.enum(["physical"]);

export const projectWizardSchema = z.object({
  name: z.string().trim().min(3).max(128),
  description: z.string().trim().max(1000).optional(),
  environmentType: environmentTypeSchema,
  deploymentModel: deploymentModelSchema.default("physical"),
  domainName: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => hostnameRegex.test(value), "Domain name must be a valid FQDN."),
  dnsServers: z.array(ipv4Schema).min(1).max(6),
  nodeCountTarget: z.number().int().min(3).max(16),
  managementIpPool: ipPoolSchema,
  ingressIp: ipv4Schema,
  deploymentRange: cidrSchema,
  containerNetworkRange: cidrSchema,
  identityProviderHost: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => hostnameRegex.test(value), "Identity provider must be a valid FQDN."),
  ingressEndpoints: z.array(endpointSchema).min(1).max(16),
  notes: z.string().trim().max(4000).optional()
});

export const projectPatchSchema = projectWizardSchema.partial();

export type ProjectWizardInput = z.infer<typeof projectWizardSchema>;
export type ProjectPatchInput = z.infer<typeof projectPatchSchema>;
