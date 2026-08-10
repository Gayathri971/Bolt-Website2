$port = 8000
$prefix = "http://localhost:$port/"

function Format-Duration ($sec) {
    if (-not $sec -or $sec -lt 0) { return "0s" }
    $hrs = [Math]::Floor($sec / 3600)
    $mins = [Math]::Floor(($sec % 3600) / 60)
    $secs = $sec % 60
    
    $parts = @()
    if ($hrs -gt 0) { $parts += "$hrs" + "h" }
    if ($mins -gt 0) { $parts += "$mins" + "m" }
    if ($secs -gt 0 -or $parts.Length -eq 0) { $parts += "$secs" + "s" }
    return $parts -join " "
}

function Escape-CsvValue ($val) {
    if ($null -eq $val) { return "" }
    $s = $val.ToString()
    if ($s.Contains(",") -or $s.Contains('"') -or $s.Contains("`n") -or $s.Contains("`r")) {
        return '"' + $s.Replace('"', '""') + '"'
    }
    return $s
}

function Write-CsvLogs ($logs) {
    try {
        $dbDir = Join-Path $PSScriptRoot "documents"
        if (-not (Test-Path $dbDir)) { [System.IO.Directory]::CreateDirectory($dbDir) | Out-Null }

        $utf8BOM = New-Object System.Text.UTF8Encoding $true

        # 1. Raw Login History CSV
        $historyPath = Join-Path $dbDir "login_history.csv"
        $historyHeaders = @('Username', 'Name', 'Login Date', 'Login Time', 'Logout Time', 'Duration (Seconds)', 'IP Address', 'Device', 'Browser', 'OS', 'Status', 'Session ID')
        $historyRows = @()
        
        if ($logs) {
            foreach ($log in $logs) {
                $duration = ""
                if ($log.timestamp -and $log.logoutTimestamp) {
                    $duration = [Math]::Round(($log.logoutTimestamp - $log.timestamp) / 1000)
                } elseif ($log.duration) {
                    $duration = $log.duration
                } elseif ($log.logoutTime -and $log.timestamp) {
                    try {
                        $logoutDate = [DateTime]::Parse($log.logoutTime)
                        $epoch = New-Object DateTime 1970, 1, 1, 0, 0, 0, ([DateTimeKind]::Utc)
                        $logoutMs = [Math]::Round(($logoutDate.ToUniversalTime() - $epoch).TotalMilliseconds)
                        $diff = $logoutMs - $log.timestamp
                        if ($diff -gt 0) {
                            $duration = [Math]::Round($diff / 1000)
                        }
                    } catch {}
                }
                
                $rowVals = @(
                    $log.username,
                    $log.name,
                    $log.loginDate,
                    $log.loginTime,
                    $log.logoutTime,
                    $duration,
                    $log.ipAddress,
                    $log.device,
                    $log.browser,
                    $log.os,
                    $log.status,
                    $log.sessionId
                )
                $escaped = @()
                foreach ($val in $rowVals) { $escaped += Escape-CsvValue $val }
                $historyRows += $escaped -join ","
            }
        }
        
        $historyContent = @($historyHeaders -join ",") + $historyRows -join "`r`n"
        [System.IO.File]::WriteAllText($historyPath, $historyContent, $utf8BOM)

        # 2. Metrics CSV
        $metricsPath = Join-Path $dbDir "login_metrics.csv"
        $userMetrics = @{}
        $nowMs = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
        
        if ($logs) {
            foreach ($log in $logs) {
                $uName = $log.username
                if ([string]::IsNullOrEmpty($uName)) { continue }
                $key = $uName.ToLower()
                
                if (-not $userMetrics.ContainsKey($key)) {
                    $displayName = $log.name
                    if ([string]::IsNullOrEmpty($displayName)) { $displayName = $log.username }
                    $userMetrics[$key] = @{
                        username = $log.username
                        name = $displayName
                        visits = 0
                        totalDuration = 0
                        lastDuration = $null
                        lastDurationLogTime = 0
                        lastLoginTime = $null
                        isActive = $false
                    }
                }
                
                if ($log.status -eq "Success") {
                    $userMetrics[$key].visits += 1
                    $loginTimeMs = $log.timestamp
                    if ($null -eq $loginTimeMs) { $loginTimeMs = 0 }
                    
                    if ($null -eq $userMetrics[$key].lastLoginTime -or $loginTimeMs -gt $userMetrics[$key].lastLoginTime.timestamp) {
                        $userMetrics[$key].lastLoginTime = @{
                            str = "$($log.loginDate) $($log.loginTime)"
                            timestamp = $loginTimeMs
                        }
                    }
                    
                    if ([string]::IsNullOrEmpty($log.logoutTime)) {
                        if (($nowMs - $loginTimeMs) -lt (24 * 60 * 60 * 1000)) {
                            $userMetrics[$key].isActive = $true
                        }
                    }
                    
                    $duration = 0
                    if ($log.logoutTimestamp -and $log.timestamp) {
                        $duration = [Math]::Round(($log.logoutTimestamp - $log.timestamp) / 1000)
                    } elseif ($log.duration) {
                        $duration = $log.duration
                    } elseif ($log.logoutTime -and $log.timestamp) {
                        try {
                            $logoutDate = [DateTime]::Parse($log.logoutTime)
                            $epoch = New-Object DateTime 1970, 1, 1, 0, 0, 0, ([DateTimeKind]::Utc)
                            $logoutMs = [Math]::Round(($logoutDate.ToUniversalTime() - $epoch).TotalMilliseconds)
                            $diff = $logoutMs - $log.timestamp
                            if ($diff -gt 0) {
                                $duration = [Math]::Round($diff / 1000)
                            }
                        } catch {}
                    }
                    
                    if ($duration -gt 0) {
                        $userMetrics[$key].totalDuration += $duration
                        if ($loginTimeMs -gt $userMetrics[$key].lastDurationLogTime) {
                            $userMetrics[$key].lastDuration = $duration
                            $userMetrics[$key].lastDurationLogTime = $loginTimeMs
                        }
                    }
                }
            }
        }
        
        $metricsHeaders = @('Username', 'Name', 'Number of Visits', 'Total Session Duration (Seconds)', 'Total Session Duration (Formatted)', 'Last Session Duration (Seconds)', 'Last Session Duration (Formatted)', 'Last Login Date/Time', 'Is Active')
        $metricsRows = @()
        
        foreach ($key in $userMetrics.Keys) {
            $m = $userMetrics[$key]
            $totalDurForm = Format-Duration $m.totalDuration
            $lastDurForm = "N/A"
            $lastDurVal = ""
            if ($null -ne $m.lastDuration) {
                $lastDurForm = Format-Duration $m.lastDuration
                $lastDurVal = $m.lastDuration
            }
            $lastLoginStr = ""
            if ($null -ne $m.lastLoginTime) {
                $lastLoginStr = $m.lastLoginTime.str
            }
            $isActiveStr = "No"
            if ($m.isActive) { $isActiveStr = "Yes" }
            
            $rowVals = @(
                $m.username,
                $m.name,
                $m.visits,
                $m.totalDuration,
                $totalDurForm,
                $lastDurVal,
                $lastDurForm,
                $lastLoginStr,
                $isActiveStr
            )
            $escaped = @()
            foreach ($val in $rowVals) { $escaped += Escape-CsvValue $val }
            $metricsRows += $escaped -join ","
        }
        
        $metricsContent = @($metricsHeaders -join ",") + $metricsRows -join "`r`n"
        [System.IO.File]::WriteAllText($metricsPath, $metricsContent, $utf8BOM)
        
    } catch {
        Write-Host "Failed to write CSV logs: $_"
    }
}


