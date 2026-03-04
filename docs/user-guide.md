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
4. Select **Request Acquire Scan**.
5. Copy the generated runner command and execute it from the workstation/staging host that can access the artifact folder.
6. Return to **Acquire** or **Runs** to review status, transcript, and scan result JSON.

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
3. Select **Run Network Checks** to create a run request.
4. Copy and execute the runner command from the execution host.
5. Review latest network check output in **Checks** or full details in **Runs**.

## 5. Run Environment Checker (Offline)
1. Stage the Environment Checker module folder on the execution host (offline source).
2. Open **Checks** and go to **Environment Checker**.
3. Provide `modulePath` and optional additional args.
4. Select **Run Environment Checker** to create a run request.
5. Copy and execute the runner command on the execution host.
6. Review summary (`Green`/`Amber`/`Red`) and top failures in **Checks** or **Runs**.

## 6. Export Runbook and Report
1. Open **Exports**.
2. Select **Generate Export**.
3. Toolkit writes and records:
   - `Runbook.md`
   - `validation-report.json`
   - latest envcheck summary + artifact metadata

## 7. Generate Support Bundle v1
1. Open **Exports**.
2. Select **Generate Support Bundle**.
3. Wait for status to become `ready` in the bundle list.
4. Select **Download** for the ready bundle.
5. Confirm ZIP contains:
   - `bundle-metadata.json`
   - `manifest.json`
   - `checksums.txt`
   - `project/project.json`
   - `exports/Runbook.md`
   - `exports/validation-report.json`
   - latest completed runs under `runs/<type>/<runId>/`.
6. Confirm bundle excludes private keys, secrets, and raw uploaded cert bundle files.

## 8. Runner Commands
Use runner from workstation/staging host:
```powershell
.\runner\powershell\aldo-runner\aldo-runner.ps1 acquire scan --server http://localhost:4000 --project <project-id> --token <jwt> --root C:\artifacts --expectedPath payload\update.zip --expectedSha256 <sha256>
.\runner\powershell\aldo-runner\aldo-runner.ps1 netcheck --server http://localhost:4000 --project <project-id> --token <jwt>
.\runner\powershell\aldo-runner\aldo-runner.ps1 envcheck --server http://localhost:4000 --project <project-id> --token <jwt> --modulePath C:\staged\EnvironmentChecker --additionalArgs "<args>"
```
Commands post structured evidence, transcript, execution host details, and result JSON to **Runs**.
