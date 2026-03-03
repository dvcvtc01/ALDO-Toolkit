Set-StrictMode -Version Latest

function Get-RunnerVersion {
    try {
        $manifestPath = Join-Path $PSScriptRoot "Aldo.Runner.psd1"
        return (Test-ModuleManifest -Path $manifestPath).Version.ToString()
    }
    catch {
        return "0.2.0"
    }
}

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
        data = if ($null -ne $Data) { $Data } else { @{} }
    }
}

function Add-TranscriptEvent {
    param(
        [System.Collections.Generic.List[object]]$Transcript,
        [string]$Level,
        [string]$Message,
        [hashtable]$Data
    )

    $Transcript.Add((New-TranscriptEvent -Level $Level -Message $Message -Data $Data))
}

function Convert-TranscriptToText {
    param(
        [System.Collections.Generic.List[object]]$Transcript
    )

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($event in $Transcript) {
        $dataJson = "{}"
        try {
            $dataJson = ($event.data | ConvertTo-Json -Depth 8 -Compress)
        }
        catch {
            $dataJson = "{}"
        }
        $lines.Add("[$($event.timestamp)] [$($event.level)] $($event.message) $dataJson")
    }

    return ($lines -join [Environment]::NewLine)
}

function Get-ExecutionInfo {
    $hostname = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { [System.Net.Dns]::GetHostName() }
    $username = $env:USERNAME
    if ([string]::IsNullOrWhiteSpace($username)) {
        $username = [Environment]::UserName
    }

    return [ordered]@{
        hostname = $hostname
        username = $username
        runnerVersion = Get-RunnerVersion
    }
}

function Invoke-AldoApi {
    param(
        [string]$Uri,
        [string]$Method,
        [string]$Token,
        [object]$Body
    )

    $headers = @{
        Authorization = "Bearer $Token"
    }

    if ($null -eq $Body) {
        return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers
    }

    return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 16)
}

function New-RunRequest {
    param(
        [string]$Server,
        [string]$Project,
        [string]$Token,
        [string]$Type,
        [hashtable]$RequestJson
    )

    $uri = "$($Server.TrimEnd('/'))/api/v1/projects/$Project/runs"
    $body = [ordered]@{
        type = $Type
        requestJson = if ($null -ne $RequestJson) { $RequestJson } else { @{} }
    }

    return Invoke-AldoApi -Uri $uri -Method "Post" -Token $Token -Body $body
}

function Get-RunDetail {
    param(
        [string]$Server,
        [string]$Run,
        [string]$Token
    )

    $uri = "$($Server.TrimEnd('/'))/api/v1/runs/$Run"
    return Invoke-AldoApi -Uri $uri -Method "Get" -Token $Token -Body $null
}

function Get-ProjectDetail {
    param(
        [string]$Server,
        [string]$Project,
        [string]$Token
    )

    $uri = "$($Server.TrimEnd('/'))/api/v1/projects/$Project"
    return Invoke-AldoApi -Uri $uri -Method "Get" -Token $Token -Body $null
}

function Submit-RunEvidence {
    param(
        [string]$Server,
        [string]$Run,
        [string]$Token,
        [hashtable]$Evidence
    )

    $uri = "$($Server.TrimEnd('/'))/api/v1/runs/$Run/evidence"
    return Invoke-AldoApi -Uri $uri -Method "Post" -Token $Token -Body $Evidence
}

function Normalize-RelativePath {
    param(
        [string]$PathValue
    )

    return ($PathValue -replace "\\", "/").TrimStart("/")
}

