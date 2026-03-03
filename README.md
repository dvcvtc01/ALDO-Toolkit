# ALDO Toolkit

Azure Local DisconnectedOps Toolkit for repeatable planning, acquisition validation, and audit-friendly day-2 operations evidence in disconnected/air-gapped environments.

## What This Is
- Open-source, self-hosted assistant for planning and validation workflows.
- Evidence and runbook generator with deterministic support bundles.
- Wrapper around documented flows to reduce human error.

## What This Is Not
- Not a replacement for Microsoft control plane.
- Does not bypass Azure subscription, approval, or RBAC requirements.

## MVP Features
- Local auth (`argon2id`) + RBAC (`Admin`, `Operator`, `Viewer`).
- Project Wizard with network/capacity constraints.
- Runner-first acquisition scan (`acquire_scan`) with artifact metadata + SHA256 evidence.
- Runner-first network checks (`netcheck`) with DNS + TCP 443 reachability from execution host.
- Runner-first Environment Checker execution (`envcheck`) with offline `modulePath` support.
- PKI validation for disconnected operations requirements.
- Export generation (`Runbook.md`, `validation-report.json`).
- Runs audit trail with status, executed-by host/user/version, transcript, structured result JSON, and artifacts.

## Repository Layout
```
/apps
  /web
  /api
  /worker
/packages
  /shared
/runner
  /powershell
/docs
/docker
```

## 10-Minute Quickstart (Local Docker)
1. Prerequisites:
   - Docker Desktop running.
   - Ports `3000`, `4000`, `5432`, and `6379` free.
2. From repo root, create `.env`:
   - PowerShell: `Copy-Item .env.example .env`
3. Start services:
   - `docker compose -f docker/docker-compose.dev.yml up -d --build`
4. Confirm services and endpoints:
   - `docker compose -f docker/docker-compose.dev.yml ps`
   - Web: `http://localhost:3000`
   - API health: `http://localhost:4000/api/v1/health`
   - API docs: `http://localhost:4000/docs`
5. Bootstrap first Admin in UI:
   - Open `http://localhost:3000`.
   - Enter username/password.
   - Tick `Bootstrap first Admin (only when no users exist)`.
   - Select `Bootstrap Admin`.

## First Demo Workflow (Runner-First)
1. Create demo artifact file on the runner host:
```powershell
New-Item -ItemType Directory -Path C:\aldo-demo\artifacts\payload -Force | Out-Null
'ALDO-DEMO' | Set-Content -Path C:\aldo-demo\artifacts\payload\update.zip
$hash = (Get-FileHash C:\aldo-demo\artifacts\payload\update.zip -Algorithm SHA256).Hash
$hash
```
2. In **Plan**, create a project (minimum valid example):
   - Name: `demo-runner-first`
   - Environment: `air-gapped`
   - Node count: `3`
   - Deployment model: `physical`
   - Domain: `corp.example.com`
   - Identity provider: `adfs.corp.example.com`
   - Management pool: `10.20.0.10-10.20.0.50`
   - Ingress IP: `10.20.0.20`
   - Deployment range: `10.30.0.0/24`
   - Container range: `10.40.0.0/24`
   - Ingress endpoint FQDN: `portal.corp.example.com`
3. In **Acquire**:
   - Root: `C:\aldo-demo\artifacts`
   - Relative path: `payload\update.zip`
   - Expected SHA256: paste `$hash`
   - Tick all three prerequisite checkboxes (subscription, approval, RBAC).
   - Select `Request Acquire Scan`.
   - Copy generated runner command and execute it in PowerShell on the same host.
4. In **Checks**:
   - Select `Run Network Checks`.
   - Copy generated runner command and execute it on the target execution host.
5. In **Checks** -> **Environment Checker**:
   - Set module path to your staged offline Environment Checker module.
   - Select `Run Environment Checker`.
   - Copy generated runner command and execute it on the target execution host.
6. In **Runs**:
   - Verify runs exist for `acquire_scan`, `netcheck`, and `envcheck`.
   - Open each run and confirm transcript + structured results are present.
7. In **Exports**:
   - Select `Generate Export`.
   - Confirm `Runbook.md` and `validation-report.json` are generated with latest envcheck summary.

## Runner CLI Examples
```powershell
.\runner\powershell\aldo-runner\aldo-runner.ps1 acquire scan --server http://localhost:4000 --project <project-id> --token <jwt> --root C:\artifacts --expectedPath payload\update.zip --expectedSha256 <sha256>
.\runner\powershell\aldo-runner\aldo-runner.ps1 netcheck --server http://localhost:4000 --project <project-id> --token <jwt>
.\runner\powershell\aldo-runner\aldo-runner.ps1 envcheck --server http://localhost:4000 --project <project-id> --token <jwt> --modulePath C:\staged\EnvironmentChecker --additionalArgs "<args>"
```

Notes:
- No Windows path needs to be mounted into Docker for acquisition validation.
- Network check results reflect the runner host network, not the API container network.
- Runner can create runs itself, but the recommended flow is requesting runs from UI and executing the generated command.

## OpenAPI Type Generation
```bash
npm run generate:openapi
```

## Docs
- [Architecture](docs/architecture.md)
- [Threat Model](docs/threat-model.md)
- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/dev-guide.md)
- [References](docs/references.md)

## License
Apache-2.0 (see `LICENSE`).
