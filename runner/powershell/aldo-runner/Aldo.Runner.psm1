Set-StrictMode -Version Latest

function Get-RunnerVersion {
    try {
        $manifestPath = Join-Path $PSScriptRoot "Aldo.Runner.psd1"
        return (Test-ModuleManifest -Path $manifestPath).Version.ToString()
    }
    catch {
        return "0.5.0"
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

function New-ArtifactMetadata {
    param(
        [System.IO.FileInfo]$File,
        [string]$RootPath
    )

    $hash = Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256
    $relativePath = $null

    if (-not [string]::IsNullOrWhiteSpace($RootPath) -and $File.FullName.StartsWith($RootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $suffix = $File.FullName.Substring($RootPath.Length).TrimStart("\\", "/")
        if (-not [string]::IsNullOrWhiteSpace($suffix)) {
            $relativePath = Normalize-RelativePath -PathValue $suffix
        }
    }

    $metadata = [ordered]@{
        filename = $File.Name
        sha256 = [string]$hash.Hash
        sizeBytes = [int64]$File.Length
        modifiedAt = $File.LastWriteTimeUtc.ToString("o")
    }

    if (-not [string]::IsNullOrWhiteSpace($relativePath)) {
        $metadata.relativePath = $relativePath
    }

    return $metadata
}

function Get-RecordProperty {
    param(
        [object]$Value,
        [string[]]$PropertyNames
    )

    if ($null -eq $Value) {
        return $null
    }

    foreach ($propertyName in $PropertyNames) {
        try {
            $property = $Value.PSObject.Properties[$propertyName]
            if ($null -ne $property) {
                $propertyValue = $property.Value
                if ($null -ne $propertyValue) {
                    return [string]$propertyValue
                }
            }
        }
        catch {
            # continue
        }
    }

    return $null
}

function Normalize-CheckStatus {
    param(
        [string]$StatusValue,
        [string]$FallbackText
    )

    $source = $StatusValue
    if ([string]::IsNullOrWhiteSpace($source)) {
        $source = $FallbackText
    }

    if ([string]::IsNullOrWhiteSpace($source)) {
        return "unknown"
    }

    $normalized = $source.Trim().ToLowerInvariant()
    if ($normalized -match "pass|success|ok") {
        return "passed"
    }
    if ($normalized -match "warn|skip|unknown|info") {
        return "warning"
    }
    if ($normalized -match "fail|error|critical") {
        return "failed"
    }

    return "unknown"
}

function Convert-EnvcheckOutputToSummary {
    param(
        [object[]]$OutputItems
    )

    $records = New-Object System.Collections.Generic.List[object]
    $counts = [ordered]@{
        total = 0
        passed = 0
        warning = 0
        failed = 0
        unknown = 0
    }

    $categories = @{}
    $topFailures = New-Object System.Collections.Generic.List[object]
    $keyErrors = New-Object System.Collections.Generic.List[string]

    foreach ($item in $OutputItems) {
        $counts.total = [int]$counts.total + 1
        $category = "General"
        $name = "check"
        $message = ""
        $status = "unknown"

        if ($item -is [System.Management.Automation.ErrorRecord]) {
            $category = "Errors"
            $name = if ($item.FullyQualifiedErrorId) { [string]$item.FullyQualifiedErrorId } else { "ErrorRecord" }
            $message = if ($item.Exception) { [string]$item.Exception.Message } else { [string]$item }
            $status = "failed"
        }
        elseif ($item -is [string]) {
            $message = [string]$item
            $status = Normalize-CheckStatus -StatusValue $null -FallbackText $message
            if ($message -match "category[:=]\s*([^,;]+)") {
                $category = $matches[1].Trim()
            }
        }
        else {
            $categoryCandidate = Get-RecordProperty -Value $item -PropertyNames @("Category", "Group", "Area", "Scope")
            if (-not [string]::IsNullOrWhiteSpace($categoryCandidate)) {
                $category = $categoryCandidate
            }

            $nameCandidate = Get-RecordProperty -Value $item -PropertyNames @("Name", "Check", "Test", "Rule", "Id")
            if (-not [string]::IsNullOrWhiteSpace($nameCandidate)) {
                $name = $nameCandidate
            }

            $messageCandidate = Get-RecordProperty -Value $item -PropertyNames @("Message", "Error", "Details", "Description", "Reason")
            if (-not [string]::IsNullOrWhiteSpace($messageCandidate)) {
                $message = $messageCandidate
            }
            else {
                $message = [string]$item
            }

            $statusCandidate = Get-RecordProperty -Value $item -PropertyNames @("Status", "Result", "Outcome", "State", "Severity")
            $status = Normalize-CheckStatus -StatusValue $statusCandidate -FallbackText $message
        }

        switch ($status) {
            "passed" { $counts.passed = [int]$counts.passed + 1 }
            "warning" { $counts.warning = [int]$counts.warning + 1 }
            "failed" { $counts.failed = [int]$counts.failed + 1 }
            default { $counts.unknown = [int]$counts.unknown + 1 }
        }

        if (-not $categories.ContainsKey($category)) {
            $categories[$category] = [ordered]@{
                name = $category
                total = 0
                passed = 0
                warning = 0
                failed = 0
                unknown = 0
            }
        }

        $categoryStats = $categories[$category]
        $categoryStats.total = [int]$categoryStats.total + 1
        switch ($status) {
            "passed" { $categoryStats.passed = [int]$categoryStats.passed + 1 }
            "warning" { $categoryStats.warning = [int]$categoryStats.warning + 1 }
            "failed" { $categoryStats.failed = [int]$categoryStats.failed + 1 }
            default { $categoryStats.unknown = [int]$categoryStats.unknown + 1 }
        }

        $records.Add([ordered]@{
                category = $category
                name = $name
                status = $status
                message = $message
            })

        if ($status -eq "failed") {
            if ($topFailures.Count -lt 10) {
                $topFailures.Add([ordered]@{
                        category = $category
                        name = $name
                        message = $message
                    })
            }
            if (-not [string]::IsNullOrWhiteSpace($message) -and -not $keyErrors.Contains($message)) {
                $keyErrors.Add($message)
            }
        }
    }

    $overall = "Amber"
    if ([int]$counts.failed -gt 0) {
        $overall = "Red"
    }
    elseif ([int]$counts.warning -eq 0 -and [int]$counts.passed -gt 0) {
        $overall = "Green"
    }

    $categorySummary = @()
    foreach ($key in ($categories.Keys | Sort-Object)) {
        $categorySummary += $categories[$key]
    }

    return [ordered]@{
        overall = $overall
        counts = $counts
        categories = $categorySummary
        topFailures = $topFailures
        keyErrors = $keyErrors
        parsedRecords = $records
    }
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
        [ValidateSet("acquire_scan", "netcheck", "envcheck")]
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

        [string]$ModulePath,

        [string]$AdditionalArgs,

        [string]$OutputPath
    )

    $startedAt = (Get-Date).ToString("o")
    $transcript = New-Object System.Collections.Generic.List[object]
    $executionInfo = Get-ExecutionInfo
    $runId = $Run
    $artifacts = New-Object System.Collections.Generic.List[object]
    $resultJson = $null

    Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Runner invocation started" -Data @{
        command = $Command
        project = $Project
        server = $Server
    }

    try {
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
            elseif ($Command -eq "envcheck") {
                $requestJson = [ordered]@{
                    modulePath = $ModulePath
                    additionalArgs = $AdditionalArgs
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
                $artifacts.Add((New-ArtifactMetadata -File $file -RootPath $rootPath))
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
        elseif ($Command -eq "envcheck") {
            $existingRun = $null
            try {
                $existingRun = Get-RunDetail -Server $Server -Run $runId -Token $Token
            }
            catch {
                Add-TranscriptEvent -Transcript $transcript -Level "warn" -Message "Unable to load run detail; continuing with provided args" -Data @{ runId = $runId; error = $_.Exception.Message }
            }

            $effectiveModulePath = $ModulePath
            if ([string]::IsNullOrWhiteSpace($effectiveModulePath) -and $null -ne $existingRun -and $existingRun.requestJson.modulePath) {
                $effectiveModulePath = [string]$existingRun.requestJson.modulePath
            }
            if ([string]::IsNullOrWhiteSpace($effectiveModulePath)) {
                throw "--modulePath is required for envcheck"
            }

            $effectiveAdditionalArgs = $AdditionalArgs
            if ([string]::IsNullOrWhiteSpace($effectiveAdditionalArgs) -and $null -ne $existingRun -and $existingRun.requestJson.additionalArgs) {
                $effectiveAdditionalArgs = [string]$existingRun.requestJson.additionalArgs
            }

            $resolvedModulePath = Resolve-Path -LiteralPath $effectiveModulePath -ErrorAction Stop
            $moduleRoot = [string]$resolvedModulePath.Path
            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Preparing environment checker execution" -Data @{ modulePath = $moduleRoot }

            $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "aldo-runner"
            if (-not (Test-Path -LiteralPath $tempRoot)) {
                New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
            }

            $runTempDir = Join-Path $tempRoot ("envcheck-{0}-{1}" -f $runId, (Get-Date -Format "yyyyMMddHHmmss"))
            New-Item -ItemType Directory -Path $runTempDir -Force | Out-Null

            $moduleManifest = Get-ChildItem -LiteralPath $moduleRoot -Filter *.psd1 -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($null -eq $moduleManifest) {
                $moduleManifest = Get-ChildItem -LiteralPath $moduleRoot -Filter *.psm1 -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            }
            if ($null -eq $moduleManifest) {
                throw "No module manifest (.psd1/.psm1) found under modulePath."
            }

            $importedModule = Import-Module -Name $moduleManifest.FullName -PassThru -Force -ErrorAction Stop
            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Environment checker module imported" -Data @{ moduleName = $importedModule.Name; moduleEntry = $moduleManifest.FullName }

            $candidateCommandNames = @(
                "Invoke-AzStackHciEnvironmentChecker",
                "Invoke-AzureStackHCIEnvironmentChecker",
                "Invoke-EnvironmentChecker",
                "Start-EnvironmentChecker",
                "Test-EnvironmentChecker"
            )

            $envcheckCommand = $null
            foreach ($commandName in $candidateCommandNames) {
                $candidate = Get-Command -Name $commandName -ErrorAction SilentlyContinue
                if ($null -ne $candidate) {
                    $envcheckCommand = $candidate
                    break
                }
            }

            if ($null -eq $envcheckCommand) {
                $moduleCandidateCommands = Get-Command -Module $importedModule.Name -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -match "Environment.*Check|Check.*Environment|Env.*Check" } |
                    Select-Object -First 1
                if ($null -ne $moduleCandidateCommands) {
                    $envcheckCommand = $moduleCandidateCommands
                }
            }

            if ($null -eq $envcheckCommand) {
                throw "No environment checker command could be discovered in the imported module."
            }

            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Executing environment checker command" -Data @{ commandName = $envcheckCommand.Name; additionalArgs = $effectiveAdditionalArgs; outputDir = $runTempDir }

            $rawOutput = @()
            Push-Location $runTempDir
            try {
                if ([string]::IsNullOrWhiteSpace($effectiveAdditionalArgs)) {
                    $rawOutput = & $envcheckCommand.Name *>&1
                }
                else {
                    $invocationString = "& `"$($envcheckCommand.Name)`" $effectiveAdditionalArgs"
                    $rawOutput = Invoke-Expression $invocationString *>&1
                }
            }
            finally {
                Pop-Location
            }

            $rawOutputTextPath = Join-Path $runTempDir "stdout-stderr.txt"
            $rawOutputJsonPath = Join-Path $runTempDir "raw-output.json"
            $summaryPath = Join-Path $runTempDir "summary.json"

            $outputText = @($rawOutput | ForEach-Object {
                    if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        [string]$_.ToString()
                    }
                    elseif ($_ -is [string]) {
                        [string]$_
                    }
                    else {
                        [string]($_ | Out-String).Trim()
                    }
                }) -join [Environment]::NewLine
            Set-Content -LiteralPath $rawOutputTextPath -Value $outputText -Encoding UTF8

            $normalizedOutput = @($rawOutput | ForEach-Object {
                    if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        [ordered]@{
                            recordType = "error"
                            message = [string]$_.Exception.Message
                            category = [string]$_.CategoryInfo.Category
                            fullyQualifiedErrorId = [string]$_.FullyQualifiedErrorId
                        }
                    }
                    elseif ($_ -is [string]) {
                        [ordered]@{
                            recordType = "text"
                            message = [string]$_
                        }
                    }
                    else {
                        $_
                    }
                })
            Set-Content -LiteralPath $rawOutputJsonPath -Value ($normalizedOutput | ConvertTo-Json -Depth 20) -Encoding UTF8

            $summary = Convert-EnvcheckOutputToSummary -OutputItems $rawOutput
            Set-Content -LiteralPath $summaryPath -Value ($summary | ConvertTo-Json -Depth 20) -Encoding UTF8

            $generatedFiles = Get-ChildItem -LiteralPath $runTempDir -Recurse -File
            foreach ($generatedFile in $generatedFiles) {
                $artifacts.Add((New-ArtifactMetadata -File $generatedFile -RootPath $runTempDir))
            }

            Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Environment checker execution complete" -Data @{ records = @($rawOutput).Count; artifacts = $artifacts.Count }

            $resultJson = [ordered]@{
                modulePath = $moduleRoot
                moduleEntry = $moduleManifest.FullName
                commandName = $envcheckCommand.Name
                additionalArgs = $effectiveAdditionalArgs
                outputDir = $runTempDir
                summary = $summary
            }
        }

        Add-TranscriptEvent -Transcript $transcript -Level "info" -Message "Posting run evidence" -Data @{ runId = $runId }
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
                    artifacts = $artifacts
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
