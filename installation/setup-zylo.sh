#!/usr/bin/env bash
set -euo pipefail

# go to script dir
cd "$(dirname "$0")"

echo "==> Zylo setup (macOS/Linux)"

# 1) Install Ollama
if ! command -v ollama >/dev/null 2>&1; then
  echo "==> Installing Ollama..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew >/dev/null 2>&1; then
      brew install ollama
    else
      /bin/bash -c "$(curl -fsSL https://ollama.com/install.sh)"
    fi
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
else
  echo "==> Ollama already installed."
fi

# 2) Start Ollama in background
if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "==> Starting ollama serve (background)"
  nohup ollama serve >/dev/null 2>&1 &
  # wait for API
  for i in {1..60}; do
    if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

# 3) Pull model
echo "==> Pulling llama3.1:8b"
ollama pull "llama3.1:8b"

# 4) npm install + start (background)
if ! command -v npm >/dev/null 2>&1; then
  echo "Please install Node.js (https://nodejs.org/) and re-run" >&2
  exit 1
fi

echo "==> npm install"
npm install
echo "==> npm run start (background)"
nohup npm run start >/dev/null 2>&1 &

echo "✅ Done. Ollama up and Zylo started."
