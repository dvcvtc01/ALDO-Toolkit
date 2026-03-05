$ErrorActionPreference = "Stop"
$base = "http://localhost:4000/api/v1"

$username = "smokeadmin"
$password = "SmokePass1234567890SmokePass"

try {
  $login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (
    @{
      username = $username
      password = $password
    } | ConvertTo-Json
  )
  $token = $login.accessToken
}
catch {
  $bootstrap = Invoke-RestMethod -Method Post -Uri "$base/auth/bootstrap" -ContentType "application/json" -Body (
    @{
      username = $username
      password = $password
      displayName = "Smoke Admin"
    } | ConvertTo-Json
  )
  $token = $bootstrap.accessToken
}

$projectPayload = @{
  name = "smoke-support-bundle"
  environmentType = "air-gapped"
  deploymentModel = "physical"
  domainName = "corp.example.com"
  dnsServers = @("10.10.0.10")
  nodeCountTarget = 3
  managementIpPool = "10.20.0.10-10.20.0.50"
  ingressIp = "10.20.0.20"
  deploymentRange = "10.30.0.0/24"
  containerNetworkRange = "10.40.0.0/24"
  identityProviderHost = "adfs.corp.example.com"
  ingressEndpoints = @(@{ name = "portal"; fqdn = "portal.corp.example.com" })
  description = "Smoke test project"
  notes = "support bundle smoke"
}
$project = Invoke-RestMethod -Method Post -Uri "$base/projects" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body ($projectPayload | ConvertTo-Json -Depth 8)
$projectId = $project.id

function New-CompletedRun {
  param(
    [string]$Type,
    [hashtable]$RequestJson,
    [hashtable]$ResultJson,
    [string]$TranscriptText
  )

  $run = Invoke-RestMethod -Method Post -Uri "$base/projects/$projectId/runs" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body (
    @{
      type = $Type
      requestJson = $RequestJson
    } | ConvertTo-Json -Depth 12
  )

  $now = [DateTime]::UtcNow.ToString("o")
  $evidence = @{
    status = "completed"
    startedAt = $now
    finishedAt = $now
    executedBy = @{
      hostname = "SMOKEHOST"
      username = "smoke-admin"
      runnerVersion = "0.5.0"
    }
    transcriptText = $TranscriptText
    transcriptLines = @(@{
          timestamp = $now
          level = "info"
          message = "smoke"
          data = @{}
        })
    resultJson = $ResultJson
    artifacts = @()
  }

  Invoke-RestMethod -Method Post -Uri "$base/runs/$($run.id)/evidence" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body ($evidence | ConvertTo-Json -Depth 20) | Out-Null
  return $run.id
}

$acquireRunId = New-CompletedRun -Type "acquire_scan" -RequestJson @{
  providedArtifactRoot = "C:\artifacts"
  expectedRelativePath = "payload/update.zip"
} -ResultJson @{
  root = "C:\artifacts"
  matchedArtifact = @{
    relativePath = "payload/update.zip"
    sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  valid = $true
} -TranscriptText "acquire transcript"

$netcheckRunId = New-CompletedRun -Type "netcheck" -RequestJson @{
  endpoints = @("portal.corp.example.com")
  ingressIp = "10.20.0.20"
} -ResultJson @{
  valid = $true
  dnsChecks = @(@{
        endpoint = "portal.corp.example.com"
        resolved = $true
        addresses = @("10.20.0.20")
      })
  tcpChecks = @(@{
        targetIp = "10.20.0.20"
        port = 443
        reachable = $true
      })
} -TranscriptText "netcheck transcript"

$policyEvaluation = Invoke-RestMethod -Method Post -Uri "$base/projects/$projectId/policy-evaluations" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body "{}"
$policyEvaluationId = $policyEvaluation.id

$bundle = Invoke-RestMethod -Method Post -Uri "$base/projects/$projectId/support-bundles" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body "{}"
$bundleId = $bundle.id

$ready = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 2
  $detail = Invoke-RestMethod -Method Get -Uri "$base/support-bundles/$bundleId" -Headers @{ Authorization = "Bearer $token" }
  if ($detail.status -eq "ready") {
    $ready = $detail
    break
  }
  if ($detail.status -eq "failed") {
    throw "Bundle failed: $($detail.error)"
  }
}

if (-not $ready) {
  throw "Timed out waiting for support bundle to become ready."
}

$downloadPath = Join-Path $env:TEMP "aldo-support-bundle-$bundleId.zip"
Invoke-WebRequest -Method Get -Uri "$base/support-bundles/$bundleId/download" -Headers @{ Authorization = "Bearer $token" } -OutFile $downloadPath | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($downloadPath)
$entries = $archive.Entries |
Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
Select-Object -ExpandProperty FullName |
Sort-Object
$archive.Dispose()

"PROJECT_ID=$projectId"
"ACQUIRE_RUN_ID=$acquireRunId"
"NETCHECK_RUN_ID=$netcheckRunId"
"POLICY_EVALUATION_ID=$policyEvaluationId"
"BUNDLE_ID=$bundleId"
"ZIP_PATH=$downloadPath"
"BUNDLE_STATUS=$($ready.status)"
"BUNDLE_SHA256=$($ready.sha256)"
"TREE_START"
$entries
"TREE_END"
