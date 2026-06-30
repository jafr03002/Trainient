# Expose the local frontend (port 24301) on a public HTTPS URL for mobile testing.
# Requires the dev servers to be running first (.\dev-api.ps1 and .\dev-web.ps1).
# Prints a https://<random>.trycloudflare.com URL; press Ctrl+C to stop.
$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
  Write-Host "cloudflared not found on PATH. Open a fresh terminal, or install with:" -ForegroundColor Yellow
  Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting tunnel to http://localhost:24301 ..." -ForegroundColor Cyan
Write-Host "(make sure dev-api.ps1 and dev-web.ps1 are running)" -ForegroundColor DarkGray
& $cf tunnel --url http://localhost:24301
