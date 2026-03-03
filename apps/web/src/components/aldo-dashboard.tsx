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
  type ProjectPayload,
  type ProjectRecord,
  projectsApi,
  runsApi,
  validationApi
} from "../lib/api-client";
import { defaultWizardInput, type WizardProjectInput, validateWizardInline } from "../lib/wizard";

type NavItem = "Overview" | "Plan" | "Acquire" | "PKI" | "Checks" | "Exports" | "Runs";

const navItems: NavItem[] = ["Overview", "Plan", "Acquire", "PKI", "Checks", "Exports", "Runs"];
const wizardSteps = ["Basics", "Capacity", "Network", "Identity"];

const tokenStorageKey = "aldo-token";

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

  const [networkEndpoints, setNetworkEndpoints] = useState("");
  const [networkResult, setNetworkResult] = useState<string>("");

  const [pkiFile, setPkiFile] = useState<File | null>(null);
  const [pkiPassphrase, setPkiPassphrase] = useState("");
  const [pkiResult, setPkiResult] = useState<string>("");

  const [exportsResult, setExportsResult] = useState<string>("");
  const [runsResult, setRunsResult] = useState<string>("");
  const [validationsResult, setValidationsResult] = useState<string>("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const wizardIssues = useMemo(() => validateWizardInline(wizard), [wizard]);

  const projectHealthClass = (health: ProjectRecord["health"]): string => {
    if (health === "Green") return "tag-green";
    if (health === "Amber") return "tag-amber";
    return "tag-red";
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
  };

  const loadProjects = async (authToken: string): Promise<void> => {
    const projectList = await projectsApi.list(authToken);
    setProjects(projectList);
    setSelectedProjectId((current) => current ?? projectList[0]?.id ?? null);
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
    if (wizardIssues.length > 0) {
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

  const copyRunnerCommand = async (): Promise<void> => {
    const command = `aldo-runner run --server ${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"} --project ${selectedProjectId ?? "<project-id>"}`;
    await navigator.clipboard.writeText(command);
    setStatusMessage("Runner command copied.");
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

  const runAcquisitionValidation = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const result = await validationApi.runAcquisition(token, selectedProjectId, {
        azureSubscriptionActive: acqHasSubscription,
        approvalGranted: acqApproval,
        hasRequiredRbac: acqRbac,
        understandsNoBypass: true,
        versionNotes: acqVersionNotes,
        providedArtifactRoot: artifactRoot,
        expectedArtifacts: [
          {
            relativePath: artifactPath,
            sha256: artifactHash
          }
        ]
      });
      setValidationsResult(JSON.stringify(result, null, 2));
      setStatusMessage("Acquisition validation complete.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Acquisition validation failed.");
    } finally {
      setBusy(false);
    }
  };

  const runNetworkValidation = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const endpoints = networkEndpoints
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const result = await validationApi.runNetwork(token, selectedProjectId, {
        endpoints: endpoints.length > 0 ? endpoints : undefined
      });
      setNetworkResult(JSON.stringify(result, null, 2));
      setStatusMessage("Network checks complete.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Network checks failed.");
    } finally {
      setBusy(false);
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

  const refreshRuns = async (): Promise<void> => {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const [runs, validations] = await Promise.all([
        runsApi.list(token, selectedProjectId),
        validationApi.list(token, selectedProjectId)
      ]);
      setRunsResult(JSON.stringify(runs, null, 2));
      setValidationsResult(JSON.stringify(validations, null, 2));
      setStatusMessage("Runs and validations refreshed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to refresh run data.");
    } finally {
      setBusy(false);
    }
  };

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
                <Field label="Project Name">
                  <Input value={wizard.name} onChange={(_, data) => setWizard((v) => ({ ...v, name: data.value }))} />
                </Field>
                <Field label="Environment Type">
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
                <Field label="Domain Name">
                  <Input
                    value={wizard.domainName}
                    onChange={(_, data) => setWizard((v) => ({ ...v, domainName: data.value }))}
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={wizard.description ?? ""}
                    onChange={(_, data) => setWizard((v) => ({ ...v, description: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="grid-two">
                <Field label="Node Count Target (3-16)">
                  <Input
                    type="number"
                    value={String(wizard.nodeCountTarget)}
                    onChange={(_, data) =>
                      setWizard((v) => ({ ...v, nodeCountTarget: Number.parseInt(data.value || "0", 10) }))
                    }
                  />
                </Field>
                <Field label="Deployment Model">
                  <Input value={wizard.deploymentModel} readOnly />
                </Field>
                <Field label="DNS Servers (comma-separated)">
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
                <Field label="Identity Provider Host">
                  <Input
                    value={wizard.identityProviderHost}
                    onChange={(_, data) => setWizard((v) => ({ ...v, identityProviderHost: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="grid-two">
                <Field label="Management IP Pool (CIDR or start-end)">
                  <Input
                    value={wizard.managementIpPool}
                    onChange={(_, data) => setWizard((v) => ({ ...v, managementIpPool: data.value }))}
                  />
                </Field>
                <Field label="Ingress IP">
                  <Input
                    value={wizard.ingressIp}
                    onChange={(_, data) => setWizard((v) => ({ ...v, ingressIp: data.value }))}
                  />
                </Field>
                <Field label="Deployment Range (CIDR)">
                  <Input
                    value={wizard.deploymentRange}
                    onChange={(_, data) => setWizard((v) => ({ ...v, deploymentRange: data.value }))}
                  />
                </Field>
                <Field label="Container Network Range (CIDR)">
                  <Input
                    value={wizard.containerNetworkRange}
                    onChange={(_, data) => setWizard((v) => ({ ...v, containerNetworkRange: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="grid-two">
                <Field label="Ingress Endpoint Name">
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
                <Field label="Ingress Endpoint FQDN">
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
                <Field label="Notes">
                  <Textarea
                    value={wizard.notes ?? ""}
                    onChange={(_, data) => setWizard((v) => ({ ...v, notes: data.value }))}
                  />
                </Field>
              </div>
            )}

            {wizardIssues.length > 0 && (
              <ul className="validation-list">
                {wizardIssues.map((issue, index) => (
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
              <Button icon={<Copy24Regular />} onClick={() => void copyRunnerCommand()}>
                Copy Runner Command
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
              <Button appearance="primary" icon={<Play24Regular />} onClick={() => void runAcquisitionValidation()}>
                Validate Acquisition Checklist
              </Button>
            </div>
            {validationsResult && (
              <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {validationsResult}
              </pre>
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
            <h2>Network Checks</h2>
            <p>Runs DNS endpoint checks and ingress TCP 443 reachability from the execution host.</p>
            <Field label="Override Endpoints (one per line, optional)">
              <Textarea
                value={networkEndpoints}
                onChange={(_, data) => setNetworkEndpoints(data.value)}
                rows={5}
              />
            </Field>
            <Button appearance="primary" onClick={() => void runNetworkValidation()}>
              Run Network Checks
            </Button>
            {networkResult && (
              <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {networkResult}
              </pre>
            )}
          </section>
        )}

        {activeNav === "Exports" && (
          <section className="panel">
            <h2>Exports</h2>
            <p>Generate `Runbook.md` and `validation-report.json` per project.</p>
            <Button appearance="primary" icon={<ArrowDownload24Regular />} onClick={() => void generateExport()}>
              Generate Export
            </Button>
            {exportsResult && (
              <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {exportsResult}
              </pre>
            )}
          </section>
        )}

        {activeNav === "Runs" && (
          <section className="panel">
            <h2>Runs</h2>
            <p>Structured run logs and deterministic support bundle manifests.</p>
            <Button appearance="primary" icon={<ArrowClockwise24Regular />} onClick={() => void refreshRuns()}>
              Refresh Run Data
            </Button>
            {runsResult && (
              <pre className="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {runsResult}
              </pre>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
