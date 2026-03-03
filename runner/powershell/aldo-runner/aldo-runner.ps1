Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "Aldo.Runner.psd1") -Force

if ($args.Count -eq 0) {
    throw "Usage: aldo-runner run --server <url> --project <id> --token <jwt> [--mode direct|indirect|fallback] [--endpoint fqdn] [--ingress-ip ip] [--out file]"
}

$command = $args[0]
$map = @{}
$endpoints = New-Object System.Collections.Generic.List[string]

$i = 1
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
            $endpoints.Add([string]$args[$i])
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
if (-not $map.ContainsKey("token")) { throw "--token is required" }

$mode = if ($map.ContainsKey("mode")) { $map["mode"] } else { "direct" }
$ingressIp = if ($map.ContainsKey("ingress-ip")) { $map["ingress-ip"] } elseif ($map.ContainsKey("ingressip")) { $map["ingressip"] } else { $null }
$outputPath = if ($map.ContainsKey("out")) { $map["out"] } else { $null }

Invoke-AldoRunner `
    -Command $command `
    -Server $map["server"] `
    -Project $map["project"] `
    -Token $map["token"] `
    -Mode $mode `
    -Endpoints $endpoints.ToArray() `
    -IngressIp $ingressIp `
    -OutputPath $outputPath
