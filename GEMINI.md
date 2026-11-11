# Henosis Gaming Launcher — Architecture & Project Guide

Universal controller-first PC gaming hub running on Linux (CachyOS / KDE Wayland), merging modern Steam gaming with physical 3D console collectibles across 42 gaming platforms.

---

## 1. Core Rules & Guidelines

- **Controller-First Navigation:** Every screen must be 100% navigable with an Xbox gamepad (`D-Pad`, `A`, `B`, `X`, `Y`, `LB`, `RB`, `Guide`) with keyboard equivalents mapped in `input.ts`.
- **Zero-Deformation Media:** 3D physical collectibles (cases, cartridges, optical discs) must scale isotropically (`scale(...)`) to strictly preserve authentic physical aspect ratios.
- **Library Integrity:** Missing games are purged from the SQLite DB on startup/scan. Switch updates/DLCs are excluded automatically via Title ID (`!ends_with("000")`) and version tags (`[v65536]`).
- **Foreground Retention:** The launcher remains in the foreground until the emulator's graphical window renders or the Steam game process is active.

---

## 2. UI Paths & Architecture

All frontend source files reside in [`src/`](file:///home/hyrox/Documents/Code/Gamemode/src):

| Screen / Component | File Path | Purpose |
| :--- | :--- | :--- |
| **App Shell** | [`src/App.tsx`](file:///home/hyrox/Documents/Code/Gamemode/src/App.tsx) | Root shell, event listeners, test hook registration |
| **Main Menu (Home)** | [`src/views/HomeView.tsx`](file:///home/hyrox/Documents/Code/Gamemode/src/views/HomeView.tsx) | Full-height 3D Console Hero Carousel & maker tabs |
| **Platform Library** | [`src/views/PlatformView.tsx`](file:///home/hyrox/Documents/Code/Gamemode/src/views/PlatformView.tsx) | 3D Cover Flow Carousel, floor reflection, sleek HUD |
| **Game Details** | [`src/views/GameView.tsx`](file:///home/hyrox/Documents/Code/Gamemode/src/views/GameView.tsx) | Metadata, synopsis, per-game emulator options, playtime |
| **Settings** | [`src/views/SettingsView.tsx`](file:///home/hyrox/Documents/Code/Gamemode/src/views/SettingsView.tsx) | ROM folders, emulator detection, UI toggles, IGDB |
| **3D Collectibles** | [`src/components/Collectible.tsx`](file:///home/hyrox/Documents/Code/Gamemode/src/components/Collectible.tsx) | 3D cases (Switch, Wii U, PS3, PS2, Xbox), retro cartridges |
| **Dynamic Themes** | [`src/components/ConsoleEnvironment.tsx`](file:///home/hyrox/Documents/Code/Gamemode/src/components/ConsoleEnvironment.tsx) | Dynamic backgrounds (Wii U ribbons, Switch scarlet, PS indigo, Xbox green) |
| **Input Bus** | [`src/input.ts`](file:///home/hyrox/Documents/Code/Gamemode/src/input.ts) | Priority-stacked pad/key subscriber bus (`usePad`, `dispatch`) |
| **State Store** | [`src/store.ts`](file:///home/hyrox/Documents/Code/Gamemode/src/store.ts) | Zustand store managing navigation, platforms, games, modals |
| **Styles** | [`src/styles.css`](file:///home/hyrox/Documents/Code/Gamemode/src/styles.css) | 3D transforms, glass floor, animations, theme environments |

---

## 3. Core Mechanisms & Backend (`src-tauri/`)

- **Scanner & DB Engine ([`db.rs`](file:///home/hyrox/Documents/Code/Gamemode/src-tauri/src/db.rs), [`roms.rs`](file:///home/hyrox/Documents/Code/Gamemode/src-tauri/src/scanner/roms.rs)):**
  - Scans local directories for ROMs and Steam `librarycache` / `appmanifest_*.vdf`.
  - Filters out Switch updates and DLCs by Title ID ending, `[v65536]` tags, and keywords.
  - Automatically purges deleted/missing files (`missing = 0`).
- **Launcher & Session Lifecycle ([`launcher.rs`](file:///home/hyrox/Documents/Code/Gamemode/src-tauri/src/launcher.rs)):**
  - Spawns emulators with custom per-game command lines and temporary config overrides.
  - Keeps launcher focused until the game window actually renders (`wait_until_emulator_window_ready`).
  - Tracks playtime in SQLite and logs exit statuses.
- **Asset Protocol ([`tauri.conf.json`](file:///home/hyrox/Documents/Code/Gamemode/src-tauri/tauri.conf.json)):**
  - Configured with `scope: ["/**", "$HOME/**"]` to load local covers directly via `mediaSrc()`.
- **Xbox Guide Daemon ([`gamepad.rs`](file:///home/hyrox/Documents/Code/Gamemode/src-tauri/src/gamepad.rs)):**
  - `gilrs` background loop intercepts Guide button globally to summon window via KWin DBus.

---

## 4. Wayland MCP Server & Automation

The application contains an automation bridge and an MCP (Model Context Protocol) server for testing:

- **Bridge Server ([`test_bridge.rs`](file:///home/hyrox/Documents/Code/Gamemode/src-tauri/src/test_bridge.rs)):**
  - Embedded HTTP listener on `127.0.0.1:9998` inside the Tauri binary.
  - Dispatches simulated gamepad buttons (`POST /input`), evaluates JS (`POST /eval`), reports state (`GET /state`), and captures Wayland screenshots via KDE Spectacle (`POST /screenshot`).
- **MCP Server ([`mcp-server/index.js`](file:///home/hyrox/Documents/Code/Gamemode/mcp-server/index.js)):**
  - Registered globally in [`~/.gemini/config/mcp_config.json`](file:///home/hyrox/.gemini/config/mcp_config.json) under `henosis-wayland-tester`.
  - Tools available:
    - `henosis_status`: Health check on port 9998.
    - `henosis_get_state`: Live snapshot of active screen, platform, theme class, and 3D transforms.
    - `henosis_send_input`: Simulates pad buttons (`a`, `b`, `x`, `y`, `lb`, `rb`, `left`, `right`).
    - `henosis_navigate`: Direct navigation to any screen.
    - `henosis_eval_js`: Executes JS in WebKit context.
    - `henosis_capture_screenshot`: Captures a Wayland PNG via `spectacle`.
    - `henosis_run_all_tests`: Runs the 11-step automated feature test suite.
- **Run Tests Manually:**
  ```bash
  node mcp-server/test-runner.js
  ```
