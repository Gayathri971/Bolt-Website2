# PowerShell script to download the live Google Sheet as Excel and CSV
# and export local history logs daily after 11:00 PM.

# 1. Configured Google Sheet ID (Extract from download_excel.ps1 if available, otherwise fallback)
$googleSheetId = "1FQXzSzzRzuX3c0pwsVQzrjEJ8ri64OWaCzq4ZYRVq60"
$configPath = Join-Path $PSScriptRoot "download_excel.ps1"
if (Test-Path $configPath) {
    try {
        $configContent = Get-Content -Raw $configPath
        if ($configContent -match '\$googleSheetId\s*=\s*"([^"]+)"') {
            $googleSheetId = $Matches[1]
        }
    } catch {
        Write-Host "Could not read download_excel.ps1 for Google Sheet ID: $_"
    }
}

# 2. Paths
$outputDirectory = Join-Path $PSScriptRoot "documents\exports"
if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$dateString = (Get-Date).ToString("yyyy-MM-dd")
$excelPath = Join-Path $outputDirectory "login_history_$dateString.xlsx"
$csvPath = Join-Path $outputDirectory "login_history_$dateString.csv"

# 3. Trigger a local sync first if the local server is running
Write-Host "Checking if local server is running to trigger sync..."
try {
    $syncUrl = "http://localhost:8000/api/login-history"
    $response = Invoke-RestMethod -Uri $syncUrl -Method Get -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($response) {
        Write-Host "Local server synced successfully." -ForegroundColor Green
    }
} catch {
    Write-Host "Local server not running or sync skipped: $_" -ForegroundColor Yellow
}

# 4. Attempt Google Sheet export
$downloadSuccess = $false
if (-not [string]::IsNullOrEmpty($googleSheetId)) {
    Write-Host "Exporting live Google Sheet ($googleSheetId) as Excel and CSV..."
    try {
        $excelUrl = "https://docs.google.com/spreadsheets/d/$googleSheetId/export?format=xlsx"
        $csvUrl = "https://docs.google.com/spreadsheets/d/$googleSheetId/export?format=csv"
        
        # Download Excel
        Invoke-WebRequest -Uri $excelUrl -OutFile $excelPath -UserAgent "Mozilla/5.0" -TimeoutSec 15
        Write-Host "Saved Excel to: $excelPath" -ForegroundColor Green
        
        # Download CSV
        Invoke-WebRequest -Uri $csvUrl -OutFile $csvPath -UserAgent "Mozilla/5.0" -TimeoutSec 15
        Write-Host "Saved CSV to: $csvPath" -ForegroundColor Green
        
        $downloadSuccess = $true
    } catch {
        Write-Host "Google Sheet export failed: $_" -ForegroundColor Red
        Write-Host "Ensure the Google Sheet Link Sharing is set to 'Anyone with the link can view'." -ForegroundColor Yellow
    }
}

# 5. Fallback: If Google Sheets export fails or is offline, generate CSV from local JSON database
if (-not $downloadSuccess) {
    Write-Host "Falling back to generating CSV from local database..." -ForegroundColor Yellow
    $dbPath = Join-Path $PSScriptRoot "documents\login_history.json"
    if (Test-Path $dbPath) {
        try {
            $content = Get-Content -Raw $dbPath -ErrorAction SilentlyContinue
            if ($content) {
                $logs = $content | ConvertFrom-Json
                
                # Use the existing CSV generation logic
                $utf8BOM = New-Object System.Text.UTF8Encoding $true
                $historyHeaders = @('Username', 'Name', 'Login Date', 'Login Time', 'Logout Time', 'Duration (Seconds)', 'IP Address', 'Device', 'Browser', 'OS', 'Status', 'Session ID')
                $historyRows = @()
                
                function Escape-CsvValue ($val) {
                    if ($null -eq $val) { return "" }
                    $s = $val.ToString()
                    if ($s.Contains(",") -or $s.Contains('"') -or $s.Contains("`n") -or $s.Contains("`r")) {
                        return '"' + $s.Replace('"', '""') + '"'
                    }
                    return $s
                }

                if ($logs) {
                    foreach ($log in $logs) {
                        $duration = ""
                        if ($log.timestamp -and $log.logoutTimestamp) {
                            $duration = [Math]::Round(($log.logoutTimestamp - $log.timestamp) / 1000)
                        } elseif ($log.duration) {
                            $duration = $log.duration
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
                [System.IO.File]::WriteAllText($csvPath, $historyContent, $utf8BOM)
                Write-Host "Generated offline fallback CSV at: $csvPath" -ForegroundColor Green
            }
        } catch {
            Write-Host "Offline CSV generation failed: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "Local JSON database not found at: $dbPath" -ForegroundColor Red
    }
}
