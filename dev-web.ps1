# Run the Vite frontend locally. Uses node directly (no pnpm on PATH needed).
# --env-file puts PORT/BASE_PATH/VITE_* into the environment that vite.config.ts reads.
# Usage:  .\dev-web.ps1
$ErrorActionPreference = "Stop"

Push-Location "$PSScriptRoot\artifacts\traintent"
try {
  Write-Host "Starting frontend on http://localhost:24301 ..." -ForegroundColor Cyan
  node --env-file=.env ./node_modules/vite/bin/vite.js --config vite.config.ts --host 0.0.0.0
} finally {
  Pop-Location
}
