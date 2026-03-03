# ALDO Toolkit User Guide

## 1. Create Project
1. Sign in with a local `Admin` or `Operator` account.
2. Open **Plan** and complete the wizard fields:
   - environment type (`air-gapped` or `limited-connectivity`)
   - domain and DNS servers
   - node count target (`3-16`, physical only)
   - management pool, ingress IP, deployment range, container range
   - identity provider host and ingress endpoint FQDNs
3. Resolve inline validation errors and select **Create Project**.

## 2. Acquire Artifacts
1. Open **Acquire** for the selected project.
2. Confirm prerequisite controls:
   - active Azure subscription
   - approval granted
   - RBAC permission present
3. Enter artifact root folder, expected artifact relative path, and SHA256.
4. Select **Validate Acquisition Checklist** to verify presence/hash and store evidence.

## 3. Validate PKI
1. Open **PKI** for the selected project.
2. Upload certificate bundle (`.pfx`, `.p12`, `.cer`, `.crt`, `.der`, `.pem`).
3. Provide passphrase for encrypted PFX when needed.
4. Select **Run PKI Validation**.
5. Review output for:
   - total certificate count (`24` required)
   - trust chain consistency
   - no self-signed certificates
   - SAN presence
   - expiry >= 2 years from deployment date
   - CRL/CDP/OCSP endpoint reachability warnings

## 4. Run Network Checks
1. Open **Checks**.
2. Optionally provide endpoint overrides.
3. Select **Run Network Checks** to test DNS and TCP 443 ingress reachability.

## 5. Export Runbook and Report
1. Open **Exports**.
2. Select **Generate Export**.
3. Toolkit writes and records:
   - `Runbook.md`
   - `validation-report.json`

## 6. Runner Evidence (Optional)
Use runner from workstation/staging host:
```powershell
.\runner\powershell\aldo-runner\aldo-runner.ps1 run --server http://localhost:4000 --project <project-id> --token <jwt> --endpoint portal.example.com --ingress-ip 10.20.0.20
```
This posts structured DNS/TCP evidence and transcript data to **Runs**.
