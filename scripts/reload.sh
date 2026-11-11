#!/usr/bin/env bash
set -e

# Resolve repository root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

echo "=========================================="
echo " [Nexus] Building and Reloading Launcher  "
echo "=========================================="

echo "==> 1. Compiling frontend assets (Vite)..."
npm run build

echo "==> 2. Compiling Rust release binary..."
cargo build --release --manifest-path src-tauri/Cargo.toml

echo "==> 3. Reloading systemd user daemon..."
systemctl --user daemon-reload

echo "==> 4. Restarting nexus.service..."
systemctl --user restart nexus.service

echo "=========================================="
echo " [Nexus] Successfully built and reloaded! "
echo "=========================================="
