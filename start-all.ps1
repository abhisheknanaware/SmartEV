# Starts every SmartEV service for local development, each in its own window:
#   Redis :6379, ML service :8000, Spring Boot backend :8080, React frontend :5180
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-all.ps1
$root = $PSScriptRoot

function Start-Service($title, $dir, $command) {
  Start-Process powershell -WorkingDirectory (Join-Path $root $dir) -ArgumentList @(
    '-NoExit', '-NoProfile', '-Command', "`$Host.UI.RawUI.WindowTitle = '$title'; $command"
  )
}

Start-Service 'SmartEV redis :6379'    'redis'      ".\redis-server.exe --port 6379 --bind 127.0.0.1"
Start-Service 'SmartEV ML :8000'       'ml-service' "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
Start-Service 'SmartEV backend :8080'  'backend'    "powershell -NoProfile -ExecutionPolicy Bypass -File .\run-local.ps1"
Start-Service 'SmartEV frontend :5180' 'frontend'   "npm run dev -- --port 5180 --strictPort"

Write-Host 'Starting... open http://localhost:5180 once the backend window shows "Started SmartEvApplication".'
