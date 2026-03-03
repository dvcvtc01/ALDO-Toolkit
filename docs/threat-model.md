# ALDO Toolkit Threat Model

## Scope
Threat model covers `web`, `api`, `worker`, Postgres, Redis, local artifact storage, and PowerShell runner interaction with API.

## Assets
- Project planning data and network topology inputs.
- Certificate metadata and PKI validation outputs.
- Acquisition manifests and artifact hash evidence.
- Runner transcripts and support bundles.
- User credentials and role assignments.

## Trust Boundaries
- Browser to API boundary (`JWT` bearer token).
- API to database boundary.
- API to storage boundary.
- Runner host to API boundary.
- Queue boundary between API and worker via Redis.

## Primary Threats and Controls
### Spoofing
- Threat: Unauthorized API use.
- Control: JWT authentication, server-side role checks on every protected route.

### Tampering
- Threat: Altered artifacts or evidence files.
- Control: SHA256 hashing for acquisition artifacts; deterministic support-bundle manifest with per-file hashes.

### Repudiation
- Threat: Operator disputes actions.
- Control: Immutable records for validation and export events include actor and timestamp.

### Information Disclosure
- Threat: Secrets in logs or repository.
- Control: `.env`-driven secrets, no hardcoded credentials, structured logs scoped to operational evidence.

### Denial of Service
- Threat: oversized uploads or abusive checks.
- Control: multipart upload size limits, async worker pathway, clear service boundaries.

### Elevation of Privilege
- Threat: Viewer performs Operator/Admin actions.
- Control: strict role guard middleware (`Admin`, `Operator`, `Viewer`) enforced server-side.

## Residual Risks
- API bearer tokens are user-managed; compromised tokens can execute role-bound actions.
- PKI revocation endpoint checks may be inconclusive in fully air-gapped networks.
- Runner endpoint execution depends on workstation trust posture.

## Mitigations Planned Post-MVP
- OIDC integration and optional MFA.
- At-rest encryption and pluggable object storage (MinIO/S3-compatible).
- Signed support bundle archives.
- Fine-grained audit event schema and retention controls.
