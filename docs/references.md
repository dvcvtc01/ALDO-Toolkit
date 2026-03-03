# References (Microsoft Learn)

The following references informed ALDO Toolkit requirements and validation rules.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-overview?preserve-view=true&view=azloc-2602  
  Overview, eligibility, supported services, minimum management-cluster capacity, and troubleshooting flow links.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-acquire?view=azloc-2512  
  Acquisition prerequisites (active subscription, approval, RBAC), artifact download flow, and compatible version table.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-deploy?view=azloc-2510  
  Physical-machine-only constraint, 3-16 machine management instance, deployment checklist, and control-plane install sequence.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-network?view=azloc-2509  
  Network/vNIC model, ingress IP placement constraints, DNS requirements, identity reachability, and external routing to ingress:443.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-identity?view=azloc-2507  
  Identity model details (AD groups + AD FS), OIDC/LDAP conceptual integration, and Universal group requirement.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-pki?view=azloc-2602  
  PKI requirements: no self-signed certs, 24 endpoint certs, shared trust chain, expiry guidance, and CRL/CDP/OCSP considerations.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-update?view=azloc-2602  
  Update procedure: stage update package, import OperationsModule, upload package, wait for staging, export BitLocker keys, update history.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-on-demand-logs?view=azloc-2511  
  On-demand log collection workflow, direct/indirect/fallback method selection, and support submission process.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/disconnected-operations-fallback?view=azloc-2512  
  Fallback logging method for appliance-down scenarios, `Copy-DiagnosticData`, and BitLocker key usage during log extraction.

- https://learn.microsoft.com/en-us/azure/azure-local/manage/use-environment-checker?view=azloc-2512  
  Environment Checker usage reference for workstation/staging-host validation workflows (connectivity/readiness checks).
