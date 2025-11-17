<#
  Zylo Bootstrapper (Windows)
  - Installs Ollama if missing
  - Starts Ollama minimized and waits for API
  - Pulls llama3.1:8b
  - npm install
  - npm run start (minimized)
#>

# --- Helpers ---
$ErrorActionPreference = 'Stop'
$projRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Wait-ForUrl($url, $seconds = 60) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { return $true }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  return $false
}

Write-Host "==> Zylo setup starting..." -ForegroundColor Cyan
Set-Location $projRoot

# --- 1) Ensure winget exists (for Ollama install) ---
if (-not (Test-Command winget)) {
  Write-Host "winget not found. Please install App Installer from Microsoft Store and re-run." -ForegroundColor Yellow
  Write-Host "Store link: https://www.microsoft.com/store/productId/9NBLGGH4NNS1"
  exit 1
}

# --- 2) Install Ollama if missing ---
if (-not (Test-Command ollama)) {
  Write-Host "==> Installing Ollama with winget..." -ForegroundColor Cyan
  winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
  if (-not (Test-Command ollama)) {
    Write-Host "Ollama installation did not complete or PATH not updated yet. Try opening a new terminal and re-run." -ForegroundColor Yellow
    exit 1
  }
} else {
  Write-Host "==> Ollama already installed." -ForegroundColor Green
}

# --- 3) Start Ollama daemon minimized (if not already listening) ---
$ollamaUrl = "http://127.0.0.1:11434/api/tags"
$ollamaUp = $false
try {
  $ollamaUp = Wait-ForUrl $ollamaUrl 1
} catch {}

if (-not $ollamaUp) {
  Write-Host "==> Starting ollama serve (minimized)..." -ForegroundColor Cyan
  # Launch minimized; keep its own console window
  Start-Process -WindowStyle Minimized -FilePath "ollama" -ArgumentList "serve"
  # Wait for it to come up
  if (-not (Wait-ForUrl $ollamaUrl 60)) {
    Write-Host "Ollama didn't respond on 11434 within 60s." -ForegroundColor Yellow
    Write-Host "Open a new terminal and run: ollama serve" -ForegroundColor Yellow
    exit 1
  }
} else {
  Write-Host "==> Ollama is already running." -ForegroundColor Green
}

# --- 4) Pull llama3.1:8b model (safe to repeat) ---
Write-Host "==> Pulling model: llama3.1:8b (this may take a while first time)..." -ForegroundColor Cyan
& ollama pull "llama3.1:8b"

# --- 5) npm install ---
if (-not (Test-Command npm)) {
  Write-Host "npm / Node.js not found. Install Node.js LTS and re-run: https://nodejs.org/" -ForegroundColor Yellow
  exit 1
}
Write-Host "==> Installing npm packages..." -ForegroundColor Cyan
npm install

# --- 6) Run the application minimized ---
Write-Host "==> Starting your app (npm run start) minimized..." -ForegroundColor Cyan
Start-Process -WindowStyle Minimized -FilePath "npm" -ArgumentList "run start" -WorkingDirectory $projRoot

Write-Host ""
Write-Host "✅ Done. Ollama is running and Zylo is launching minimized." -ForegroundColor Green
Write-Host "   If needed, model endpoint: $ollamaUrl"
