# Build + run the API server locally. Uses node directly (no pnpm on PATH needed).
# Node 24 --env-file loads artifacts/api-server/.env into the environment.
# Usage:  .\dev-api.ps1
$ErrorActionPreference = "Stop"

Push-Location "$PSScriptRoot\artifacts\api-server"
try {
  Write-Host "Building API server..." -ForegroundColor Cyan
  node ./build.mjs
  Write-Host "Starting API server on http://localhost:8080 ..." -ForegroundColor Cyan
  node --env-file=.env --enable-source-maps ./dist/index.mjs
} finally {
  Pop-Location
}
