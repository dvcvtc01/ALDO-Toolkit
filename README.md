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

## Quickstart (Docker Compose Dev)
1. Copy environment file:
   - PowerShell: `Copy-Item .env.example .env`
2. Start stack:
   - `docker compose -f docker/docker-compose.dev.yml up --build`
3. Open applications:
   - Web: `http://localhost:3000`
   - API: `http://localhost:4000`
   - OpenAPI docs: `http://localhost:4000/docs`

## Runner Examples
```powershell
.\runner\powershell\aldo-runner\aldo-runner.ps1 acquire scan --server http://localhost:4000 --project <project-id> --token <jwt> --root C:\artifacts --expectedPath payload\update.zip --expectedSha256 <sha256>
.\runner\powershell\aldo-runner\aldo-runner.ps1 netcheck --server http://localhost:4000 --project <project-id> --token <jwt>
```

## v0.2.0 Smoke Test (Runner-First)
1. Start stack:
   - `docker compose -f docker/docker-compose.dev.yml up --build`
2. Open Web UI (`http://localhost:3000`) and bootstrap/login as Admin.
3. Create a project in **Plan**.
4. In **Acquire**, set artifact inputs and select **Request Acquire Scan**.
5. Copy the generated command and run it on the host that can read the artifact folder.
6. In **Checks**, select **Run Network Checks**, then run the generated runner command from the target host.
7. Open **Runs** and verify:
   - run entries exist for `acquire_scan` and `netcheck`
   - status transitions to `completed`/`failed`
   - transcript and structured results are visible in run detail
8. Generate export in **Exports** and verify `Runbook.md` and `validation-report.json` are produced.

Notes:
- No Windows path needs to be mounted into Docker for acquisition validation.
- Network check results reflect the runner execution host network, not the API container network.

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
