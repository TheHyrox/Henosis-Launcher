# Henosis Launcher

> **Universal controller-first PC gaming hub and 3D physical console collection for Linux.**  
> *Notice: Henosis Launcher is currently in active development and is built exclusively for Linux (CachyOS / KDE Wayland).*

---

![Linux Only](https://img.shields.io/badge/Platform-Linux%20Only-blue?style=for-the-badge&logo=linux)
![Status](https://img.shields.io/badge/Status-In%20Active%20Development-orange?style=for-the-badge)
![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Backend-Rust-dea584?style=for-the-badge&logo=rust)
![React](https://img.shields.io/badge/Frontend-React%2019%20+%20Vite-61dafb?style=for-the-badge&logo=react)
![Wayland](https://img.shields.io/badge/Display-KDE%20Wayland-5277C3?style=for-the-badge)

---

## 🌟 Overview

**Henosis Launcher** is a modern, controller-first PC gaming hub designed to be the central living-room and desktop interface for all your games. It seamlessly unifies modern **Steam PC games**, standalone executables, and physical retro collections across **42 gaming platforms** running through native emulators (RetroArch, Cemu, Ryujinx, RPCS3, PCSX2, Dolphin, Xenia, DuckStation, and more).

Instead of a flat digital list, Henosis recreates the nostalgic feeling of browsing physical game cases, optical discs, and molded retro cartridges in interactive 3D, elevated by dynamic console environments that transform your screen to match each platform's design aesthetic.

---

## ✨ Key Features

### 🎮 100% Controller-First Navigation
- Built from the ground up for the couch: complete navigation using standard Xbox gamepads (`D-Pad`, `A`, `B`, `X`, `Y`, `LB`, `RB`, `Guide`) with keyboard equivalents mapped.
- **Global Xbox Guide Daemon:** Pressing the Xbox Guide button summons the launcher window from anywhere on your desktop via a high-performance KWin DBus bridge on KDE Wayland.

### 🎨 Dynamic Console-Themed Environments
The background color palette, ambient lighting, and animated visuals adapt in real time to the selected console:
- **Nintendo Wii U:** Soft cyan and sky-blue atmospheric gradients with animated waving ribbons and floating network orbs.
- **Nintendo Switch / Switch 2:** Deep scarlet and crimson gradients with glowing neon waves, Joy-Con neon cyan/red edge accents, and radial pulses.
- **PlayStation (PSP / PS1 / PS2 / PS3 / PS4 / PS5):** Cool navy, deep indigo, and slate-blue themes with flowing XMB ribbons, glowing horizon lines, and particle dust.
- **Xbox 360 / Xbox:** Radiant emerald lighting, aurora sweeps, and sweeping curved energy blades echoing the Xbox 360 dashboard aesthetic.
- **GameCube, Dreamcast, Retro Nintendo & Steam:** Tailored retro ambient lighting (GameCube purple, Dreamcast orange spiral flare, Steam deep midnight blue).

### 📦 3D Physical Media & Cover Flow Showcase
- **Zero-Deformation Media:** 3D physical collectibles scale isotropically (`scale(...)`) to strictly preserve authentic physical aspect ratios. Discs remain circular, cartridges retain molded shell proportions, and DVD/keep cases match authentic Amaray/Blu-ray dimensions.
- **Authentic Materials:** Translucent Switch scarlet red, Wii U cyan keep cases, Xbox 360 neon emerald green with embossed top headers, PS3 clear Blu-ray cases with silver bands, PS2 black cases, and molded retro cartridges with finger grips, label recesses, and gold connector pins.
- **Full-Height 3D Cover Flow:** Center game is elevated and centered facing forward (`translateZ(170px) scale(1.42)`), while flanking titles angle inward (`rotateY(52deg)` / `rotateY(-52deg)`) with depth of field blur and glass floor reflections (`-webkit-box-reflect`).

### 🛡️ Library Integrity & Smart Scanning
- **Automatic DLC & Update Exclusion:** Automatically excludes Nintendo Switch updates (`[v65536]`, `[v131072]`) and DLCs (`!ends_with("000")`), ensuring only playable base games appear in the library.
- **Missing Games Purged:** Removed or moved ROM files are automatically deleted from the SQLite database (`missing = 0`) on every scan and launch.
- **Foreground Retention:** The launcher stays in the foreground until the emulator's graphical window actually begins rendering or Steam marks the game active.

### 🤖 Wayland Automation Bridge & MCP Server
- **Embedded Test Bridge (`127.0.0.1:9998`):** Native HTTP listener embedded in the Rust binary to dispatch gamepad input, query UI state, and evaluate JavaScript.
- **Model Context Protocol (MCP) Server:** Fully compliant JSON-RPC 2.0 stdio MCP server (`mcp-server/index.js`) providing tools for external agents and testing frameworks (`nexus_status`, `nexus_get_state`, `nexus_send_input`, `nexus_navigate`, `nexus_capture_screenshot`, `nexus_run_all_tests`).

---

## 🕹️ Supported Platforms (42 Systems)

| Manufacturer | Consoles & Handhelds Supported |
| :--- | :--- |
| **Valve / PC** | Steam, Standalone Linux PC Games |
| **Nintendo** | NES, SNES, Nintendo 64, GameCube, Wii, Wii U, Switch, Switch 2, Game Boy, Game Boy Color, Game Boy Advance, Nintendo DS, Nintendo 3DS, Pokémon Mini |
| **Sony** | PlayStation 1, PlayStation 2, PlayStation 3, PlayStation 4, PlayStation 5, PSP, PS Vita |
| **Sega** | Master System, Genesis / Mega Drive, Sega CD, Sega 32X, Saturn, Dreamcast, Game Gear |
| **Microsoft** | Original Xbox, Xbox 360 |
| **Retro & Other** | Neo Geo, Neo Geo Pocket, Atari 2600, Atari 7800, Atari Lynx, WonderSwan, PC Engine / TurboGrafx-16, MSX |

---

## 🖥️ System Requirements

> [!IMPORTANT]
> **Henosis Launcher currently targets Linux only.** Testing and primary development are performed on **CachyOS / Arch Linux with KDE Plasma Wayland**.

- **Operating System:** Linux (Arch, CachyOS, Fedora, Ubuntu 24.04+, or other modern distros)
- **Display Server:** Wayland (recommended) or X11
- **Gamepad:** Xbox Wireless / USB Controller (or any gamepad recognized by `gilrs` / Linux evdev)
- **Build Tools:**
  - `rustc` and `cargo` (Rust 1.78+)
  - `node` (v18+) and `npm`
  - `webkit2gtk-4.1` system libraries
  - `spectacle` (optional, used by test bridge for Wayland screenshots)
  - `qdbus6` / `qdbus` (optional, for KWin focus management)

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/hyrox/Gamemode.git henosis-launcher
cd henosis-launcher

# Install frontend dependencies
npm install
```

### 2. Run in Development Mode
```bash
# Starts the Vite HMR dev server and Tauri application
npm run tauri dev
```

### 3. Build Production Binary
```bash
# Builds optimized standalone Linux binary (AppImage, deb, or rpm)
npm run tauri build
```
The compiled binary will be placed in `src-tauri/target/release/henosis-launcher`.

---

## 🧪 Automated Testing & MCP

Henosis includes an automated feature test suite connecting directly to the running Wayland window:

```bash
# Run the automated 11-step feature validation suite
node mcp-server/test-runner.js
```

### Registered MCP Server
The server is configured in `~/.gemini/config/mcp_config.json` under `henosis-wayland-tester`:
```json
{
  "mcpServers": {
    "henosis-wayland-tester": {
      "command": "node",
      "args": ["/absolute/path/to/henosis-launcher/mcp-server/index.js"]
    }
  }
}
```

---

## 📁 Project Architecture

```
├── GEMINI.md                    # Architecture rules & agent reference guide
├── README.md                    # Project overview & documentation
├── package.json                 # Frontend package manifest
├── index.html                   # WebKit entry point
├── src/                         # React 19 Frontend
│   ├── App.tsx                  # App root & test bridge hooks
│   ├── api.ts                   # Tauri IPC commands & types
│   ├── input.ts                 # Priority controller input bus
│   ├── store.ts                 # Zustand application state
│   ├── styles.css               # 3D transforms, glass reflections & themes
│   ├── components/
│   │   ├── Collectible.tsx       # 3D physical cases & retro cartridges
│   │   ├── ConsoleEnvironment.tsx# Dynamic console themes (Wii U, Switch, PS, Xbox)
│   │   ├── TopBar.tsx           # Status bar & controller button legends
│   │   ├── QuickMenuModal.tsx   # Xbox Guide quick menu
│   │   └── OnScreenKeyboard.tsx # Gamepad search keyboard
│   └── views/
│       ├── HomeView.tsx         # Full-height 3D Console Carousel stage
│       ├── PlatformView.tsx     # 3D Cover Flow Carousel & HUD
│       ├── GameView.tsx         # Game details, metadata & emulator configs
│       └── SettingsView.tsx     # ROM directories & emulator detection
├── src-tauri/                   # Rust Backend
│   ├── Cargo.toml               # Rust package & dependencies
│   ├── tauri.conf.json          # Tauri v2 configuration & asset protocols
│   └── src/
│       ├── lib.rs               # Backend setup & command routing
│       ├── db.rs                # SQLite library engine & missing file purge
│       ├── launcher.rs          # Process spawn & foreground retention
│       ├── gamepad.rs           # Background gilrs Xbox Guide daemon
│       ├── test_bridge.rs       # Embedded HTTP test bridge (port 9998)
│       ├── window.rs            # KDE Wayland KWin focus management
│       └── scanner/
│           ├── roms.rs          # ROM scanning & Switch update filtering
│           └── steam.rs         # Steam VDF & librarycache parser
└── mcp-server/                  # Model Context Protocol Server & Tests
    ├── index.js                 # JSON-RPC 2.0 stdio MCP server
    ├── package.json             # MCP server manifest
    └── test-runner.js           # CLI automated feature test runner
```

---

## 📄 License

Henosis Launcher is released under the **MIT License**.
Games, artwork, and emulators belong to their respective copyright holders. Henosis Launcher does not distribute ROMs or proprietary emulator files.