function Resolve-Endpoints {
    param(
        [string]$EndpointsInput,
        [string[]]$EndpointItems
    )

    $items = New-Object System.Collections.Generic.List[string]

    if (-not [string]::IsNullOrWhiteSpace($EndpointsInput)) {
        if (Test-Path -LiteralPath $EndpointsInput) {
            $fileLines = Get-Content -LiteralPath $EndpointsInput
            foreach ($line in $fileLines) {
                $trimmed = [string]$line
                $trimmed = $trimmed.Trim()
                if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                    $items.Add($trimmed)
                }
            }
        }
        else {
            $split = $EndpointsInput -split "[\r\n,;]"
            foreach ($entry in $split) {
                $trimmed = [string]$entry
                $trimmed = $trimmed.Trim()
                if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                    $items.Add($trimmed)
                }
            }
        }
    }

    if ($EndpointItems) {
        foreach ($entry in $EndpointItems) {
            $trimmed = [string]$entry
            $trimmed = $trimmed.Trim()
            if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                $items.Add($trimmed)
            }
        }
    }

    $unique = New-Object System.Collections.Generic.List[string]
    $seen = @{}
    foreach ($endpoint in $items) {
        $key = $endpoint.ToLowerInvariant()
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $unique.Add($endpoint)
        }
    }

    return $unique.ToArray()
}

function Build-AcquireResult {
    param(
        [string]$Root,
        [object[]]$Files,
        [string]$ExpectedPath,
        [string]$ExpectedSha256,
        [bool]$RootExists
    )

    $normalizedExpectedPath = if (-not [string]::IsNullOrWhiteSpace($ExpectedPath)) {
        Normalize-RelativePath -PathValue $ExpectedPath
    }
    else {
        $null
    }

    $targetFile = $null
    if ($normalizedExpectedPath) {
        foreach ($file in $Files) {
            if ($file.relativePath -ieq $normalizedExpectedPath) {
                $targetFile = $file
                break
            }
        }
    }

    $expectedPathExists = if ($normalizedExpectedPath) { $null -ne $targetFile } else { $true }

    $expectedShaMatch = $true
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSha256)) {
        if ($targetFile) {
            $expectedShaMatch = $targetFile.sha256 -ieq $ExpectedSha256
        }
        elseif ($Files.Count -eq 1) {
            $expectedShaMatch = $Files[0].sha256 -ieq $ExpectedSha256
        }
        else {
            $expectedShaMatch = $false
            foreach ($file in $Files) {
                if ($file.sha256 -ieq $ExpectedSha256) {
                    $expectedShaMatch = $true
                    break
                }
            }
        }
    }

    $valid = $RootExists -and $expectedPathExists -and $expectedShaMatch

    return [ordered]@{
        root = $Root
        rootExists = $RootExists
        fileCount = $Files.Count
        expected = [ordered]@{
            relativePath = $normalizedExpectedPath
            sha256 = $ExpectedSha256
        }
        matchedArtifact = $targetFile
        checks = [ordered]@{
            expectedPathExists = $expectedPathExists
            expectedSha256Match = $expectedShaMatch
        }
        valid = $valid
    }
}

