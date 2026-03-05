import createClient from "openapi-fetch";

import type { paths } from "./api-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "Admin" | "Operator" | "Viewer";
  createdAt: string;
};

export type AuthResponse = {
  tokenType: string;
  accessToken: string;
  user: AuthUser;
};

export type ProjectRecord = {
  id: string;
  name: string;
  environmentType: "air-gapped" | "limited-connectivity";
  deploymentModel: "physical";
  domainName: string;
  dnsServers: string[];
  nodeCountTarget: number;
  managementIpPool: string;
  ingressIp: string;
  deploymentRange: string;
  containerNetworkRange: string;
  identityProviderHost: string;
  ingressEndpoints: Array<{ name: string; fqdn: string }>;
  health: "Green" | "Amber" | "Red";
  createdAt: string;
  updatedAt: string;
  ownerUserId: string;
  description?: string | undefined;
  notes?: string | undefined;
};

export type ProjectPayload = {
  name: string;
  description?: string;
  environmentType: "air-gapped" | "limited-connectivity";
  deploymentModel: "physical";
  domainName: string;
  dnsServers: string[];
  nodeCountTarget: number;
  managementIpPool: string;
  ingressIp: string;
  deploymentRange: string;
  containerNetworkRange: string;
  identityProviderHost: string;
  ingressEndpoints: Array<{ name: string; fqdn: string }>;
  notes?: string;
};

export type RunType = "acquire_scan" | "netcheck" | "pki_validate" | "envcheck";
export type RunStatus = "requested" | "in_progress" | "completed" | "failed";
export type SupportBundleStatus = "queued" | "building" | "ready" | "failed";
export type PolicyRuleSeverity = "critical" | "warning" | "info";
export type PolicyCheckStatus = "pass" | "warn" | "fail" | "not_applicable";
export type PolicyOverallStatus = "pass" | "warn" | "fail";

