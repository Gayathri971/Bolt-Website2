# PowerShell script to set up Windows Task Scheduler to run the daily export script automatically.
# This script should be run in an elevated (Run as Administrator) PowerShell console.

$scriptPath = Join-Path $PSScriptRoot "export_daily.ps1"
$taskName = "NOS_Daily_History_Export"
$triggerTime = "23:05" # 11:05 PM everyday

# Validate if the export script exists
if (-not (Test-Path $scriptPath)) {
    Write-Error "Could not find export_daily.ps1 at $scriptPath"
    return
}

$powershellPath = "powershell.exe"
$arguments = "-ExecutionPolicy Bypass -File `"$scriptPath`""

Write-Host "Registering Windows Task Scheduler task: $taskName..."
try {
    # Check if modern Register-ScheduledTask command is available
    if (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue) {
        $action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $PSScriptRoot
        $trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
        
        # Register the task under the current user context
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
        
        Write-Host "Successfully registered Task Scheduler task '$taskName'!" -ForegroundColor Green
        Write-Host "It is scheduled to run daily at $triggerTime." -ForegroundColor Green
        Write-Host "You can view, edit, or test run it in the Windows 'Task Scheduler' application." -ForegroundColor Cyan
    } else {
        # Fallback to legacy schtasks utility
        $cmd = "schtasks /create /tn `"$taskName`" /tr `"$powershellPath -ExecutionPolicy Bypass -File `"$scriptPath`"`" /sc daily /st $triggerTime /f"
        Invoke-Expression $cmd | Out-Null
        Write-Host "Successfully registered Task Scheduler task '$taskName' using schtasks!" -ForegroundColor Green
    }
} catch {
    Write-Host "Failed to register scheduled task: $_" -ForegroundColor Red
    Write-Host "Please ensure you run this script in an Elevated PowerShell (Run as Administrator) terminal." -ForegroundColor Yellow
}
