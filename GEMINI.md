# Henosis Gaming Launcher — Architecture & Project Guide

Universal controller-first PC gaming hub running on Linux (CachyOS / KDE Wayland), merging modern Steam gaming with physical 3D console collectibles across 42 gaming platforms.

---

## 1. Core Rules & Guidelines

- **Build & Reload Workflow:** For every edit, **do not run only `npm run build`**. Always use **`npm run reload`** (`scripts/reload.sh`), which compiles the full production bundle (`npx tauri build --no-bundle`), runs `systemctl --user daemon-reload`, and restarts `henosis.service` so the live Wayland process reflects your changes.
- **Controller-First Navigation:** Every screen must be 100% navigable with an Xbox gamepad (`D-Pad`, `A`, `B`, `X`, `Y`, `LB`, `RB`, `LT`, `RT`, `RS`, `Start`, `Select`, `Guide`) with keyboard equivalents mapped in [`src/input.ts`](src/input.ts).
- **Zero-Deformation Media:** 3D physical collectibles (cases, cartridges, optical discs) must scale isotropically (`scale(...)`) to strictly preserve authentic physical aspect ratios.
- **Library Integrity:** Missing games are purged from the SQLite DB on startup/scan. Switch updates/DLCs are excluded automatically via Title ID (`!ends_with("000")`) and version tags (`[v65536]`).
- **Foreground Retention:** The launcher remains in the foreground until the emulator's graphical window renders or the Steam game process is active.

---

## 2. UI Paths & Architecture

All frontend source files reside in [`src/`](src/):

| Screen / Component | File Path | Purpose |
| :--- | :--- | :--- |
| **App Shell** | [`src/App.tsx`](src/App.tsx) | Root shell, Tauri event listeners, test hook registration (`__HENOSIS_*`) |
| **Main Menu (Home)** | [`src/views/HomeView.tsx`](src/views/HomeView.tsx) | 3D Console Hero Carousel, manufacturer tabs, global search (`Y`) |
| **Platform Library** | [`src/views/PlatformView.tsx`](src/views/PlatformView.tsx) | 3D Cover Flow & High-Density Grid views, Quick-Details slide-over drawer, sorting |
| **Game Details** | [`src/views/GameView.tsx`](src/views/GameView.tsx) | 4-tab Game Hub (`Overview`, `Emulator Config`, `Achievements`, `Logs`), metadata/RA matching |
| **Settings** | [`src/views/SettingsView.tsx`](src/views/SettingsView.tsx) | Sidebar settings: `Library`, `Emulators`, `Consoles & BIOS`, `System`, `Accounts` |
| **3D Cover Flow** | [`src/components/CoverFlow3D.tsx`](src/components/CoverFlow3D.tsx) | Three.js interactive 3D physical case & cartridge cover flow stage |
| **3D Collectibles** | [`src/components/Collectible.tsx`](src/components/Collectible.tsx) | 3D collectible cards & vector console silhouettes (`ConsoleHardwareSvg`) |
| **Dynamic Themes** | [`src/components/ConsoleEnvironment.tsx`](src/components/ConsoleEnvironment.tsx) | Dynamic backgrounds (Wii U ribbons, Switch scarlet, PS indigo XMB, Xbox green) |
| **Session UI** | [`src/components/SessionDock.tsx`](src/components/SessionDock.tsx) & [`src/components/SessionOverlayModal.tsx`](src/components/SessionOverlayModal.tsx) | Persistent active-session dock and `RS`/`F2` quick session overlay modal |
| **HUD & Modals** | [`src/components/TopBar.tsx`](src/components/TopBar.tsx), [`src/components/QuickMenuModal.tsx`](src/components/QuickMenuModal.tsx), [`src/components/OnScreenKeyboard.tsx`](src/components/OnScreenKeyboard.tsx), [`src/components/FileBrowserModal.tsx`](src/components/FileBrowserModal.tsx) | Bottom prompt bar, Guide quick menu, controller OSK, and file/folder picker |
| **Input Bus** | [`src/input.ts`](src/input.ts) | Priority-stacked pad/key bus (`usePad`, `dispatch`), hold-`X`/`B` arbitration, `controller-mode` |
| **State & IPC** | [`src/store.ts`](src/store.ts) & [`src/api.ts`](src/api.ts) | Zustand store, typed Tauri IPC commands, `mediaSrc()`, contrast/format helpers |
| **Styles** | [`src/styles.css`](src/styles.css) | 3D transforms, glass floor, theme environments, grid/drawer/modal layouts |

