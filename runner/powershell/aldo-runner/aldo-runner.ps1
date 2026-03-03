Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "Aldo.Runner.psd1") -Force

if ($args.Count -lt 1) {
    throw "Usage: aldo-runner acquire scan|netcheck|envcheck --server <url> --project <id> --token <jwt> [options]"
}

$primary = ([string]$args[0]).ToLowerInvariant()
$command = $null
$startIndex = 1

switch ($primary) {
    "acquire" {
        if ($args.Count -lt 2 -or ([string]$args[1]).ToLowerInvariant() -ne "scan") {
            throw "Usage: aldo-runner acquire scan --server <url> --project <id> --root <path> [--expectedPath <relative>] [--expectedSha256 <sha>] [--run <run-id>] [--out <file>]"
        }
        $command = "acquire_scan"
        $startIndex = 2
    }
    "netcheck" {
        $command = "netcheck"
        $startIndex = 1
    }
    "envcheck" {
        $command = "envcheck"
        $startIndex = 1
    }
    "run" {
        # Backward-compatible alias from v0.1.0
        $command = "netcheck"
        $startIndex = 1
    }
    default {
        throw "Unknown command '$primary'. Use 'acquire scan', 'netcheck', or 'envcheck'."
    }
}

$map = @{}
$endpointItems = New-Object System.Collections.Generic.List[string]

$i = $startIndex
while ($i -lt $args.Count) {
    $rawKey = [string]$args[$i]
    if (-not $rawKey.StartsWith("-")) {
        $i++
        continue
    }

    $key = $rawKey.TrimStart("-").ToLowerInvariant()

    if ($key -eq "endpoint") {
        $i++
        if ($i -lt $args.Count) {
            $endpointItems.Add([string]$args[$i])
        }
        $i++
        continue
    }

    $i++
    if ($i -lt $args.Count) {
        $map[$key] = [string]$args[$i]
    }
    $i++
}

if (-not $map.ContainsKey("server")) { throw "--server is required" }
if (-not $map.ContainsKey("project")) { throw "--project is required" }

$token = $null
if ($map.ContainsKey("token")) {
    $token = $map["token"]
}
elseif ($env:ALDO_TOKEN) {
    $token = $env:ALDO_TOKEN
}

if ([string]::IsNullOrWhiteSpace($token)) { throw "--token is required (or set ALDO_TOKEN)" }

$run = if ($map.ContainsKey("run")) { $map["run"] } else { $null }
$outputPath = if ($map.ContainsKey("out")) { $map["out"] } else { $null }

$root = if ($map.ContainsKey("root")) { $map["root"] } else { $null }
$expectedSha256 = if ($map.ContainsKey("expectedsha256")) { $map["expectedsha256"] } else { $null }
$expectedPath = if ($map.ContainsKey("expectedpath")) { $map["expectedpath"] } elseif ($map.ContainsKey("expectedrelativepath")) { $map["expectedrelativepath"] } else { $null }
$endpoints = if ($map.ContainsKey("endpoints")) { $map["endpoints"] } else { $null }
$ingressIp = if ($map.ContainsKey("ingress-ip")) { $map["ingress-ip"] } elseif ($map.ContainsKey("ingressip")) { $map["ingressip"] } else { $null }
$modulePath = if ($map.ContainsKey("modulepath")) { $map["modulepath"] } else { $null }
$additionalArgs = if ($map.ContainsKey("additionalargs")) { $map["additionalargs"] } else { $null }

if ($command -eq "acquire_scan" -and [string]::IsNullOrWhiteSpace($root)) {
    throw "--root is required for acquire scan"
}
if ($command -eq "envcheck" -and [string]::IsNullOrWhiteSpace($modulePath)) {
    throw "--modulePath is required for envcheck"
}

Invoke-AldoRunner `
    -Command $command `
    -Server $map["server"] `
    -Project $map["project"] `
    -Token $token `
    -Run $run `
    -Root $root `
    -ExpectedPath $expectedPath `
    -ExpectedSha256 $expectedSha256 `
    -Endpoints $endpoints `
    -Endpoint $endpointItems.ToArray() `
    -IngressIp $ingressIp `
    -ModulePath $modulePath `
    -AdditionalArgs $additionalArgs `
    -OutputPath $outputPath
