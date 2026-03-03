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
  runAcquisition: async (
    token: string,
    projectId: string,
    payload: {
      azureSubscriptionActive: boolean;
      approvalGranted: boolean;
      hasRequiredRbac: boolean;
      understandsNoBypass: true;
      versionNotes: string;
      expectedArtifacts: Array<{ relativePath: string; sha256: string; sizeBytes?: number }>;
      providedArtifactRoot: string;
    }
  ): Promise<unknown> => {
    const client = getClient({ token });
    const result = await client.POST("/api/v1/projects/{projectId}/validate/acquisition", {
      params: {
        path: { projectId }
      },
      body: payload
    });
    return unwrap(result, "Acquisition validation failed");
  },
  runNetwork: async (
    token: string,
    projectId: string,
    payload: {
      ingressIp?: string | undefined;
      endpoints?: string[] | undefined;
      identityProviderHost?: string | undefined;
    }
  ): Promise<unknown> => {
    const client = getClient({ token });
    const result = await client.POST("/api/v1/projects/{projectId}/validate/network", {
      params: {
        path: { projectId }
      },
      body: payload
    });
    return unwrap(result, "Network validation failed");
  },
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
  list: async (token: string, projectId: string): Promise<unknown[]> => {
    const client = getClient({ token });
    const result = await client.GET("/api/v1/projects/{projectId}/runs", {
      params: {
        path: { projectId }
      }
    });
    return unwrap<unknown[]>(result, "Unable to load runs");
  }
};
