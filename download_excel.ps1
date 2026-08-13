# PowerShell script to download the live Google Sheet as a Microsoft Excel (.xlsx) file

# Configured Google Sheet ID (from the Google Sheet URL)
$googleSheetId = "1FQXzSzzRzuX3c0pwsVQzrjEJ8ri64OWaCzq4ZYRVq60"

$url = "https://docs.google.com/spreadsheets/d/$googleSheetId/export?format=xlsx"
$outputDirectory = Join-Path $PSScriptRoot "documents"
$outputPath = Join-Path $outputDirectory "login_history_live.xlsx"

# Ensure documents directory exists
if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Write-Host "Downloading live Google Sheet as Excel..."
try {
    # Perform download (Google Sheets must be set to 'Anyone with the link can view')
    Invoke-WebRequest -Uri $url -OutFile $outputPath -UserAgent "Mozilla/5.0"
    Write-Host "Success! The Excel file has been saved to:" -ForegroundColor Green
    Write-Host $outputPath -ForegroundColor Cyan
} catch {
    Write-Host "Error downloading sheet: $_" -ForegroundColor Red
    Write-Host "Ensure the Google Sheet Link Sharing is set to 'Anyone with the link can view'." -ForegroundColor Yellow
}

pause