export type RunRecord = {
  id: string;
  projectId: string;
  type: RunType;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  executedBy: {
    hostname: string;
    username: string;
    runnerVersion: string;
  } | null;
  transcriptText: string | null;
  transcriptLines: Array<Record<string, unknown>>;
  resultJson: unknown;
  artifacts: Array<{
    filename: string;
    relativePath?: string | undefined;
    sha256: string;
    sizeBytes: number;
    modifiedAt?: string | undefined;
  }>;
  requestJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportBundleRecord = {
  id: string;
  projectId: string;
  status: SupportBundleStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedByUserId: string | null;
  filePath: string | null;
  fileSize: number | null;
  sha256: string | null;
  manifestJson: {
    formatVersion: "1.0";
    generatedAtUtc: string;
    files: Array<{
      path: string;
      sha256: string;
      sizeBytes: number;
    }>;
  } | null;
  error: string | null;
};

export type PolicyPack = {
  id: string;
  name: string;
  version: string;
  description: string;
  rules: Array<{
    key:
      | "PROJECT_VALIDATION_PASSED"
      | "ACQUISITION_PREREQUISITES_CONFIRMED"
      | "RUN_ACQUIRE_SCAN_COMPLETED"
      | "RUN_NETCHECK_COMPLETED"
      | "RUN_PKI_VALIDATE_COMPLETED"
      | "RUN_ENVCHECK_COMPLETED";
    label: string;
    description: string;
    severity: PolicyRuleSeverity;
    required: boolean;
    enabled: boolean;
  }>;
};

export type PolicyEvaluationRecord = {
  id: string;
  projectId: string;
  packId: string;
  packVersion: string;
  overallStatus: PolicyOverallStatus;
  evaluation: {
    packId: string;
    packVersion: string;
    evaluatedAt: string;
    overallStatus: PolicyOverallStatus;
    summary: {
      total: number;
      passCount: number;
      warnCount: number;
      failCount: number;
    };
    checks: Array<{
      key:
        | "PROJECT_VALIDATION_PASSED"
        | "ACQUISITION_PREREQUISITES_CONFIRMED"
        | "RUN_ACQUIRE_SCAN_COMPLETED"
        | "RUN_NETCHECK_COMPLETED"
        | "RUN_PKI_VALIDATE_COMPLETED"
        | "RUN_ENVCHECK_COMPLETED";
      status: PolicyCheckStatus;
      severity: PolicyRuleSeverity;
      message: string;
      evidence?: Record<string, unknown>;
    }>;
  };
  createdBy: string | null;
  createdAt: string;
};

type RequestOptions = {
  token?: string;
};

const getClient = ({ token }: RequestOptions = {}) =>
  createClient<paths>({
    baseUrl: API_BASE_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

const unwrap = <T>(
  result: { data?: T | undefined; error?: unknown },
  fallbackMessage: string
): T => {
  if (result.error) {
    if (typeof result.error === "object" && result.error !== null && "message" in result.error) {
      throw new Error(String((result.error as { message?: string }).message ?? fallbackMessage));
    }
    throw new Error(fallbackMessage);
  }

  if (!result.data) {
    throw new Error(fallbackMessage);
  }

  return result.data;
};

export const authApi = {
  bootstrapAdmin: async (payload: {
    username: string;
    password: string;
    displayName: string;
  }): Promise<AuthResponse> => {
    const client = getClient();
    const result = await client.POST("/api/v1/auth/bootstrap", { body: payload });
    return unwrap<AuthResponse>(result, "Bootstrap failed");
  },
  login: async (payload: { username: string; password: string }): Promise<AuthResponse> => {
    const client = getClient();
    const result = await client.POST("/api/v1/auth/login", { body: payload });
    return unwrap<AuthResponse>(result, "Login failed");
  },
  me: async (token: string): Promise<AuthUser> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/auth/me");
    return unwrap<AuthUser>(result, "Unable to load current user");
  }
};

export const projectsApi = {
  list: async (token: string): Promise<ProjectRecord[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects");
    return unwrap<ProjectRecord[]>(result, "Unable to load projects");
  },
  create: async (token: string, payload: ProjectPayload): Promise<ProjectRecord> => {
    const client = getClient({ token });
    const result = await client.POST("/api/v1/projects", { body: payload });
    return unwrap<ProjectRecord>(result, "Unable to create project");
  },
  get: async (token: string, projectId: string): Promise<ProjectRecord> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<ProjectRecord>(result, "Unable to load project");
  }
};

export const validationApi = {
  runPkiUpload: async (
    token: string,
    projectId: string,
    file: File,
    deployDate: string,
    passphrase?: string
  ): Promise<unknown> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("deployDate", deployDate);
    if (passphrase) {
      formData.append("passphrase", passphrase);
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/validate/pki`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "PKI validation failed");
    }

    return response.json();
  },
  list: async (token: string, projectId: string): Promise<unknown[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}/validations", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<unknown[]>(result, "Unable to load validations");
  }
};

export const exportApi = {
  generate: async (token: string, projectId: string): Promise<unknown> => {
    const client = getClient({ token });
    const result = await client.POST("/api/v1/projects/{projectId}/exports/generate", {
      params: {
        path: { projectId }
      }
    });
    return unwrap(result, "Export generation failed");
  },
  list: async (token: string, projectId: string): Promise<unknown[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}/exports", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<unknown[]>(result, "Unable to load exports");
  }
};

export const runsApi = {
  create: async (
    token: string,
    projectId: string,
    payload: { type: RunType; requestJson?: Record<string, unknown> }
  ): Promise<RunRecord> => {
    const client = getClient({ token });
    const result = await client.POST("/api/v1/projects/{projectId}/runs", {
      params: {
        path: { projectId }
      },
      body: {
        type: payload.type,
        requestJson: payload.requestJson ?? {}
      }
    });
    return unwrap<RunRecord>(result, "Unable to create run request");
  },
  list: async (
    token: string,
    projectId: string,
    filters?: {
      type?: RunType;
      status?: RunStatus;
    }
  ): Promise<RunRecord[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}/runs", {
      params: {
        path: { projectId },
        query: {
          ...(filters?.type ? { type: filters.type } : {}),
          ...(filters?.status ? { status: filters.status } : {})
        }
      }
    });
    return unwrap<RunRecord[]>(result, "Unable to load runs");
  },
  get: async (token: string, runId: string): Promise<RunRecord> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/runs/{runId}", {
      params: {
        path: { runId }
      }
    });
    return unwrap<RunRecord>(result, "Unable to load run");
  }
};

const parseFilenameFromDisposition = (headerValue: string | null): string | null => {
  if (!headerValue) {
    return null;
  }

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = headerValue.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
};

export const supportBundlesApi = {
  create: async (token: string, projectId: string): Promise<SupportBundleRecord> => {
    const client = getClient({ token });
    const result = await client.POST("/api/v1/projects/{projectId}/support-bundles", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<SupportBundleRecord>(result, "Unable to request support bundle");
  },
  list: async (token: string, projectId: string): Promise<SupportBundleRecord[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}/support-bundles", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<SupportBundleRecord[]>(result, "Unable to load support bundles");
  },
  get: async (token: string, bundleId: string): Promise<SupportBundleRecord> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/support-bundles/{bundleId}", {
      params: {
        path: { bundleId }
      }
    });
    return unwrap<SupportBundleRecord>(result, "Unable to load support bundle details");
  },
  download: async (
    token: string,
    bundleId: string
  ): Promise<{
    blob: Blob;
    filename: string;
  }> => {
    const response = await fetch(`${API_BASE_URL}/api/v1/support-bundles/${bundleId}/download`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Unable to download support bundle");
    }

    const blob = await response.blob();
    const filename =
      parseFilenameFromDisposition(response.headers.get("content-disposition")) ??
      `ALDO_SupportBundle_${bundleId}.zip`;

    return {
      blob,
      filename
    };
  }
};

export const policyApi = {
  listPacks: async (token: string): Promise<PolicyPack[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/policy-packs");
    return unwrap<PolicyPack[]>(result, "Unable to load policy packs");
  },
  evaluate: async (
    token: string,
    projectId: string,
    payload: {
      packId?: string;
    } = {}
  ): Promise<PolicyEvaluationRecord> => {
    const client = getClient({ token });
    const result = await client.POST("/api/v1/projects/{projectId}/policy-evaluations", {
      params: {
        path: { projectId }
      },
      body: {
        ...(payload.packId ? { packId: payload.packId } : {})
      }
    });
    return unwrap<PolicyEvaluationRecord>(result, "Unable to evaluate policy pack");
  },
  list: async (token: string, projectId: string): Promise<PolicyEvaluationRecord[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}/policy-evaluations", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<PolicyEvaluationRecord[]>(result, "Unable to load policy evaluations");
  },
  latest: async (token: string, projectId: string): Promise<PolicyEvaluationRecord> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}/policy-evaluations/latest", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<PolicyEvaluationRecord>(result, "Unable to load latest policy evaluation");
  }
};
