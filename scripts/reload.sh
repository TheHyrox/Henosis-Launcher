#!/usr/bin/env bash
set -e

# Resolve repository root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

echo "=========================================="
echo " [Nexus] Building and Reloading Launcher  "
echo "=========================================="

echo "==> 1. Compiling production bundle (Tauri + Vite)..."
npx tauri build --no-bundle

echo "==> 2. Reloading systemd user daemon..."
systemctl --user daemon-reload

echo "==> 3. Restarting nexus.service..."
systemctl --user restart nexus.service

echo "=========================================="
echo " [Nexus] Successfully built and reloaded! "
echo "=========================================="
