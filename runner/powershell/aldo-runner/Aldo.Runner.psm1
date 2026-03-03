Set-StrictMode -Version Latest

function New-TranscriptEvent {
    param(
        [string]$Level,
        [string]$Message,
        [hashtable]$Data
    )

    return [ordered]@{
        timestamp = (Get-Date).ToString("o")
        level = $Level
        message = $Message
        data = $Data
    }
}

function Invoke-AldoRunner {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("run")]
        [string]$Command,

        [Parameter(Mandatory = $true)]
        [string]$Server,

        [Parameter(Mandatory = $true)]
        [string]$Project,

        [Parameter(Mandatory = $true)]
        [string]$Token,

        [ValidateSet("direct", "indirect", "fallback")]
        [string]$Mode = "direct",

        [string[]]$Endpoints = @(),

        [string]$IngressIp,

        [string]$OutputPath
    )

    if ($Command -ne "run") {
        throw "Only 'run' command is supported."
    }

    $transcript = New-Object System.Collections.Generic.List[object]
    $dnsChecks = New-Object System.Collections.Generic.List[object]
    $tcpChecks = New-Object System.Collections.Generic.List[object]

    $transcript.Add((New-TranscriptEvent -Level "info" -Message "ALDO runner start" -Data @{
                server = $Server
                project = $Project
                mode = $Mode
            }))

    foreach ($endpoint in $Endpoints) {
        try {
            $lookup = Resolve-DnsName -Name $endpoint -ErrorAction Stop
            $addresses = @($lookup | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
            $dnsChecks.Add([ordered]@{
                    endpoint = $endpoint
                    resolved = $true
                    addresses = $addresses
                    message = $null
                })
            $transcript.Add((New-TranscriptEvent -Level "info" -Message "DNS check passed" -Data @{
                        endpoint = $endpoint
                        addresses = $addresses
                    }))
        }
        catch {
            $dnsChecks.Add([ordered]@{
                    endpoint = $endpoint
                    resolved = $false
                    addresses = @()
                    message = $_.Exception.Message
                })
            $transcript.Add((New-TranscriptEvent -Level "warn" -Message "DNS check failed" -Data @{
                        endpoint = $endpoint
                        error = $_.Exception.Message
                    }))
        }
    }

    if ($IngressIp) {
        try {
            $tcp = Test-NetConnection -ComputerName $IngressIp -Port 443 -WarningAction SilentlyContinue
            $tcpChecks.Add([ordered]@{
                    targetIp = $IngressIp
                    port = 443
                    reachable = [bool]$tcp.TcpTestSucceeded
                    latencyMs = $null
                    message = $null
                })
            $transcript.Add((New-TranscriptEvent -Level "info" -Message "TCP check complete" -Data @{
                        targetIp = $IngressIp
                        reachable = [bool]$tcp.TcpTestSucceeded
                    }))
        }
        catch {
            $tcpChecks.Add([ordered]@{
                    targetIp = $IngressIp
                    port = 443
                    reachable = $false
                    latencyMs = $null
                    message = $_.Exception.Message
                })
            $transcript.Add((New-TranscriptEvent -Level "warn" -Message "TCP check failed" -Data @{
                        targetIp = $IngressIp
                        error = $_.Exception.Message
                    }))
        }
    }

    $environmentChecker = [ordered]@{
        executed = $false
        status = "pending"
        summary = "Environment checker wrapper placeholder. Integrate Microsoft checker in next phase."
        transcriptPath = $null
    }

    $payload = [ordered]@{
        projectId = $Project
        mode = $Mode
        dnsChecks = $dnsChecks
        tcpChecks = $tcpChecks
        environmentChecker = $environmentChecker
        transcript = $transcript
        collectedAt = (Get-Date).ToString("o")
    }

    if ($OutputPath) {
        $outputJson = $payload | ConvertTo-Json -Depth 12
        $outputDir = Split-Path -Parent $OutputPath
        if ($outputDir -and -not (Test-Path -Path $outputDir)) {
            New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
        }
        Set-Content -Path $OutputPath -Value $outputJson -Encoding UTF8
    }

    $uri = "$($Server.TrimEnd('/'))/api/v1/projects/$Project/runs/evidence"
    $headers = @{
        Authorization = "Bearer $Token"
    }

    $transcript.Add((New-TranscriptEvent -Level "info" -Message "Posting evidence payload" -Data @{
                uri = $uri
            }))

    try {
        $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 12)
        $transcript.Add((New-TranscriptEvent -Level "info" -Message "Evidence payload posted successfully" -Data @{
                    runId = $response.runId
                }))
        return $response
    }
    catch {
        $transcript.Add((New-TranscriptEvent -Level "error" -Message "Evidence post failed" -Data @{
                    error = $_.Exception.Message
                }))
        throw
    }
}

Export-ModuleMember -Function Invoke-AldoRunner