---

## 3. Core Mechanisms & Backend (`src-tauri/`)

- **Scanner & DB Engine ([`db.rs`](src-tauri/src/db.rs), [`roms.rs`](src-tauri/src/scanner/roms.rs), [`steam.rs`](src-tauri/src/scanner/steam.rs)):**
  - Scans local directories for ROMs and Steam `librarycache` / `appmanifest_*.vdf`.
  - Filters out Switch updates and DLCs by Title ID ending, `[v65536]` tags, and keywords.
  - Automatically purges deleted/missing files (`missing = 0`).
- **Launcher & Session Lifecycle ([`launcher.rs`](src-tauri/src/launcher.rs)):**
  - Spawns emulators with custom per-game command lines and temporary config overrides (with crash recovery via `restore-journal.json`).
  - Keeps launcher focused until the game window actually renders (`wait_until_emulator_window_ready`).
  - Tracks playtime in SQLite, emits `game-started` / `session-state` / `game-ended` events, and logs exit statuses.
- **Metadata & Artwork ([`metadata.rs`](src-tauri/src/metadata.rs)):**
  - Scrapes Steam Store API, Libretro Thumbnails CDN, and optional IGDB API; supports candidate search, artwork linking, and manual edits.
- **Achievements ([`retroachievements.rs`](src-tauri/src/retroachievements.rs), [`steam_achievements.rs`](src-tauri/src/steam_achievements.rs)):**
  - RetroAchievements credential/token login, MD5 & title matching, manual game search/link/unlink, hardcore mode, and live `ra-unlocked` notifications.
  - Steam achievements reader parsing local `UserGameStatsSchema_*.bin` / `UserGameStats_*.bin` VDF files plus global rarity percentages.
- **Emulators & External Links ([`emulators.rs`](src-tauri/src/emulators.rs), [`commands.rs`](src-tauri/src/commands.rs)):**
  - Auto-detects installed emulators, exposes capability-driven presets with upstream `url`s, and opens HTTP/HTTPS URLs via `open_external_url` (`xdg-open`).
- **Asset Protocol ([`tauri.conf.json`](src-tauri/tauri.conf.json)):**
  - Configured with `scope: ["/**", "$HOME/**"]` to load local covers directly via `mediaSrc()`.
- **Xbox Guide Daemon ([`gamepad.rs`](src-tauri/src/gamepad.rs), [`window.rs`](src-tauri/src/window.rs)):**
  - `gilrs` background loop tracks pad connection status and intercepts the Guide button globally to summon/focus the window via KWin DBus.

---

## 4. Wayland MCP Server & Automation

The application contains an automation bridge and an MCP (Model Context Protocol) server for testing:

- **Bridge Server ([`test_bridge.rs`](src-tauri/src/test_bridge.rs)):**
  - Embedded HTTP listener on `127.0.0.1:9998` inside the Tauri binary.
  - Dispatches simulated gamepad buttons (`POST /input`), navigates (`POST /navigate`), evaluates JS (`POST /eval`), reports state (`GET /state`, `POST /report_state`), checks health (`GET /health`, `GET /status`), and captures Wayland screenshots via KDE Spectacle (`POST /screenshot`).
- **MCP Server ([`mcp-server/index.js`](mcp-server/index.js)):**
  - Registered globally in `~/.gemini/config/mcp_config.json` under `henosis-wayland-tester`.
  - Tools available:
    - `henosis_status`: Health check on port 9998.
    - `henosis_get_state`: Live snapshot of active screen, platform, theme class, and 3D transforms.
    - `henosis_send_input`: Simulates pad buttons (`a`, `b`, `x`, `y`, `lb`, `rb`, `left`, `right`, `up`, `down`, `start`, `select`, `guide`).
    - `henosis_navigate`: Direct navigation to any screen.
    - `henosis_eval_js`: Executes JS in WebKit context.
    - `henosis_capture_screenshot`: Captures a Wayland PNG via `spectacle`.
    - `henosis_run_all_tests`: Runs the 11-step automated feature test suite.
- **Run Tests Manually:**
  ```bash
  node mcp-server/test-runner.js
  ```
