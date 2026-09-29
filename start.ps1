$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
try { $health = Invoke-WebRequest -Uri 'http://127.0.0.1:8788/' -TimeoutSec 2 -ErrorAction Stop; $ready = $health.Content -match 'WORD GARDEN' } catch { $ready = $false }
if (-not $ready) {
    Start-Process -FilePath $nodePath -ArgumentList ('--use-system-ca "' + (Join-Path $appRoot 'server.js') + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $appRoot 'server.log') -RedirectStandardError (Join-Path $appRoot 'error.log')
    Start-Sleep -Seconds 2
}
Start-Process 'http://127.0.0.1:8788/app/?v=cloud-20260929a'
