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
- Acquisition checklist + artifact SHA256 verification.
- Network checks (DNS + TCP 443 reachability from execution host).
- PKI validation for disconnected operations requirements.
- Export generation (`Runbook.md`, `validation-report.json`).
- PowerShell runner skeleton for evidence collection and transcript upload.

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

## Runner Example
```powershell
.\runner\powershell\aldo-runner\aldo-runner.ps1 run --server http://localhost:4000 --project <project-id> --token <jwt> --endpoint portal.corp.example.com --ingress-ip 10.20.0.20
```

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
