# ALDO Toolkit Roadmap (v0.5.0 -> v1.0.0)

## v0.5.0 - Policy Packs + Readiness Gates
- Deliverables:
  - Versioned policy packs (`baseline-disconnectedops-v1`).
  - Policy evaluation API/UI flow per project.
  - Auditable policy evaluation records in Postgres.
  - Exports include latest policy evaluation summary.
- Acceptance criteria:
  - Admin/Operator can run policy evaluation.
  - Viewer can review latest/history.
  - Evaluation output is deterministic for same project/run state.

## v0.6.0 - Drift + Revalidation Baseline
- Deliverables:
  - Project drift report comparing latest and prior run outcomes.
  - Revalidation command to refresh project + policy status.
  - Dashboard indicators for stale/missing evidence.
- Acceptance criteria:
  - Drift report identifies changed/failing check surfaces.
  - Revalidation updates audit trail with timestamped records.

## v0.7.0 - Runner-First Update and Log Flows
- Deliverables:
  - Runner wrappers for documented update flow steps.
  - Log collection modes (`direct`, `indirect`, `fallback`) as first-class runs.
  - Evidence artifacts posted with transcript + structured metadata.
- Acceptance criteria:
  - All update/log run modes are requestable from UI.
  - Run history and support bundles include update/log evidence.

## v0.8.0 - Integrity and Signing
- Deliverables:
  - Support bundle signature and verification command.
  - Hash-chain linkage between run records and generated bundles.
- Acceptance criteria:
  - Bundle verification reports tamper/no-tamper status.
  - Audit export includes signature metadata.

## v0.9.0 - Integration and Scale
- Deliverables:
  - Webhook/event sinks (ticketing/SIEM style integration).
  - Policy/profile import/export and project templates.
  - Role delegation improvements for large teams.
- Acceptance criteria:
  - External systems can subscribe to run/policy/bundle events.
  - Policy packs are portable between deployments.

## v1.0.0 - Stable Operations Platform
- Deliverables:
  - Hardened upgrade path and backwards-compatible API contracts.
  - Complete documentation set and reproducible smoke/regression suites.
  - Signed release artifacts and versioned runbook/report schemas.
- Acceptance criteria:
  - Zero-manual setup path documented and validated in CI.
  - Predictable, auditable release process for regulated environments.