function Invoke-AldoRunner {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("acquire_scan", "netcheck")]
        [string]$Command,

        [Parameter(Mandatory = $true)]
        [string]$Server,

        [Parameter(Mandatory = $true)]
        [string]$Project,

        [Parameter(Mandatory = $true)]
        [string]$Token,

        [string]$Run,

        [string]$Root,

        [string]$ExpectedPath,

        [string]$ExpectedSha256,

        [string]$Endpoints,

        [string[]]$Endpoint = @(),

        [string]$IngressIp,

        [string]$OutputPath
    )

    $startedAt = (Get-Date).ToString("o")
    $transcript = New-Object System.Collections.Generic.List[object]
    $executionInfo = Get-ExecutionInfo
    $runId = $Run

    Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Runner invocation started" -Data @{
        command = $Command
        project = $Project
        server = $Server
    }

    try {
        $artifacts = New-Object System.Collections.Generic.List[object]
        $resultJson = $null

        if ([string]::IsNullOrWhiteSpace($runId)) {
            $requestJson = @{}
            if ($Command -eq "acquire_scan") {
                $requestJson = [ordered]@{
                    root = $Root
                    expectedRelativePath = $ExpectedPath
                    expectedSha256 = $ExpectedSha256
                }
            }
            elseif ($Command -eq "netcheck") {
                $resolvedEndpointsForRequest = Resolve-Endpoints -EndpointsInput $Endpoints -EndpointItems $Endpoint
                $requestJson = [ordered]@{
                    endpoints = $resolvedEndpointsForRequest
                    ingressIp = $IngressIp
                }
            }

            $runResponse = New-RunRequest -Server $Server -Project $Project -Token $Token -Type $Command -RequestJson $requestJson
            $runId = [string]$runResponse.id
            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Run request created" -Data @{ runId = $runId }
        }
        else {
            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Using existing run request" -Data @{ runId = $runId }
        }

        if ($Command -eq "acquire_scan") {
            if ([string]::IsNullOrWhiteSpace($Root)) {
                throw "--root is required for acquire scan"
            }

            $resolvedRoot = Resolve-Path -LiteralPath $Root -ErrorAction Stop
            $rootPath = [string]$resolvedRoot.Path
            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Scanning acquisition root" -Data @{ root = $rootPath }

            $files = Get-ChildItem -LiteralPath $rootPath -Recurse -File
            foreach ($file in $files) {
                $hash = Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
                $relativePath = Normalize-RelativePath -PathValue $file.FullName.Substring($rootPath.Length).TrimStart("\\", "/")
                $artifacts.Add([ordered]@{
                        relativePath = $relativePath
                        sha256 = [string]$hash.Hash
                        sizeBytes = [int64]$file.Length
                        modifiedAt = $file.LastWriteTimeUtc.ToString("o")
                    })
            }

            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Acquisition scan complete" -Data @{ files = $artifacts.Count }

            $resultJson = Build-AcquireResult -Root $rootPath -Files $artifacts.ToArray() -ExpectedPath $ExpectedPath -ExpectedSha256 $ExpectedSha256 -RootExists $true
        }
        elseif ($Command -eq "netcheck") {
            $existingRun = $null
            try {
                $existingRun = Get-RunDetail -Server $Server -Run $runId -Token $Token
            }
            catch {
                Add-TranscriptEvent -Transcript $transcript -Level "warn" -Message "Unable to load run detail; continuing with provided args" -Data @{ runId = $runId; error = $_.Exception.Message }
            }

            $resolvedEndpoints = Resolve-Endpoints -EndpointsInput $Endpoints -EndpointItems $Endpoint
            $effectiveIngressIp = $IngressIp

            if ($resolvedEndpoints.Count -eq 0 -and $null -ne $existingRun -and $existingRun.requestJson) {
                if ($existingRun.requestJson.endpoints) {
                    $fromRun = @($existingRun.requestJson.endpoints | ForEach-Object { [string]$_ })
                    $resolvedEndpoints = Resolve-Endpoints -EndpointsInput ($fromRun -join ",") -EndpointItems @()
                }
                if ([string]::IsNullOrWhiteSpace($effectiveIngressIp) -and $existingRun.requestJson.ingressIp) {
                    $effectiveIngressIp = [string]$existingRun.requestJson.ingressIp
                }
            }

            if ($resolvedEndpoints.Count -eq 0 -or [string]::IsNullOrWhiteSpace($effectiveIngressIp)) {
                $project = Get-ProjectDetail -Server $Server -Project $Project -Token $Token
                if ($resolvedEndpoints.Count -eq 0) {
                    $projectEndpoints = New-Object System.Collections.Generic.List[string]
                    foreach ($endpointObj in @($project.ingressEndpoints)) {
                        if ($endpointObj.fqdn) {
                            $projectEndpoints.Add([string]$endpointObj.fqdn)
                        }
                    }
                    if ($project.identityProviderHost) {
                        $projectEndpoints.Add([string]$project.identityProviderHost)
                    }
                    $resolvedEndpoints = Resolve-Endpoints -EndpointsInput ($projectEndpoints -join ",") -EndpointItems @()
                }
                if ([string]::IsNullOrWhiteSpace($effectiveIngressIp) -and $project.ingressIp) {
                    $effectiveIngressIp = [string]$project.ingressIp
                }
            }

            $dnsChecks = New-Object System.Collections.Generic.List[object]
            foreach ($endpointValue in $resolvedEndpoints) {
                try {
                    $lookup = Resolve-DnsName -Name $endpointValue -ErrorAction Stop
                    $addresses = @($lookup | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
                    $dnsChecks.Add([ordered]@{
                            endpoint = $endpointValue
                            resolved = $true
                            addresses = $addresses
                            message = $null
                        })
                    Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "DNS check passed" -Data @{ endpoint = $endpointValue; addresses = $addresses }
                }
                catch {
                    $dnsChecks.Add([ordered]@{
                            endpoint = $endpointValue
                            resolved = $false
                            addresses = @()
                            message = $_.Exception.Message
                        })
                    Add-TranscriptEvent -Transcript $transcript -Level "warn" -Message "DNS check failed" -Data @{ endpoint = $endpointValue; error = $_.Exception.Message }
                }
            }

            $tcpChecks = New-Object System.Collections.Generic.List[object]
            if (-not [string]::IsNullOrWhiteSpace($effectiveIngressIp)) {
                try {
                    $tcp = Test-NetConnection -ComputerName $effectiveIngressIp -Port 443 -WarningAction SilentlyContinue
                    $tcpChecks.Add([ordered]@{
                            targetIp = $effectiveIngressIp
                            port = 443
                            reachable = [bool]$tcp.TcpTestSucceeded
                            latencyMs = $null
                            message = $null
                        })
                    Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "TCP 443 check complete" -Data @{ ingressIp = $effectiveIngressIp; reachable = [bool]$tcp.TcpTestSucceeded }
                }
                catch {
                    $tcpChecks.Add([ordered]@{
                            targetIp = $effectiveIngressIp
                            port = 443
                            reachable = $false
                            latencyMs = $null
                            message = $_.Exception.Message
                        })
                    Add-TranscriptEvent -Transcript $transcript -Level "warn" -Message "TCP 443 check failed" -Data @{ ingressIp = $effectiveIngressIp; error = $_.Exception.Message }
                }
            }
            else {
                Add-TranscriptEvent -Transcript $transcript -Level "warn" -Message "No ingress IP available for TCP check" -Data @{}
            }

            $resultJson = [ordered]@{
                endpoints = $resolvedEndpoints
                ingressIp = $effectiveIngressIp
                dnsChecks = $dnsChecks
                tcpChecks = $tcpChecks
                valid =
                ($dnsChecks.Count -gt 0) -and
                (@($dnsChecks | Where-Object { -not $_.resolved }).Count -eq 0) -and
                (@($tcpChecks | Where-Object { $_.port -eq 443 -and -not $_.reachable }).Count -eq 0)
            }
        }

        $finishedAt = (Get-Date).ToString("o")
        $transcriptText = Convert-TranscriptToText -Transcript $transcript
        $evidence = [ordered]@{
            status = "completed"
            startedAt = $startedAt
            finishedAt = $finishedAt
            executedBy = $executionInfo
            transcriptText = $transcriptText
            transcriptLines = $transcript
            resultJson = $resultJson
            artifacts = $artifacts
        }

        Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Posting run evidence" -Data @{ runId = $runId }
        $response = Submit-RunEvidence -Server $Server -Run $runId -Token $Token -Evidence $evidence

        if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
            $outputDir = Split-Path -Parent $OutputPath
            if ($outputDir -and -not (Test-Path -LiteralPath $outputDir)) {
                New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
            }

            $outputPayload = [ordered]@{
                runId = $runId
                command = $Command
                project = $Project
                evidence = $evidence
            }
            Set-Content -Path $OutputPath -Value ($outputPayload | ConvertTo-Json -Depth 16) -Encoding UTF8
        }

        return $response
    }
    catch {
        $errorMessage = $_.Exception.Message
        Add-TranscriptEvent -Transcript $transcript -Level "error" -Message "Runner execution failed" -Data @{ error = $errorMessage }

        if (-not [string]::IsNullOrWhiteSpace($runId)) {
            try {
                $failureEvidence = [ordered]@{
                    status = "failed"
                    startedAt = $startedAt
                    finishedAt = (Get-Date).ToString("o")
                    executedBy = $executionInfo
                    transcriptText = Convert-TranscriptToText -Transcript $transcript
                    transcriptLines = $transcript
                    resultJson = [ordered]@{
                        error = $errorMessage
                        command = $Command
                    }
                    artifacts = @()
                }

                Submit-RunEvidence -Server $Server -Run $runId -Token $Token -Evidence $failureEvidence | Out-Null
            }
            catch {
                # best effort failure reporting only
            }
        }

        throw
    }
}

Export-ModuleMember -Function Invoke-AldoRunner
