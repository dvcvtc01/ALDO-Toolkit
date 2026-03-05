# ALDO Toolkit Architecture

## Goal
ALDO Toolkit is an open-source, self-hosted planner/validator/evidence system for Azure Local disconnected operations. It does not replace Microsoft control-plane actions. It reduces operator error by wrapping documented flows and preserving deterministic evidence.

## System Components
- `apps/web` (Next.js + Fluent UI): wizard-led interface for planning, requesting runner-based acquisition/network/envcheck runs, PKI validation submission, policy gate evaluations, exports, and run evidence views.
- `apps/api` (Fastify + OpenAPI): auth, RBAC, project CRUD, validators, policy evaluation, exports, run request lifecycle, and run evidence ingestion endpoints.
- `apps/worker` (BullMQ): async processing skeleton for follow-on evidence and OperationsModule workflows.
- `packages/shared` (zod + validators): shared data contracts and core validation logic.
- `runner/powershell/aldo-runner`: workstation/staging-host execution runner for acquisition folder scanning, DNS/TCP checks, Environment Checker execution, and transcript posting.
- Postgres: source of truth for users, projects, validation records, exports, and runs.
- Redis: queue broker for worker jobs.
- Local object storage volume: stores generated artifacts and evidence files.

## Non-Negotiable Controls Enforced
1. Acquisition requires active Azure subscription, explicit approval, and RBAC. Toolkit enforces acknowledgement and does not claim bypass capability.
2. Deployment model is physical-only with node count 3-16.
3. PKI validation checks for 24 external certificates, shared trust chain, no self-signed certificates, SAN presence, and minimum 2-year expiry from deploy date. CRL/CDP/OCSP endpoint reachability is tested where possible.
4. Network validation checks ingress/IP constraints, DNS resolvability, identity host resolution, and TCP 443 reachability.
5. Identity model supports role-based access in-tool and references AD groups + AD FS operational model externally.
6. Update flow is represented in runbook/checklists (stage zip, import OperationsModule, upload package, wait for staging, export BitLocker keys).
7. Log evidence supports direct/indirect/fallback modes with deterministic support-bundle manifest hashing.
8. Environment checker is executed by runner (`envcheck`) with offline module path support and auditable result ingestion.

## API and Data Model
- `users`: local auth records (`argon2id` password hash), role (`Admin|Operator|Viewer`).
- `projects`: persisted wizard config, computed health status, owner.
- `validation_records`: immutable validation inputs/results with timestamps.
- `acquisition_records`: legacy acquisition checklist payload history from initial MVP path.
- `exports`: generated `Runbook.md` and `validation-report.json`.
- `runs`: requested and executed runs (`acquire_scan`, `netcheck`, `pki_validate`, `envcheck`) with status, transcript, structured result JSON, execution host metadata, and artifact metadata.
- `policy_evaluations`: auditable readiness-gate results by project and policy-pack version.
- `support_bundles`: async bundle build records with queue/build status, output file metadata, deterministic manifest snapshot, and error state.

## Auditability
- Every major action stores input, output, timestamp, and actor ID.
- Generated files are persisted to deterministic project paths under data volume.
- Runner transcripts are preserved as text + structured line entries, with run result JSON and artifact metadata persisted per run.
- Support bundles are generated asynchronously by worker jobs and stored on a shared local filesystem volume between API and worker.
- Policy evaluations are persisted with pack/version snapshot for deterministic audit replay.

## Offline-First Behavior
- Toolkit operates without internet post-install.
- CRL/CDP/OCSP checks are best-effort and clearly surfaced as warnings when unreachable.
- External downloads are user-managed and explicitly verified by checksum/manifest.

## Assumptions
- Initial MVP uses local JWT auth and local users only; optional external OIDC is deferred.
- Management IP pool is user-provided as CIDR, single IP, or start-end range string.
- PKI upload accepts `.pfx/.p12/.cer/.crt/.der/.pem`; encrypted private-key handling beyond certificate extraction is out of MVP scope.
- API and web are deployed behind trusted internal networking and TLS termination is handled at the environment edge.
- Runner authenticates with a user-provided API bearer token.
- UI run requests generate run IDs; runner commands can target an existing run ID (`--run`) or create a run request when omitted.
- Acquisition and network host-dependent checks are executed from runner hosts, not from API container filesystem/network context.
- Environment Checker module binaries are staged offline by operators; runner discovers/invokes checker commands from the provided module path.
- Object storage backend is local filesystem volume for MVP; MinIO integration is future work.
- For support bundle inclusion, only the latest completed run per type (`acquire_scan`, `netcheck`, `pki_validate`, `envcheck`) is packaged when present.
- Policy packs are currently static and versioned in source; external policy-pack registry/import is planned for later milestones.