$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "  🚀 BOLT Localhost Server Running!" -ForegroundColor Green
    Write-Host "  🌐 URL: http://localhost:$port/index.html" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Green

    Start-Process "http://localhost:$port/index.html"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relativePath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }

        # Check for API
        if ($relativePath.StartsWith("api/login-history")) {
            $dbPath = Join-Path $PSScriptRoot "documents\login_history.json"
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
            $response.ContentType = "application/json"
            
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            
            if ($request.HttpMethod -eq "GET") {
                $logs = @()
                if (Test-Path $dbPath) {
                    try {
                        $content = Get-Content -Raw $dbPath -ErrorAction SilentlyContinue
                        if ($content) {
                            $logs = $content | ConvertFrom-Json
                        }
                    } catch {}
                }
                
                $thirtyDaysAgo = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() - (30 * 24 * 60 * 60 * 1000)
                $filteredLogs = @()
                if ($logs) {
                    foreach ($log in $logs) {
                        if ($log.timestamp -ge $thirtyDaysAgo) {
                            $filteredLogs += $log
                        }
                    }
                }
                
                $json = $filteredLogs | ConvertTo-Json -Depth 5 -Compress
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
            elseif ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                try {
                    $newLog = $body | ConvertFrom-Json
                } catch {
                    $response.StatusCode = 400
                    $response.Close()
                    continue
                }
                
                $ip = $request.Headers["X-Forwarded-For"]
                if ([string]::IsNullOrEmpty($ip)) {
                    $ip = $request.RemoteEndPoint.Address.ToString()
                }
                try {
                    if ([string]::IsNullOrEmpty($newLog.ipAddress)) {
                        $newLog.ipAddress = $ip
                    }
                } catch {
                    try {
                        $newLog | Add-Member -NotePropertyName "ipAddress" -NotePropertyValue $ip
                    } catch {}
                }
                
                $logs = @()
                if (Test-Path $dbPath) {
                    try {
                        $content = Get-Content -Raw $dbPath -ErrorAction SilentlyContinue
                        if ($content) {
                            $logs = $content | ConvertFrom-Json
                        }
                    } catch {}
                }
                
                # Update existing or append new
                $updatedLogs = @()
                $found = $false
                if ($logs) {
                    foreach ($log in $logs) {
                        if ($log.sessionId -eq $newLog.sessionId -and -not [string]::IsNullOrEmpty($newLog.sessionId)) {
                            # Update existing log
                            $merged = $log
                            foreach ($prop in $newLog.psobject.Properties) {
                                try {
                                    $merged.($prop.Name) = $prop.Value
                                } catch {
                                    try {
                                        $merged | Add-Member -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
                                    } catch {}
                                }
                            }
                            if ($merged.timestamp -and $merged.logoutTimestamp) {
                                $durVal = [Math]::Round(($merged.logoutTimestamp - $merged.timestamp) / 1000)
                                try {
                                    $merged.duration = $durVal
                                } catch {
                                    try {
                                        $merged | Add-Member -NotePropertyName "duration" -NotePropertyValue $durVal -Force
                                    } catch {}
                                }
                            }
                            $updatedLogs += $merged
                            $found = $true
                        } else {
                            $updatedLogs += $log
                        }
                    }
                }
                if (-not $found) {
                    $updatedLogs = @($newLog) + $updatedLogs
                }
                
                $thirtyDaysAgo = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() - (30 * 24 * 60 * 60 * 1000)
                $filteredLogs = @()
                foreach ($log in $updatedLogs) {
                    if ($log.timestamp -ge $thirtyDaysAgo) {
                        $filteredLogs += $log
                    }
                }
                
                # Ensure directory exists
                $dir = [System.IO.Path]::GetDirectoryName($dbPath)
                if (-not (Test-Path $dir)) { [System.IO.Directory]::CreateDirectory($dir) | Out-Null }
                
                $json = $filteredLogs | ConvertTo-Json -Depth 5
                [System.IO.File]::WriteAllText($dbPath, $json)
                Write-CsvLogs $filteredLogs
                
                $respJson = '{"success":true}'
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($respJson)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
            $response.Close()
            continue
        }

        $localPath = Join-Path $PSScriptRoot $relativePath

        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            switch ($ext) {
                ".html" { $response.ContentType = "text/html" }
                ".css"  { $response.ContentType = "text/css" }
                ".js"   { $response.ContentType = "text/javascript" }
                ".png"  { $response.ContentType = "image/png" }
                ".jpg"  { $response.ContentType = "image/jpeg" }
                ".gif"  { $response.ContentType = "image/gif" }
                ".mp4"  { $response.ContentType = "video/mp4" }
                ".pdf"  { $response.ContentType = "application/pdf" }
                default { $response.ContentType = "application/octet-stream" }
            }

            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("<h1>404 Not Found</h1>")
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
