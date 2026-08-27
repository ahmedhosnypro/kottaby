# PowerShell script to kill processes using a specific port

# Get port from command line argument or prompt
if ($args.Count -gt 0) {
    $port = $args[0]
    Write-Host "Targeting port: $port"
} else {
    $port = Read-Host "Enter the port number to kill"
}

# Find all processes using the given port number
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($connections) {
    $found = $false
    foreach ($connection in $connections) {
        $processId = $connection.OwningProcess
        $processName = (Get-Process -Id $processId -ErrorAction SilentlyContinue).ProcessName
        
        Write-Host "Killing process '$processName' with PID $processId that is using port $port..."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        $found = $true
    }
    
    if ($found) {
        Write-Host "All processes using port $port have been killed." -ForegroundColor Green
    }
} else {
    Write-Host "No processes found using port $port." -ForegroundColor Yellow
}

# Pause for user to see the output (only if run interactively)
if ($args.Count -eq 0) {
    Read-Host "Press Enter to continue"
}
