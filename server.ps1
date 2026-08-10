$port = 8000
$prefix = "http://localhost:$port/"

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
                if ([string]::IsNullOrEmpty($newLog.ipAddress)) {
                    $newLog.ipAddress = $ip
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
                                $merged.($prop.Name) = $prop.Value
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
