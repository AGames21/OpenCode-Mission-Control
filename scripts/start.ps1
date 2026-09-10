# One-command launcher: `powershell -ExecutionPolicy Bypass -File scripts/start.ps1`
# Starts opencode serve + vite dev (only if not already running) and opens the dashboard.
$ErrorActionPreference = 'SilentlyContinue'

function Test-Port($Port) {
  foreach ($h in @('127.0.0.1', '::1')) {
    $c = New-Object Net.Sockets.TcpClient
    try {
      $iar = $c.BeginConnect($h, $Port, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(800) -and $c.Connected) { return $true }
    } finally { $c.Close() }
  }
  return $false
}

$exe = "$env:APPDATA\npm\node_modules\opencode-ai\bin\opencode.exe"
if (-not (Test-Port 4096)) {
  Write-Output '[mc] starting opencode serve on :4096 ...'
  Start-Process -FilePath $exe -ArgumentList 'serve --port 4096 --hostname 127.0.0.1' -WindowStyle Hidden
} else { Write-Output '[mc] :4096 already serving' }

Set-Location $PSScriptRoot\..
if (-not (Test-Port 5199)) {
  Write-Output '[mc] starting vite dev on :5199 ...'
  Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run dev -- --port 5199 --strictPort --host 127.0.0.1' -WindowStyle Hidden -WorkingDirectory (Get-Location)
} else { Write-Output '[mc] :5199 already serving' }

for ($i = 0; $i -lt 30 -and -not (Test-Port 5199); $i++) { Start-Sleep -Seconds 1 }
if (Test-Port 5199) {
  Write-Output '[mc] opening http://localhost:5199'
  Start-Process 'http://localhost:5199/'
} else { Write-Output '[mc] ERROR: dev server did not come up on :5199'; exit 1 }
