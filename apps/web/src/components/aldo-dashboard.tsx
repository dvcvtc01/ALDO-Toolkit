"use client";

import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Spinner,
  Textarea
} from "@fluentui/react-components";
import {
  ArrowClockwise24Regular,
  ArrowDownload24Regular,
  Copy24Regular,
  Play24Regular
} from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";

import {
  type AuthUser,
  authApi,
  exportApi,
  policyApi,
  type PolicyEvaluationRecord,
  type PolicyPack,
  type ProjectPayload,
  type ProjectRecord,
  type RunRecord,
  type RunStatus,
  type RunType,
  projectsApi,
  runsApi,
  supportBundlesApi,
  type SupportBundleRecord,
  validationApi
} from "../lib/api-client";
import { defaultWizardInput, type WizardProjectInput, validateWizard } from "../lib/wizard";

type NavItem = "Overview" | "Plan" | "Acquire" | "PKI" | "Checks" | "Policy" | "Exports" | "Runs";

const navItems: NavItem[] = ["Overview", "Plan", "Acquire", "PKI", "Checks", "Policy", "Exports", "Runs"];
const wizardSteps = ["Basics", "Capacity", "Network", "Identity"];

const tokenStorageKey = "aldo-token";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const AldoDashboard = () => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("Overview");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [bootstrapDisplayName, setBootstrapDisplayName] = useState("");

  const [wizard, setWizard] = useState<WizardProjectInput>(defaultWizardInput);
  const [wizardStep, setWizardStep] = useState(0);

  const [artifactRoot, setArtifactRoot] = useState("C:\\artifacts");
  const [artifactPath, setArtifactPath] = useState("payload/update.zip");
  const [artifactHash, setArtifactHash] = useState("");
  const [acqVersionNotes, setAcqVersionNotes] = useState("User-entered compatibility notes.");
  const [acqHasSubscription, setAcqHasSubscription] = useState(false);
  const [acqApproval, setAcqApproval] = useState(false);
  const [acqRbac, setAcqRbac] = useState(false);
  const [acquireRunnerCommand, setAcquireRunnerCommand] = useState("");
  const [acquireLatestRun, setAcquireLatestRun] = useState<RunRecord | null>(null);

  const [networkEndpoints, setNetworkEndpoints] = useState("");
  const [networkRunnerCommand, setNetworkRunnerCommand] = useState("");
  const [networkLatestRun, setNetworkLatestRun] = useState<RunRecord | null>(null);
  const [envcheckModulePath, setEnvcheckModulePath] = useState("C:\\staged\\EnvironmentChecker");
  const [envcheckAdditionalArgs, setEnvcheckAdditionalArgs] = useState("");
  const [envcheckRunnerCommand, setEnvcheckRunnerCommand] = useState("");
  const [envcheckLatestRun, setEnvcheckLatestRun] = useState<RunRecord | null>(null);

  const [pkiFile, setPkiFile] = useState<File | null>(null);
  const [pkiPassphrase, setPkiPassphrase] = useState("");
  const [pkiResult, setPkiResult] = useState<string>("");

  const [exportsResult, setExportsResult] = useState<string>("");
  const [policyPacks, setPolicyPacks] = useState<PolicyPack[]>([]);
  const [selectedPolicyPackId, setSelectedPolicyPackId] = useState<string>("baseline-disconnectedops-v1");
  const [policyEvaluations, setPolicyEvaluations] = useState<PolicyEvaluationRecord[]>([]);
  const [selectedPolicyEvaluation, setSelectedPolicyEvaluation] = useState<PolicyEvaluationRecord | null>(null);
  const [supportBundles, setSupportBundles] = useState<SupportBundleRecord[]>([]);
  const [selectedBundleDetail, setSelectedBundleDetail] = useState<SupportBundleRecord | null>(null);
  const [runsList, setRunsList] = useState<RunRecord[]>([]);
  const [runFilterType, setRunFilterType] = useState<"all" | RunType>("all");
  const [runFilterStatus, setRunFilterStatus] = useState<"all" | RunStatus>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunRecord | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const wizardValidation = useMemo(() => validateWizard(wizard), [wizard]);
  const getWizardFieldError = (field: keyof typeof wizardValidation.fieldErrors): string | undefined =>
    wizardValidation.fieldErrors[field];
  const fieldValidationProps = (
    field: keyof typeof wizardValidation.fieldErrors
  ): {
    validationState?: "error";
    validationMessage?: string;
  } => {
    const message = getWizardFieldError(field);
    if (!message) {
      return {};
    }
    return {
      validationState: "error",
      validationMessage: message
    };
  };

  const projectHealthClass = (health: ProjectRecord["health"]): string => {
    if (health === "Green") return "tag-green";
    if (health === "Amber") return "tag-amber";
    return "tag-red";
  };

  const supportBundleStatusClass = (status: SupportBundleRecord["status"]): string => {
    if (status === "ready") return "tag-green";
    if (status === "failed") return "tag-red";
    return "tag-amber";
  };

  const policyStatusClass = (
    status: PolicyEvaluationRecord["overallStatus"] | "pass" | "warn" | "fail"
  ): string => {
    if (status === "pass") return "tag-green";
    if (status === "fail") return "tag-red";
    return "tag-amber";
  };

  const envcheckSummaryFromRun = (
    run: RunRecord | null
  ): {
    overall: "Green" | "Amber" | "Red";
    topFailures: string[];
  } => {
    if (!run || !run.resultJson || typeof run.resultJson !== "object") {
      return {
        overall: "Amber",
        topFailures: []
      };
    }

    const result = run.resultJson as Record<string, unknown>;
    const summary =
      typeof result.summary === "object" && result.summary !== null
        ? (result.summary as Record<string, unknown>)
        : {};

    const overallRaw = typeof summary.overall === "string" ? summary.overall : "";
    const overall = (() => {
      const normalized = overallRaw.trim().toLowerCase();
      if (normalized === "green" || normalized === "pass" || normalized === "passed") return "Green";
      if (normalized === "red" || normalized === "fail" || normalized === "failed") return "Red";
      return "Amber";
    })();

    const topFailures = Array.isArray(summary.topFailures)
      ? summary.topFailures
          .map((entry) => {
            if (typeof entry === "string") {
              return entry;
            }
            if (typeof entry === "object" && entry !== null) {
              const record = entry as Record<string, unknown>;
              const category = typeof record.category === "string" ? record.category : "General";
              const name = typeof record.name === "string" ? record.name : "check";
              const message = typeof record.message === "string" ? record.message : "failed";
              return `${category}/${name}: ${message}`;
            }
            return null;
          })
          .filter((entry): entry is string => Boolean(entry))
      : [];

    return {
      overall,
      topFailures
    };
  };

  const applySession = (sessionToken: string, sessionUser: AuthUser): void => {
    localStorage.setItem(tokenStorageKey, sessionToken);
    setToken(sessionToken);
    setUser(sessionUser);
  };

  const clearSession = (): void => {
    localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setUser(null);
    setProjects([]);
    setSelectedProjectId(null);
    setPolicyPacks([]);
    setPolicyEvaluations([]);
    setSelectedPolicyEvaluation(null);
    setSupportBundles([]);
    setSelectedBundleDetail(null);
  };

  const loadProjects = async (authToken: string): Promise<void> => {
    const projectList = await projectsApi.list(authToken);
    setProjects(projectList);
    setSelectedProjectId((current) => current ?? projectList[0]?.id ?? null);
  };

  const loadSupportBundles = async (authToken: string, projectId: string): Promise<void> => {
    const bundles = await supportBundlesApi.list(authToken, projectId);
    setSupportBundles(bundles);
    setSelectedBundleDetail((current) =>
      current ? bundles.find((bundle) => bundle.id === current.id) ?? null : null
    );
  };

  const loadPolicyData = async (authToken: string, projectId: string): Promise<void> => {
    const [packs, evaluations] = await Promise.all([
      policyApi.listPacks(authToken),
      policyApi.list(authToken, projectId)
    ]);
    setPolicyPacks(packs);
    if (packs.length > 0 && !packs.some((pack) => pack.id === selectedPolicyPackId)) {
      setSelectedPolicyPackId(packs[0]!.id);
    }
    setPolicyEvaluations(evaluations);
    setSelectedPolicyEvaluation((current) =>
      current ? evaluations.find((evaluation) => evaluation.id === current.id) ?? evaluations[0] ?? null : evaluations[0] ?? null
    );
  };

  useEffect(() => {
    const initialize = async (): Promise<void> => {
      const storedToken = localStorage.getItem(tokenStorageKey);
      if (!storedToken) return;

      try {
        const me = await authApi.me(storedToken);
        setToken(storedToken);
        setUser(me);
        await loadProjects(storedToken);
      } catch {
        clearSession();
      }
    };

    void initialize();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setWizard({
      name: selectedProject.name,
      description: selectedProject.description ?? "",
      environmentType: selectedProject.environmentType,
      deploymentModel: selectedProject.deploymentModel,
      domainName: selectedProject.domainName,
      dnsServers: selectedProject.dnsServers,
      nodeCountTarget: selectedProject.nodeCountTarget,
      managementIpPool: selectedProject.managementIpPool,
      ingressIp: selectedProject.ingressIp,
      deploymentRange: selectedProject.deploymentRange,
      containerNetworkRange: selectedProject.containerNetworkRange,
      identityProviderHost: selectedProject.identityProviderHost,
      ingressEndpoints: selectedProject.ingressEndpoints,
      notes: selectedProject.notes ?? ""
    });
  }, [selectedProject]);

  const submitLogin = async (): Promise<void> => {
    setBusy(true);
    setStatusMessage("");
    try {
      const response = bootstrapMode
        ? await authApi.bootstrapAdmin({
            username: loginUsername,
            password: loginPassword,
            displayName: bootstrapDisplayName || loginUsername
          })
        : await authApi.login({
            username: loginUsername,
            password: loginPassword
          });
      applySession(response.accessToken, response.user);
      await loadProjects(response.accessToken);
      setStatusMessage(bootstrapMode ? "Bootstrap complete." : "Login successful.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const createProject = async (): Promise<void> => {
    if (!token) return;
    if (!wizardValidation.valid) {
      setStatusMessage("Resolve wizard validation issues before creating a project.");
      return;
    }

    setBusy(true);
    setStatusMessage("");
    try {
      const payload: ProjectPayload = {
        name: wizard.name,
        environmentType: wizard.environmentType,
        deploymentModel: wizard.deploymentModel,
        domainName: wizard.domainName,
        dnsServers: wizard.dnsServers,
        nodeCountTarget: wizard.nodeCountTarget,
        managementIpPool: wizard.managementIpPool,
        ingressIp: wizard.ingressIp,
        deploymentRange: wizard.deploymentRange,
        containerNetworkRange: wizard.containerNetworkRange,
        identityProviderHost: wizard.identityProviderHost,
        ingressEndpoints: wizard.ingressEndpoints,
        ...(wizard.description ? { description: wizard.description } : {}),
        ...(wizard.notes ? { notes: wizard.notes } : {})
      };

      const created = await projectsApi.create(token, payload);
      setProjects((current) => [created, ...current]);
      setSelectedProjectId(created.id);
      setStatusMessage(`Project ${created.name} created.`);
      setActiveNav("Overview");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Project creation failed.");
    } finally {
      setBusy(false);
    }
  };

  const quoteArg = (value: string): string => `"${value.replaceAll('"', '\\"')}"`;

  const copyRunnerCommand = async (command: string): Promise<void> => {
    await navigator.clipboard.writeText(command);
    setStatusMessage("Runner command copied.");
  };

  const buildAcquireRunnerCommand = (runId: string): string => {
    const command: string[] = [
      "aldo-runner acquire scan",
      `--server ${apiBaseUrl}`,
      `--project ${selectedProjectId ?? "<project-id>"}`,
      `--run ${runId}`,
      "--token <jwt>",
      `--root ${quoteArg(artifactRoot)}`
    ];
    if (artifactPath.trim().length > 0) {
      command.push(`--expectedPath ${quoteArg(artifactPath.trim())}`);
    }
    if (artifactHash.trim().length > 0) {
      command.push(`--expectedSha256 ${artifactHash.trim()}`);
    }
    return command.join(" ");
  };

  const buildNetworkRunnerCommand = (runId: string): string => {
    const endpoints = networkEndpoints
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    const command: string[] = [
      "aldo-runner netcheck",
      `--server ${apiBaseUrl}`,
      `--project ${selectedProjectId ?? "<project-id>"}`,
      `--run ${runId}`,
      "--token <jwt>"
    ];

    if (endpoints.length > 0) {
      command.push(`--endpoints ${quoteArg(endpoints.join(","))}`);
    }
    return command.join(" ");
  };

  const buildEnvcheckRunnerCommand = (runId: string): string => {
    const command: string[] = [
      "aldo-runner envcheck",
      `--server ${apiBaseUrl}`,
      `--project ${selectedProjectId ?? "<project-id>"}`,
      `--run ${runId}`,
      "--token <jwt>",
      `--modulePath ${quoteArg(envcheckModulePath || "<module-path>")}`
    ];

    if (envcheckAdditionalArgs.trim().length > 0) {
      command.push(`--additionalArgs ${quoteArg(envcheckAdditionalArgs.trim())}`);
    }
    return command.join(" ");
  };

  const downloadWizardJson = (): void => {
    const blob = new Blob([JSON.stringify(wizard, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-wizard-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const refreshRunSnapshots = async (
    authToken: string,
    projectId: string,
    options: {
      runFilters?: { type?: RunType; status?: RunStatus };
      preserveSelected?: boolean;
    } = {}
  ): Promise<void> => {
    const [acquireRuns, networkRuns, envcheckRuns, filteredRuns] = await Promise.all([
      runsApi.list(authToken, projectId, { type: "acquire_scan" }),
      runsApi.list(authToken, projectId, { type: "netcheck" }),
      runsApi.list(authToken, projectId, { type: "envcheck" }),
      runsApi.list(authToken, projectId, options.runFilters)
    ]);

    setAcquireLatestRun(acquireRuns[0] ?? null);
    setNetworkLatestRun(networkRuns[0] ?? null);
    setEnvcheckLatestRun(envcheckRuns[0] ?? null);
    setRunsList(filteredRuns);

    if (filteredRuns.length === 0) {
      setSelectedRunId(null);
      setSelectedRunDetail(null);
      return;
    }

    const nextRunId =
      options.preserveSelected && selectedRunId && filteredRuns.some((run) => run.id === selectedRunId)
        ? selectedRunId
        : filteredRuns[0]!.id;
    setSelectedRunId(nextRunId);

    const detail = await runsApi.get(authToken, nextRunId);
    setSelectedRunDetail(detail);
  };

  const requestAcquireScan = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    if (!acqHasSubscription || !acqApproval || !acqRbac) {
      setStatusMessage("Acquisition prerequisites must all be confirmed before requesting a scan.");
      return;
    }
    setBusy(true);
    setStatusMessage("");
    try {
      const run = await runsApi.create(token, selectedProjectId, {
        type: "acquire_scan",
        requestJson: {
          providedArtifactRoot: artifactRoot,
          expectedRelativePath: artifactPath,
          expectedSha256: artifactHash || undefined,
          versionNotes: acqVersionNotes,
          azureSubscriptionActive: acqHasSubscription,
          approvalGranted: acqApproval,
          hasRequiredRbac: acqRbac,
          understandsNoBypass: true
        }
      });

      const command = buildAcquireRunnerCommand(run.id);
      setAcquireRunnerCommand(command);
      await refreshRunSnapshots(token, selectedProjectId, {
        runFilters: {
          ...(runFilterType !== "all" ? { type: runFilterType } : {}),
          ...(runFilterStatus !== "all" ? { status: runFilterStatus } : {})
        },
        preserveSelected: true
      });
      setStatusMessage("Acquire scan run requested. Execute the runner command from the target host.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to request acquire scan.");
    } finally {
      setBusy(false);
    }
  };

  const requestNetworkCheck = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const endpoints = networkEndpoints
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      const run = await runsApi.create(token, selectedProjectId, {
        type: "netcheck",
        requestJson: {
          endpoints,
          ingressIp: selectedProject?.ingressIp ?? undefined
        }
      });

      const command = buildNetworkRunnerCommand(run.id);
      setNetworkRunnerCommand(command);
      await refreshRunSnapshots(token, selectedProjectId, {
        runFilters: {
          ...(runFilterType !== "all" ? { type: runFilterType } : {}),
          ...(runFilterStatus !== "all" ? { status: runFilterStatus } : {})
        },
        preserveSelected: true
      });
      setStatusMessage("Network check run requested. Execute the runner command from the target host.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to request network checks.");
    } finally {
      setBusy(false);
    }
  };

  const requestEnvcheckRun = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    if (envcheckModulePath.trim().length === 0) {
      setStatusMessage("Environment Checker module path is required.");
      return;
    }

    setBusy(true);
    setStatusMessage("");
    try {
      const run = await runsApi.create(token, selectedProjectId, {
        type: "envcheck",
        requestJson: {
          modulePath: envcheckModulePath,
          additionalArgs: envcheckAdditionalArgs || undefined
        }
      });

      const command = buildEnvcheckRunnerCommand(run.id);
      setEnvcheckRunnerCommand(command);
      await refreshRunSnapshots(token, selectedProjectId, {
        runFilters: {
          ...(runFilterType !== "all" ? { type: runFilterType } : {}),
          ...(runFilterStatus !== "all" ? { status: runFilterStatus } : {})
        },
        preserveSelected: true
      });
      setStatusMessage("Environment Checker run requested. Execute the runner command on the target host.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to request environment checker run.");
    } finally {
      setBusy(false);
    }
  };

  const requestPolicyEvaluation = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const evaluation = await policyApi.evaluate(token, selectedProjectId, {
        packId: selectedPolicyPackId
      });
      await loadPolicyData(token, selectedProjectId);
      setSelectedPolicyEvaluation(evaluation);
      setStatusMessage("Policy evaluation complete.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to evaluate policy pack.");
    } finally {
      setBusy(false);
    }
  };

  const loadRuns = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      await refreshRunSnapshots(token, selectedProjectId, {
        runFilters: {
          ...(runFilterType !== "all" ? { type: runFilterType } : {}),
          ...(runFilterStatus !== "all" ? { status: runFilterStatus } : {})
        },
        preserveSelected: true
      });
      setStatusMessage("Run data refreshed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to refresh runs.");
    } finally {
      setBusy(false);
    }
  };

  const selectRun = async (runId: string): Promise<void> => {
    if (!token) return;
    setSelectedRunId(runId);
    try {
      const detail = await runsApi.get(token, runId);
      setSelectedRunDetail(detail);
    } catch {
      setSelectedRunDetail(null);
    }
  };

  const runPkiValidation = async (): Promise<void> => {
    if (!token || !selectedProjectId || !pkiFile) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const result = await validationApi.runPkiUpload(
        token,
        selectedProjectId,
        pkiFile,
        new Date().toISOString(),
        pkiPassphrase || undefined
      );
      setPkiResult(JSON.stringify(result, null, 2));
      setStatusMessage("PKI validation complete.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "PKI validation failed.");
    } finally {
      setBusy(false);
    }
  };

  const generateExport = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const result = await exportApi.generate(token, selectedProjectId);
      setExportsResult(JSON.stringify(result, null, 2));
      setStatusMessage("Runbook and validation report generated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Export generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const requestSupportBundle = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const bundle = await supportBundlesApi.create(token, selectedProjectId);
      await loadSupportBundles(token, selectedProjectId);
      setSelectedBundleDetail(bundle);
      setStatusMessage("Support bundle queued. Worker will build it asynchronously.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Support bundle request failed.");
    } finally {
      setBusy(false);
    }
  };

  const viewSupportBundleDetails = async (bundleId: string): Promise<void> => {
    if (!token) return;
    try {
      const detail = await supportBundlesApi.get(token, bundleId);
      setSelectedBundleDetail(detail);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load support bundle details.");
    }
  };

  const downloadSupportBundle = async (bundleId: string): Promise<void> => {
    if (!token) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const { blob, filename } = await supportBundlesApi.download(token, bundleId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage("Support bundle downloaded.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Support bundle download failed.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!token || !selectedProjectId) {
      setAcquireLatestRun(null);
      setNetworkLatestRun(null);
      setEnvcheckLatestRun(null);
      setPolicyPacks([]);
      setPolicyEvaluations([]);
      setSelectedPolicyEvaluation(null);
      setSupportBundles([]);
      setSelectedBundleDetail(null);
      setRunsList([]);
      setSelectedRunId(null);
      setSelectedRunDetail(null);
      return;
    }

    const filters = {
      ...(runFilterType !== "all" ? { type: runFilterType } : {}),
      ...(runFilterStatus !== "all" ? { status: runFilterStatus } : {})
    };

    void refreshRunSnapshots(token, selectedProjectId, {
      runFilters: filters,
      preserveSelected: true
    }).catch(() => {
      setStatusMessage("Unable to load run snapshots.");
    });

    void loadSupportBundles(token, selectedProjectId).catch(() => {
      setStatusMessage("Unable to load support bundles.");
    });

    void loadPolicyData(token, selectedProjectId).catch(() => {
      setStatusMessage("Unable to load policy data.");
    });
  }, [token, selectedProjectId, runFilterType, runFilterStatus]);

  if (!token || !user) {
    return (
      <main className="aldo-main" style={{ maxWidth: 560, margin: "40px auto" }}>
        <section className="panel">
          <h2>ALDO Toolkit Access</h2>
          <p>Use local credentials. If this is a fresh install, bootstrap the first Admin account.</p>
          <Field label="Username">
            <Input value={loginUsername} onChange={(_, data) => setLoginUsername(data.value)} />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={loginPassword}
              onChange={(_, data) => setLoginPassword(data.value)}
            />
          </Field>
          <Checkbox
            checked={bootstrapMode}
            onChange={(_, data) => setBootstrapMode(Boolean(data.checked))}
            label="Bootstrap first Admin (only when no users exist)"
          />
          {bootstrapMode && (
            <Field label="Display Name">
              <Input value={bootstrapDisplayName} onChange={(_, data) => setBootstrapDisplayName(data.value)} />
            </Field>
          )}
          <div style={{ display: "flex", marginTop: 12, gap: 8 }}>
            <Button appearance="primary" onClick={() => void submitLogin()} disabled={busy}>
              {busy ? "Working..." : bootstrapMode ? "Bootstrap Admin" : "Login"}
            </Button>
          </div>
          {statusMessage && (
            <p style={{ marginTop: 10 }} className="monospace">
              {statusMessage}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="aldo-shell">
      <aside className="aldo-nav">
        <div className="aldo-brand">ALDO Toolkit</div>
        <div className="aldo-subtitle">Azure Local DisconnectedOps</div>
        <p style={{ marginTop: 0, marginBottom: 14 }}>
          Signed in as <strong>{user.displayName}</strong> ({user.role})
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {navItems.map((item) => (
            <Button
              key={item}
              appearance={activeNav === item ? "primary" : "secondary"}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <Button icon={<ArrowClockwise24Regular />} onClick={() => token && void loadProjects(token)}>
            Refresh Projects
          </Button>
          <Button onClick={clearSession}>Sign Out</Button>
        </div>
      </aside>

      <main className="aldo-main">
        {busy && <Spinner label="Running operation..." />}
        {statusMessage && (
          <section className="panel">
            <strong>Status</strong>
            <div className="monospace">{statusMessage}</div>
          </section>
        )}

        {activeNav === "Overview" && (
          <section className="panel">
            <h2>Projects</h2>
            {projects.length === 0 ? (
              <p>No projects yet. Go to Plan to create one.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left">Name</th>
                      <th align="left">Environment</th>
                      <th align="left">Nodes</th>
                      <th align="left">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr
                        key={project.id}
                        style={{
                          cursor: "pointer",
                          background: selectedProjectId === project.id ? "#ecfeff" : "transparent"
                        }}
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <td>{project.name}</td>
                        <td>{project.environmentType}</td>
                        <td>{project.nodeCountTarget}</td>
                        <td className={projectHealthClass(project.health)}>{project.health}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeNav === "Plan" && (
          <section className="panel">
            <h2>Project Wizard</h2>
            <div className="wizard-stepper">
              {wizardSteps.map((step, index) => (
                <button
                  className={`wizard-step ${wizardStep === index ? "active" : ""}`}
                  key={step}
                  onClick={() => setWizardStep(index)}
                  type="button"
                >
                  {index + 1}. {step}
                </button>
              ))}
            </div>

            {wizardStep === 0 && (
              <div className="grid-two">
                <Field
                  label="Project Name"
                  {...fieldValidationProps("name")}
                >
                  <Input value={wizard.name} onChange={(_, data) => setWizard((v) => ({ ...v, name: data.value }))} />
                </Field>
                <Field
                  label="Environment Type"
                  {...fieldValidationProps("environmentType")}
                >
                  <Select
                    value={wizard.environmentType}
                    onChange={(_, data) =>
                      setWizard((v) => ({
                        ...v,
                        environmentType: data.value as WizardProjectInput["environmentType"]
                      }))
                    }
                  >
                    <option value="air-gapped">air-gapped</option>
                    <option value="limited-connectivity">limited-connectivity</option>
                  </Select>
                </Field>
                <Field
                  label="Domain Name"
                  {...fieldValidationProps("domainName")}
                >
                  <Input
                    value={wizard.domainName}
                    onChange={(_, data) => setWizard((v) => ({ ...v, domainName: data.value }))}
                  />
                </Field>
                <Field
                  label="Description"
                  {...fieldValidationProps("description")}
                >
                  <Input
                    value={wizard.description ?? ""}
                    onChange={(_, data) => setWizard((v) => ({ ...v, description: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="grid-two">
                <Field
                  label="Node Count Target (3-16)"
                  {...fieldValidationProps("nodeCountTarget")}
                >
                  <Input
                    type="number"
                    value={String(wizard.nodeCountTarget)}
                    onChange={(_, data) =>
                      setWizard((v) => ({ ...v, nodeCountTarget: Number.parseInt(data.value || "0", 10) }))
                    }
                  />
                </Field>
                <Field
                  label="Deployment Model"
                  {...fieldValidationProps("deploymentModel")}
                >
                  <Input value={wizard.deploymentModel} readOnly />
                </Field>
                <Field
                  label="DNS Servers (comma-separated)"
                  {...fieldValidationProps("dnsServers")}
                >
                  <Input
                    value={wizard.dnsServers.join(",")}
                    onChange={(_, data) =>
                      setWizard((v) => ({
                        ...v,
                        dnsServers: data.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean)
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Identity Provider Host"
                  {...fieldValidationProps("identityProviderHost")}
                >
                  <Input
                    value={wizard.identityProviderHost}
                    onChange={(_, data) => setWizard((v) => ({ ...v, identityProviderHost: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="grid-two">
                <Field
                  label="Management IP Pool (CIDR or start-end)"
                  {...fieldValidationProps("managementIpPool")}
                >
                  <Input
                    value={wizard.managementIpPool}
                    onChange={(_, data) => setWizard((v) => ({ ...v, managementIpPool: data.value }))}
                  />
                </Field>
                <Field
                  label="Ingress IP"
                  {...fieldValidationProps("ingressIp")}
                >
                  <Input
                    value={wizard.ingressIp}
                    onChange={(_, data) => setWizard((v) => ({ ...v, ingressIp: data.value }))}
                  />
                </Field>
                <Field
                  label="Deployment Range (CIDR)"
                  {...fieldValidationProps("deploymentRange")}
                >
                  <Input
                    value={wizard.deploymentRange}
                    onChange={(_, data) => setWizard((v) => ({ ...v, deploymentRange: data.value }))}
                  />
                </Field>
                <Field
                  label="Container Network Range (CIDR)"
                  {...fieldValidationProps("containerNetworkRange")}
                >
                  <Input
                    value={wizard.containerNetworkRange}
                    onChange={(_, data) => setWizard((v) => ({ ...v, containerNetworkRange: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="grid-two">
                <Field
                  label="Ingress Endpoint Name"
                  {...fieldValidationProps("ingressEndpoints")}
                >
                  <Input
                    value={wizard.ingressEndpoints[0]?.name ?? ""}
                    onChange={(_, data) =>
                      setWizard((v) => ({
                        ...v,
                        ingressEndpoints: [{ name: data.value, fqdn: v.ingressEndpoints[0]?.fqdn ?? "" }]
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Ingress Endpoint FQDN"
                  {...fieldValidationProps("ingressEndpoints")}
                >
                  <Input
                    value={wizard.ingressEndpoints[0]?.fqdn ?? ""}
                    onChange={(_, data) =>
                      setWizard((v) => ({
                        ...v,
                        ingressEndpoints: [{ name: v.ingressEndpoints[0]?.name ?? "portal", fqdn: data.value }]
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Notes"
                  {...fieldValidationProps("notes")}
                >
                  <Textarea
                    value={wizard.notes ?? ""}
                    onChange={(_, data) => setWizard((v) => ({ ...v, notes: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardValidation.summary.length > 0 && (
              <ul className="validation-list">
                {wizardValidation.summary.map((issue, index) => (
                  <li key={`${issue}-${index}`} className="tag-red">
                    {issue}
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button appearance="primary" onClick={() => void createProject()} disabled={busy}>
                Create Project
              </Button>
              <Button
                onClick={() => setWizardStep((current) => Math.max(0, current - 1))}
                disabled={wizardStep === 0}
              >
                Previous
              </Button>
              <Button
                onClick={() => setWizardStep((current) => Math.min(wizardSteps.length - 1, current + 1))}
                disabled={wizardStep >= wizardSteps.length - 1}
              >
                Next
              </Button>
              <Button
                icon={<Copy24Regular />}
                onClick={() =>
                  void copyRunnerCommand(
                    `aldo-runner netcheck --server ${apiBaseUrl} --project ${selectedProjectId ?? "<project-id>"} --token <jwt>`
                  )
                }
              >
                Copy NetCheck Command
              </Button>
              <Button icon={<ArrowDownload24Regular />} onClick={downloadWizardJson}>
                Download Wizard JSON
              </Button>
            </div>
          </section>
        )}

        {activeNav === "Acquire" && (
          <section className="panel">
            <h2>Acquisition Assistant</h2>
            <p>
              Toolkit enforces prerequisites: active Azure subscription, approval, and RBAC are required;
              bypass is not supported.
            </p>
            <div className="grid-two">
              <Field label="Artifact Root Folder">
                <Input value={artifactRoot} onChange={(_, data) => setArtifactRoot(data.value)} />
              </Field>
              <Field label="Version Notes">
                <Input value={acqVersionNotes} onChange={(_, data) => setAcqVersionNotes(data.value)} />
              </Field>
              <Field label="Artifact Relative Path">
                <Input value={artifactPath} onChange={(_, data) => setArtifactPath(data.value)} />
              </Field>
              <Field label="Expected SHA256">
                <Input value={artifactHash} onChange={(_, data) => setArtifactHash(data.value)} />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <Checkbox
                checked={acqHasSubscription}
                onChange={(_, data) => setAcqHasSubscription(Boolean(data.checked))}
                label="Active Azure subscription"
              />
              <Checkbox
                checked={acqApproval}
                onChange={(_, data) => setAcqApproval(Boolean(data.checked))}
                label="Approval granted"
              />
              <Checkbox
                checked={acqRbac}
                onChange={(_, data) => setAcqRbac(Boolean(data.checked))}
                label="RBAC confirmed"
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <Button appearance="primary" icon={<Play24Regular />} onClick={() => void requestAcquireScan()}>
                Request Acquire Scan
              </Button>
            </div>
            {acquireRunnerCommand && (
              <div style={{ marginTop: 12 }}>
                <Field label="Runner Command">
                  <Textarea readOnly rows={3} value={acquireRunnerCommand} />
                </Field>
                <Button icon={<Copy24Regular />} onClick={() => void copyRunnerCommand(acquireRunnerCommand)}>
                  Copy Command
                </Button>
              </div>
            )}
            {acquireLatestRun && (
              <div style={{ marginTop: 12 }}>
                <p>
                  Latest acquire scan: {new Date(acquireLatestRun.startedAt).toLocaleString()} (
                  {acquireLatestRun.status})
                </p>
                <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(acquireLatestRun.resultJson, null, 2)}
                </pre>
              </div>
            )}
          </section>
        )}

        {activeNav === "PKI" && (
          <section className="panel">
            <h2>PKI Validator</h2>
            <p>
              Validates 24 external certificates, trust chain consistency, SAN presence, expiry &gt;= 2 years, and
              CRL/CDP/OCSP endpoint reachability where possible.
            </p>
            <div className="grid-two">
              <Field label="Certificate Bundle (.pfx/.cer/.pem)">
                <input
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPkiFile(file);
                  }}
                />
              </Field>
              <Field label="PFX Passphrase (optional)">
                <Input
                  type="password"
                  value={pkiPassphrase}
                  onChange={(_, data) => setPkiPassphrase(data.value)}
                />
              </Field>
            </div>
            <Button
              appearance="primary"
              onClick={() => void runPkiValidation()}
              disabled={!pkiFile || !selectedProjectId}
            >
              Run PKI Validation
            </Button>
            {pkiResult && (
              <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {pkiResult}
              </pre>
            )}
          </section>
        )}

        {activeNav === "Checks" && (
          <section className="panel">
            <h2>Checks</h2>
            <h3>Network Checks</h3>
            <p>Runner performs DNS and TCP 443 checks from the execution host network.</p>
            <Field label="Override Endpoints (one per line, optional)">
              <Textarea
                value={networkEndpoints}
                onChange={(_, data) => setNetworkEndpoints(data.value)}
                rows={5}
              />
            </Field>
            <Button appearance="primary" onClick={() => void requestNetworkCheck()}>
              Run Network Checks
            </Button>
            {networkRunnerCommand && (
              <div style={{ marginTop: 12 }}>
                <Field label="Runner Command">
                  <Textarea readOnly rows={3} value={networkRunnerCommand} />
                </Field>
                <Button icon={<Copy24Regular />} onClick={() => void copyRunnerCommand(networkRunnerCommand)}>
                  Copy Command
                </Button>
              </div>
            )}
            {networkLatestRun && (
              <div style={{ marginTop: 12 }}>
                <p>
                  Latest network check: {new Date(networkLatestRun.startedAt).toLocaleString()} (
                  {networkLatestRun.status})
                </p>
                <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(networkLatestRun.resultJson, null, 2)}
                </pre>
              </div>
            )}

            <hr style={{ margin: "18px 0" }} />

            <h3>Environment Checker</h3>
            <p>Runs Microsoft Environment Checker from the execution host using an offline-staged module path.</p>
            <div className="grid-two">
              <Field label="Module Path (offline staged)">
                <Input
                  value={envcheckModulePath}
                  onChange={(_, data) => setEnvcheckModulePath(data.value)}
                />
              </Field>
              <Field label="Additional Args (optional)">
                <Input
                  value={envcheckAdditionalArgs}
                  onChange={(_, data) => setEnvcheckAdditionalArgs(data.value)}
                />
              </Field>
            </div>
            <Button appearance="primary" onClick={() => void requestEnvcheckRun()}>
              Run Environment Checker
            </Button>
            {envcheckRunnerCommand && (
              <div style={{ marginTop: 12 }}>
                <Field label="Runner Command">
                  <Textarea readOnly rows={3} value={envcheckRunnerCommand} />
                </Field>
                <Button icon={<Copy24Regular />} onClick={() => void copyRunnerCommand(envcheckRunnerCommand)}>
                  Copy Command
                </Button>
              </div>
            )}
            {envcheckLatestRun && (
              <div style={{ marginTop: 12 }}>
                {(() => {
                  const summary = envcheckSummaryFromRun(envcheckLatestRun);
                  return (
                    <>
                      <p>
                        Latest envcheck: {new Date(envcheckLatestRun.startedAt).toLocaleString()} (
                        {envcheckLatestRun.status})
                      </p>
                      <p className={summary.overall === "Green" ? "tag-green" : summary.overall === "Red" ? "tag-red" : "tag-amber"}>
                        Summary: {summary.overall}
                      </p>
                      {summary.topFailures.length > 0 && (
                        <ul className="validation-list">
                          {summary.topFailures.slice(0, 5).map((failure, index) => (
                            <li key={`${failure}-${index}`} className="tag-red">
                              {failure}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </section>
        )}

        {activeNav === "Policy" && (
          <section className="panel">
            <h2>Policy Gate</h2>
            <p>
              Evaluate project readiness against versioned policy packs. Results are stored as auditable
              policy-evaluation records.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
              <Field label="Policy Pack">
                <Select
                  value={selectedPolicyPackId}
                  onChange={(_, data) => setSelectedPolicyPackId(data.value)}
                >
                  {policyPacks.map((policyPack) => (
                    <option key={policyPack.id} value={policyPack.id}>
                      {policyPack.name} ({policyPack.version})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button appearance="primary" icon={<Play24Regular />} onClick={() => void requestPolicyEvaluation()}>
                Evaluate Policy
              </Button>
              <Button
                icon={<ArrowClockwise24Regular />}
                onClick={() => token && selectedProjectId && void loadPolicyData(token, selectedProjectId)}
              >
                Refresh Policy Data
              </Button>
            </div>

            {policyPacks.length === 0 ? (
              <p style={{ marginTop: 12 }}>No policy packs available.</p>
            ) : (
              (() => {
                const selectedPolicyPack =
                  policyPacks.find((policyPack) => policyPack.id === selectedPolicyPackId) ?? policyPacks[0]!;
                return (
                  <div style={{ marginTop: 12 }}>
                    <h3>{selectedPolicyPack.name}</h3>
                    <p>{selectedPolicyPack.description}</p>
                    <p>
                      Rules: {selectedPolicyPack.rules.length} | Version: {selectedPolicyPack.version}
                    </p>
                  </div>
                );
              })()
            )}

            <h3 style={{ marginTop: 14 }}>Evaluations</h3>
            {policyEvaluations.length === 0 ? (
              <p>No policy evaluations yet for this project.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left">Created</th>
                      <th align="left">Pack</th>
                      <th align="left">Status</th>
                      <th align="left">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policyEvaluations.map((evaluation) => (
                      <tr
                        key={evaluation.id}
                        style={{
                          cursor: "pointer",
                          background:
                            selectedPolicyEvaluation?.id === evaluation.id ? "#ecfeff" : "transparent"
                        }}
                        onClick={() => setSelectedPolicyEvaluation(evaluation)}
                      >
                        <td>{new Date(evaluation.createdAt).toLocaleString()}</td>
                        <td>
                          {evaluation.packId} ({evaluation.packVersion})
                        </td>
                        <td className={policyStatusClass(evaluation.overallStatus)}>
                          {evaluation.overallStatus}
                        </td>
                        <td>
                          {evaluation.evaluation.summary.passCount} pass /{" "}
                          {evaluation.evaluation.summary.warnCount} warn /{" "}
                          {evaluation.evaluation.summary.failCount} fail
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedPolicyEvaluation && (
              <div style={{ marginTop: 14 }}>
                <h3>Evaluation Detail</h3>
                <p>
                  ID: <span className="monospace">{selectedPolicyEvaluation.id}</span>
                </p>
                <p>
                  Evaluated At:{" "}
                  {new Date(selectedPolicyEvaluation.evaluation.evaluatedAt).toLocaleString()} | Status:{" "}
                  <span className={policyStatusClass(selectedPolicyEvaluation.overallStatus)}>
                    {selectedPolicyEvaluation.overallStatus}
                  </span>
                </p>
                <ul className="validation-list">
                  {selectedPolicyEvaluation.evaluation.checks.map((check) => (
                    <li
                      key={`${selectedPolicyEvaluation.id}-${check.key}`}
                      className={
                        check.status === "pass"
                          ? "tag-green"
                          : check.status === "fail"
                            ? "tag-red"
                            : "tag-amber"
                      }
                    >
                      {check.key}: {check.status} - {check.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {activeNav === "Exports" && (
          <section className="panel">
            <h2>Exports</h2>
            <p>Generate `Runbook.md`, `validation-report.json`, and Support Bundle v1 zip packages.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button appearance="primary" icon={<ArrowDownload24Regular />} onClick={() => void generateExport()}>
                Generate Export
              </Button>
              <Button appearance="secondary" icon={<Play24Regular />} onClick={() => void requestSupportBundle()}>
                Generate Support Bundle
              </Button>
              <Button icon={<ArrowClockwise24Regular />} onClick={() => token && selectedProjectId && void loadSupportBundles(token, selectedProjectId)}>
                Refresh Bundles
              </Button>
            </div>
            {exportsResult && (
              <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {exportsResult}
              </pre>
            )}

            <h3 style={{ marginTop: 14 }}>Support Bundles</h3>
            {supportBundles.length === 0 ? (
              <p>No support bundles yet for this project.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left">Created</th>
                      <th align="left">Status</th>
                      <th align="left">SHA256</th>
                      <th align="left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supportBundles.map((bundle) => (
                      <tr key={bundle.id}>
                        <td>{new Date(bundle.createdAt).toLocaleString()}</td>
                        <td className={supportBundleStatusClass(bundle.status)}>{bundle.status}</td>
                        <td className="monospace">
                          {bundle.sha256 ? `${bundle.sha256.slice(0, 12)}...` : "-"}
                        </td>
                        <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button onClick={() => void viewSupportBundleDetails(bundle.id)}>View Details</Button>
                          <Button
                            appearance="primary"
                            disabled={bundle.status !== "ready"}
                            onClick={() => void downloadSupportBundle(bundle.id)}
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedBundleDetail && (
              <div style={{ marginTop: 12 }}>
                <h4>Bundle Detail</h4>
                <p>
                  Bundle ID: <span className="monospace">{selectedBundleDetail.id}</span>
                </p>
                <p>
                  Status:{" "}
                  <span className={supportBundleStatusClass(selectedBundleDetail.status)}>
                    {selectedBundleDetail.status}
                  </span>
                </p>
                <p>
                  File Size: {selectedBundleDetail.fileSize ? `${selectedBundleDetail.fileSize} bytes` : "n/a"} |
                  SHA256:{" "}
                  <span className="monospace">{selectedBundleDetail.sha256 ?? "n/a"}</span>
                </p>
                {selectedBundleDetail.error && (
                  <p className="tag-red">Error: {selectedBundleDetail.error}</p>
                )}
                {selectedBundleDetail.manifestJson && (
                  <p>
                    Manifest files: {selectedBundleDetail.manifestJson.files.length} (
                    {selectedBundleDetail.manifestJson.generatedAtUtc})
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {activeNav === "Runs" && (
          <section className="panel">
            <h2>Runs</h2>
            <p>Auditable run history with transcript and structured evidence.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Field label="Type Filter">
                <Select
                  value={runFilterType}
                  onChange={(_, data) => setRunFilterType(data.value as "all" | RunType)}
                >
                  <option value="all">all</option>
                  <option value="acquire_scan">acquire_scan</option>
                  <option value="netcheck">netcheck</option>
                  <option value="pki_validate">pki_validate</option>
                  <option value="envcheck">envcheck</option>
                </Select>
              </Field>
              <Field label="Status Filter">
                <Select
                  value={runFilterStatus}
                  onChange={(_, data) => setRunFilterStatus(data.value as "all" | RunStatus)}
                >
                  <option value="all">all</option>
                  <option value="requested">requested</option>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                  <option value="failed">failed</option>
                </Select>
              </Field>
              <Button appearance="primary" icon={<ArrowClockwise24Regular />} onClick={() => void loadRuns()}>
                Refresh Run Data
              </Button>
            </div>

            {runsList.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left">Started</th>
                      <th align="left">Type</th>
                      <th align="left">Status</th>
                      <th align="left">Executed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runsList.map((run) => (
                      <tr
                        key={run.id}
                        style={{
                          cursor: "pointer",
                          background: selectedRunId === run.id ? "#ecfeff" : "transparent"
                        }}
                        onClick={() => void selectRun(run.id)}
                      >
                        <td>{new Date(run.startedAt).toLocaleString()}</td>
                        <td>{run.type}</td>
                        <td>{run.status}</td>
                        <td>{run.executedBy?.hostname ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No runs yet for this project/filter.</p>
            )}

            {selectedRunDetail && (
              <div style={{ marginTop: 14 }}>
                <h3>Run Detail</h3>
                <p>
                  Run ID: <span className="monospace">{selectedRunDetail.id}</span>
                </p>
                <p>
                  Started: {new Date(selectedRunDetail.startedAt).toLocaleString()} | Finished:{" "}
                  {selectedRunDetail.finishedAt
                    ? new Date(selectedRunDetail.finishedAt).toLocaleString()
                    : "n/a"}
                </p>
                <p>
                  Executed By:{" "}
                  {selectedRunDetail.executedBy
                    ? `${selectedRunDetail.executedBy.username} @ ${selectedRunDetail.executedBy.hostname} (${selectedRunDetail.executedBy.runnerVersion})`
                    : "n/a"}
                </p>
                {selectedRunDetail.type === "envcheck" && (
                  <p className={envcheckSummaryFromRun(selectedRunDetail).overall === "Green" ? "tag-green" : envcheckSummaryFromRun(selectedRunDetail).overall === "Red" ? "tag-red" : "tag-amber"}>
                    Envcheck Summary: {envcheckSummaryFromRun(selectedRunDetail).overall}
                  </p>
                )}
                <Field label="Transcript">
                  <Textarea
                    readOnly
                    rows={8}
                    value={selectedRunDetail.transcriptText ?? JSON.stringify(selectedRunDetail.transcriptLines, null, 2)}
                  />
                </Field>
                <Field label="Structured Result">
                  <Textarea readOnly rows={10} value={JSON.stringify(selectedRunDetail.resultJson, null, 2)} />
                </Field>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
