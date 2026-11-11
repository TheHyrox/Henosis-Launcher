// Settings & Emulator Management View:
// 1. Library & ROM Directories (Steam toggle, ROM folders, manual game adder, rescan)
// 2. Emulator Management (auto-detect, custom search dirs, add/edit/delete emulator profiles)
// 3. Per-Console Defaults & BIOS Paths (default emulator + BIOS directory per platform)
// 4. System & Controller (Xbox Guide button summon, autostart, hide on launch, UI sounds)

import React, { useEffect, useState } from "react";
import { api, Emulator, IgdbCredentials, PlatformConfig, ScanDir } from "../api";
import { BottomPromptBar } from "../components/TopBar";
import { usePad } from "../input";
import { useStore } from "../store";

const SECTIONS = [
  { id: "directories", label: "Library & ROM Folders", icon: "📁" },
  { id: "emulators", label: "Emulators", icon: "🕹" },
  { id: "platforms", label: "Console Defaults & BIOS", icon: "🎛" },
  { id: "system", label: "System & Controller", icon: "⚙" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export const SettingsView: React.FC<{ initialSection?: SectionId }> = ({
  initialSection = "directories",
}) => {
  const {
    platformDefs,
    emulators,
    presets,
    appSettings,
    updateAppSettings,
    refreshOverview,
    triggerScan,
    scanning,
    back,
    openFileBrowser,
    openKeyboard,
    pushToast,
    setQuickMenu,
  } = useStore();

  const [secIdx, setSecIdx] = useState(() =>
    Math.max(0, SECTIONS.findIndex((s) => s.id === initialSection))
  );
  const [scanDirs, setScanDirs] = useState<ScanDir[]>([]);
  const [emuDirs, setEmuDirs] = useState<string[]>([]);
  const [platConfigs, setPlatConfigs] = useState<Record<string, PlatformConfig>>({});
  const [editingEmu, setEditingEmu] = useState<Emulator | null>(null);
  const [igdb, setIgdb] = useState<IgdbCredentials>({ clientId: "", clientSecret: "" });

  const section = SECTIONS[secIdx].id;

  const loadAll = async () => {
    const [dirs, edirs, creds] = await Promise.all([
      api.getScanDirs(),
      api.getEmulatorDirs(),
      api.getIgdbCredentials(),
    ]);
    setScanDirs(dirs);
    setEmuDirs(edirs);
    setIgdb(creds);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (section === "platforms") {
      Promise.all(
        platformDefs
          .filter((p) => p.id !== "steam" && p.id !== "pc")
          .map((p) => api.getPlatformConfig(p.id))
      ).then((cfgs) => {
        const map: Record<string, PlatformConfig> = {};
        cfgs.forEach((c) => {
          map[c.platform] = c;
        });
        setPlatConfigs(map);
      });
    }
  }, [section, platformDefs]);

  const handleAddScanDir = () => {
    openFileBrowser({
      title: "Select ROM / Games Directory to Scan",
      pickMode: "dir",
      onPick: async (path) => {
        try {
          await api.saveScanDir({ path, platform: null, enabled: true });
          await loadAll();
          pushToast(`Added folder: ${path}`, "success");
          triggerScan();
        } catch (e) {
          pushToast(String(e), "error");
        }
      },
    });
  };

  const handleRemoveScanDir = async (path: string) => {
    await api.removeScanDir(path);
    await loadAll();
    pushToast("Directory removed", "info");
  };

  const handleDetectEmulators = async () => {
    try {
      const added = await api.detectEmulators();
      await refreshOverview();
      pushToast(
        added.length > 0
          ? `Detected ${added.length} new emulator(s): ${added.map((a) => a.name).join(", ")}`
          : "All detected emulators are already configured",
        "success"
      );
    } catch (e) {
      pushToast(String(e), "error");
    }
  };

  const handleAddEmulatorDir = () => {
    openFileBrowser({
      title: "Select Folder Containing Emulator AppImages / Binaries",
      pickMode: "dir",
      onPick: async (path) => {
        const next = Array.from(new Set([...emuDirs, path]));
        await api.setEmulatorDirs(next);
        setEmuDirs(next);
        await handleDetectEmulators();
      },
    });
  };

  const startNewEmulator = (presetId = "custom") => {
    const p = presets.find((x) => x.id === presetId) || presets[presets.length - 1];
    setEditingEmu({
      id: "",
      preset: p?.id || "custom",
      name: p?.name || "Custom Emulator",
      exec: "",
      kind: "binary",
      version: null,
      platforms: p ? [...p.platforms] : ["snes"],
      args: p?.args || "{rom}",
      workdir: null,
      coresDir: null,
    });
  };

  const handleSaveEmulator = async () => {
    if (!editingEmu) return;
    try {
      await api.saveEmulator(editingEmu);
      setEditingEmu(null);
      await refreshOverview();
      pushToast("Emulator profile saved", "success");
    } catch (e) {
      pushToast(String(e), "error");
    }
  };

  const handleDeleteEmulator = async (id: string) => {
    await api.deleteEmulator(id);
    await refreshOverview();
    pushToast("Emulator removed", "info");
  };

  const updatePlatConfig = async (platformId: string, patch: Partial<PlatformConfig>) => {
    const cur = platConfigs[platformId] || {
      platform: platformId,
      defaultEmulator: null,
      biosDir: null,
      settings: {},
    };
    const next: PlatformConfig = { ...cur, ...patch };
    setPlatConfigs((m) => ({ ...m, [platformId]: next }));
    await api.savePlatformConfig(next);
    await refreshOverview();
  };

  usePad((btn) => {
    if (editingEmu) {
      if (btn === "b") {
        setEditingEmu(null);
        return true;
      }
      return false;
    }
    if (btn === "b") {
      back();
      return true;
    }
    if (btn === "lb") {
      setSecIdx((i) => (i - 1 + SECTIONS.length) % SECTIONS.length);
      return true;
    }
    if (btn === "rb") {
      setSecIdx((i) => (i + 1) % SECTIONS.length);
      return true;
    }
    if (btn === "x") {
      if (section === "directories") handleAddScanDir();
      else if (section === "emulators") handleDetectEmulators();
      return true;
    }
    if (btn === "start") {
      setQuickMenu(true);
      return true;
    }
    return false;
  }, 0);

  const consolePlatforms = platformDefs.filter((p) => p.id !== "steam" && p.id !== "pc");

  return (
    <div className="settings-view">
      <div className="ambient-backdrop" />

      <header className="settings-header">
        <button className="btn-back" onClick={back}>
          ← Back (B)
        </button>

        <div className="settings-tabs">
          <span className="pill-hint">LB</span>
          {SECTIONS.map((s, idx) => (
            <button
              key={s.id}
              className={`settings-tab ${idx === secIdx ? "active" : ""}`}
              onClick={() => setSecIdx(idx)}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
          <span className="pill-hint">RB</span>
        </div>
      </header>

      <main className="settings-body">
        {/* ── 1. Library & ROM Folders ─────────────────────────────────────── */}
        {section === "directories" && (
          <div className="settings-section">
            <div className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h3>Steam Library Integration</h3>
                  <p>
                    Automatically detects installed Steam games from{" "}
                    <code>~/.local/share/Steam/steamapps/libraryfolders.vdf</code> and loads local artwork from Steam's cache.
                  </p>
                </div>
                <button
                  className={`toggle-pill ${appSettings.steamEnabled ? "on" : "off"}`}
                  onClick={() =>
                    updateAppSettings({
                      ...appSettings,
                      steamEnabled: !appSettings.steamEnabled,
                    })
                  }
                >
                  {appSettings.steamEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h3>ROM & Game Directories ({scanDirs.length})</h3>
                  <p>
                    Add parent folders (e.g. <code>~/ROMs</code> containing <code>nes/</code>,{" "}
                    <code>snes/</code>, <code>ps2/</code>, <code>switch/</code>) or bind a folder directly to a specific console.
                  </p>
                </div>
                <div className="head-actions">
                  <button className="btn-primary" onClick={handleAddScanDir}>
                    + Add ROM Directory (X)
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => triggerScan()}
                    disabled={scanning}
                  >
                    ↻ Rescan Now
                  </button>
                </div>
              </div>

              {scanDirs.length === 0 ? (
                <div className="muted-box">
                  No ROM folders configured yet. Click <b>+ Add ROM Directory</b> to browse your filesystem with the controller.
                </div>
              ) : (
                <div className="dir-list">
                  {scanDirs.map((d) => (
                    <div key={d.path} className="dir-row">
                      <div className="dir-row-main">
                        <span className="dir-icon">📂</span>
                        <div>
                          <div className="dir-path">{d.path}</div>
                          <div className="dir-sub">
                            Platform:{" "}
                            <strong>
                              {d.platform
                                ? platformDefs.find((p) => p.id === d.platform)?.name || d.platform
                                : "Auto-detect by subfolder name & file extension"}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="dir-row-actions">
                        <select
                          className="dark-select"
                          value={d.platform || ""}
                          onChange={async (e) => {
                            const next: ScanDir = {
                              ...d,
                              platform: e.target.value || null,
                            };
                            await api.saveScanDir(next);
                            await loadAll();
                          }}
                        >
                          <option value="">Auto-detect Consoles</option>
                          {consolePlatforms.map((p) => (
                            <option key={p.id} value={p.id}>
                              Force: {p.name}
                            </option>
                          ))}
                        </select>

                        <button
                          className="btn-danger-ghost"
                          onClick={() => handleRemoveScanDir(d.path)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 2. Emulator Management ───────────────────────────────────────── */}
        {section === "emulators" && (
          <div className="settings-section">
            <div className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h3>Installed Emulators ({emulators.length})</h3>
                  <p>
                    Henosis acts as a frontend for your standalone emulators (System binaries, Flatpaks, and AppImages) as well as RetroArch cores.
                  </p>
                </div>
                <div className="head-actions">
                  <button className="btn-primary" onClick={handleDetectEmulators}>
                    🔍 Auto-Detect Emulators (X)
                  </button>
                  <button className="btn-ghost" onClick={handleAddEmulatorDir}>
                    + Add Emulator Folder
                  </button>
                  <button className="btn-ghost" onClick={() => startNewEmulator("custom")}>
                    + Add Custom Emulator
                  </button>
                </div>
              </div>

              {emuDirs.length > 0 && (
                <div className="emu-dirs-strip">
                  <span>Extra search folders:</span>
                  {emuDirs.map((d) => (
                    <span key={d} className="tag-mono">
                      {d}
                    </span>
                  ))}
                </div>
              )}

              {emulators.length === 0 ? (
                <div className="muted-box">
                  No emulators registered yet. Click <b>Auto-Detect Emulators</b> or add an emulator executable manually below.
                </div>
              ) : (
                <div className="emu-grid">
                  {emulators.map((emu) => (
                    <div key={emu.id} className="emu-card">
                      <div className="emu-card-top">
                        <div>
                          <h4>{emu.name}</h4>
                          <span className="emu-kind-badge">{emu.kind.toUpperCase()}</span>
                        </div>
                        <div className="emu-card-btns">
                          <button
                            className="btn-ghost-sm"
                            onClick={() => setEditingEmu({ ...emu })}
                          >
                            Configure
                          </button>
                          <button
                            className="btn-danger-sm"
                            onClick={() => handleDeleteEmulator(emu.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="emu-exec">{emu.exec}</div>
                      <div className="emu-args">
                        <span>Args:</span> <code>{emu.args}</code>
                      </div>
                      <div className="emu-plats">
                        {emu.platforms.slice(0, 10).map((pid) => (
                          <span key={pid} className="plat-chip">
                            {platformDefs.find((p) => p.id === pid)?.shortName || pid}
                          </span>
                        ))}
                        {emu.platforms.length > 10 && (
                          <span className="plat-chip">+{emu.platforms.length - 10} more</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-card">
              <h3>Add From Supported Emulator Presets</h3>
              <p className="card-sub">
                Pick a preset to pre-populate command-line templates and supported consoles, then select your binary or AppImage.
              </p>
              <div className="preset-chips">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    className="preset-chip"
                    onClick={() => startNewEmulator(p.id)}
                  >
                    + {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 3. Per-Console Default Emulator & BIOS Paths ─────────────────── */}
        {section === "platforms" && (
          <div className="settings-section">
            <div className="settings-card">
              <h3>Per-Console Default Emulator & BIOS / Firmware Folders</h3>
              <p className="card-sub">
                Choose which emulator runs each console by default (individual games can still override this on their page) and specify custom BIOS directories.
              </p>

              <div className="plat-config-list">
                {consolePlatforms.map((plat) => {
                  const cfg = platConfigs[plat.id];
                  const compat = emulators.filter((e) => e.platforms.includes(plat.id));
                  return (
                    <div key={plat.id} className="plat-config-row">
                      <div className="plat-config-name">
                        <span
                          className="plat-dot"
                          style={{ background: plat.accent }}
                        />
                        <div>
                          <strong>{plat.name}</strong>
                          <div className="plat-config-sub">
                            {plat.manufacturer} · {plat.year}
                          </div>
                        </div>
                      </div>

                      <div className="plat-config-controls">
                        <select
                          className="dark-select"
                          value={cfg?.defaultEmulator || ""}
                          onChange={(e) =>
                            updatePlatConfig(plat.id, {
                              defaultEmulator: e.target.value || null,
                            })
                          }
                        >
                          <option value="">
                            Auto ({compat[0]?.name || "No emulator installed"})
                          </option>
                          {compat.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>

                        <button
                          className="btn-ghost"
                          onClick={() =>
                            openFileBrowser({
                              title: `Select BIOS / Firmware Directory for ${plat.shortName}`,
                              initialPath: cfg?.biosDir || null,
                              pickMode: "dir",
                              onPick: (path) => updatePlatConfig(plat.id, { biosDir: path }),
                            })
                          }
                        >
                          {cfg?.biosDir ? `BIOS: ${cfg.biosDir}` : "Set BIOS Folder…"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── 4. System & Controller ───────────────────────────────────────── */}
        {section === "system" && (
          <div className="settings-section">
            <div className="settings-card">
              <h3>Controller & Window Behavior</h3>
              <div className="sys-toggle-list">
                <div className="sys-row">
                  <div>
                    <strong>Summon Launcher with Xbox Guide Button</strong>
                    <p>
                      Pressing the Xbox button on your controller brings Henosis to the front from anywhere on your desktop (using a KWin focus bridge on KDE Wayland).
                    </p>
                  </div>
                  <button
                    className={`toggle-pill ${appSettings.guideSummons ? "on" : "off"}`}
                    onClick={() =>
                      updateAppSettings({
                        ...appSettings,
                        guideSummons: !appSettings.guideSummons,
                      })
                    }
                  >
                    {appSettings.guideSummons ? "Enabled" : "Disabled"}
                  </button>
                </div>

                <div className="sys-row">
                  <div>
                    <strong>Hide Launcher While a Game Is Running</strong>
                    <p>
                      Automatically hides the Henosis window on launch and restores focus as soon as you exit the game.
                    </p>
                  </div>
                  <button
                    className={`toggle-pill ${appSettings.hideOnLaunch ? "on" : "off"}`}
                    onClick={() =>
                      updateAppSettings({
                        ...appSettings,
                        hideOnLaunch: !appSettings.hideOnLaunch,
                      })
                    }
                  >
                    {appSettings.hideOnLaunch ? "Enabled" : "Disabled"}
                  </button>
                </div>

                <div className="sys-row">
                  <div>
                    <strong>Console UI Navigation Sounds</strong>
                    <p>Synthesized low-latency audio feedback when moving across cards and menus.</p>
                  </div>
                  <button
                    className={`toggle-pill ${appSettings.uiSounds ? "on" : "off"}`}
                    onClick={() =>
                      updateAppSettings({
                        ...appSettings,
                        uiSounds: !appSettings.uiSounds,
                      })
                    }
                  >
                    {appSettings.uiSounds ? "Enabled" : "Disabled"}
                  </button>
                </div>

                <div className="sys-row">
                  <div>
                    <strong>Start Henosis at Login (Background Service)</strong>
                    <p>
                      Writes an XDG autostart entry (<code>~/.config/autostart/henosis-launcher.desktop</code>) so the Xbox button works immediately after booting.
                    </p>
                  </div>
                  <button
                    className={`toggle-pill ${appSettings.autostart ? "on" : "off"}`}
                    onClick={() =>
                      updateAppSettings({
                        ...appSettings,
                        autostart: !appSettings.autostart,
                      })
                    }
                  >
                    {appSettings.autostart ? "Enabled" : "Disabled"}
                  </button>
                </div>

                <div className="sys-row">
                  <div>
                    <strong>Purge Missing Library Entries</strong>
                    <p>Remove database entries for ROMs or games whose files were deleted from disk.</p>
                  </div>
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      const n = await api.purgeMissing();
                      await refreshOverview();
                      pushToast(`Removed ${n} missing entries`, "info");
                    }}
                  >
                    Clean Up Library
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <h3>Metadata & Artwork Scrapers (Steam Store · Libretro · IGDB)</h3>
              <p className="card-sub">
                Steam Store metadata and Libretro console boxart work automatically out of the box. To also fetch full synopses, developers, publishers, and screenshots from <b>IGDB</b> for retro ROMs, enter your free Twitch Developer Client ID & Secret below.
              </p>

              <div className="form-grid" style={{ marginTop: 14 }}>
                <label>
                  <span>Twitch / IGDB Client ID</span>
                  <div className="input-with-btn">
                    <input
                      value={igdb.clientId}
                      placeholder="Twitch Client ID"
                      onChange={(e) => setIgdb({ ...igdb, clientId: e.target.value })}
                    />
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        openKeyboard({
                          title: "IGDB / Twitch Client ID",
                          initial: igdb.clientId,
                          onSubmit: (v) => setIgdb({ ...igdb, clientId: v.trim() }),
                        })
                      }
                    >
                      ⌨
                    </button>
                  </div>
                </label>

                <label>
                  <span>Twitch / IGDB Client Secret</span>
                  <div className="input-with-btn">
                    <input
                      type="password"
                      value={igdb.clientSecret}
                      placeholder="Twitch Client Secret"
                      onChange={(e) => setIgdb({ ...igdb, clientSecret: e.target.value })}
                    />
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        openKeyboard({
                          title: "IGDB / Twitch Client Secret",
                          initial: igdb.clientSecret,
                          onSubmit: (v) => setIgdb({ ...igdb, clientSecret: v.trim() }),
                        })
                      }
                    >
                      ⌨
                    </button>
                  </div>
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    await api.saveIgdbCredentials(igdb);
                    pushToast("IGDB credentials saved", "success");
                  }}
                >
                  Save IGDB Credentials
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Emulator Editor Modal */}
      {editingEmu && (
        <div className="modal-backdrop" onClick={() => setEditingEmu(null)}>
          <div className="emu-editor-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Configure Emulator Profile</h3>

            <div className="form-grid">
              <label>
                <span>Display Name</span>
                <div className="input-with-btn">
                  <input
                    value={editingEmu.name}
                    onChange={(e) => setEditingEmu({ ...editingEmu, name: e.target.value })}
                  />
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      openKeyboard({
                        title: "Emulator Name",
                        initial: editingEmu.name,
                        onSubmit: (v) => setEditingEmu({ ...editingEmu, name: v }),
                      })
                    }
                  >
                    ⌨
                  </button>
                </div>
              </label>

              <label>
                <span>Type</span>
                <select
                  className="dark-select"
                  value={editingEmu.kind}
                  onChange={(e) =>
                    setEditingEmu({
                      ...editingEmu,
                      kind: e.target.value as Emulator["kind"],
                    })
                  }
                >
                  <option value="binary">Native Binary</option>
                  <option value="appimage">AppImage</option>
                  <option value="flatpak">Flatpak Application ID</option>
                </select>
              </label>

              <label className="full-span">
                <span>Executable Path (or Flatpak ID)</span>
                <div className="input-with-btn">
                  <input
                    value={editingEmu.exec}
                    placeholder="/usr/bin/dolphin-emu or org.DolphinEmu.dolphin-emu"
                    onChange={(e) => setEditingEmu({ ...editingEmu, exec: e.target.value })}
                  />
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      openFileBrowser({
                        title: "Pick Emulator Executable / AppImage",
                        pickMode: "file",
                        onPick: (p) => setEditingEmu({ ...editingEmu, exec: p }),
                      })
                    }
                  >
                    Browse…
                  </button>
                </div>
              </label>

              <label className="full-span">
                <span>
                  Launch Arguments Template (tokens: <code>{"{rom}"}</code>{" "}
                  <code>{"{settings}"}</code> <code>{"{core}"}</code>{" "}
                  <code>{"{bios}"}</code>)
                </span>
                <div className="input-with-btn">
                  <input
                    value={editingEmu.args}
                    onChange={(e) => setEditingEmu({ ...editingEmu, args: e.target.value })}
                  />
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      openKeyboard({
                        title: "Launch Arguments Template",
                        initial: editingEmu.args,
                        onSubmit: (v) => setEditingEmu({ ...editingEmu, args: v }),
                      })
                    }
                  >
                    ⌨
                  </button>
                </div>
              </label>
            </div>

            <div className="editor-plat-picker">
              <span>Supported Consoles (click to toggle):</span>
              <div className="editor-plat-chips">
                {consolePlatforms.map((p) => {
                  const active = editingEmu.platforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`plat-toggle-chip ${active ? "active" : ""}`}
                      onClick={() => {
                        const next = active
                          ? editingEmu.platforms.filter((x) => x !== p.id)
                          : [...editingEmu.platforms, p.id];
                        setEditingEmu({ ...editingEmu, platforms: next });
                      }}
                    >
                      {p.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setEditingEmu(null)}>
                Cancel (B)
              </button>
              <button className="btn-primary" onClick={handleSaveEmulator}>
                Save Emulator
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomPromptBar
        items={[
          { btn: "LB", label: "Prev Section", onClick: () => setSecIdx((i) => (i - 1 + SECTIONS.length) % SECTIONS.length) },
          { btn: "RB", label: "Next Section", onClick: () => setSecIdx((i) => (i + 1) % SECTIONS.length) },
          ...(section === "directories"
            ? ([{ btn: "X", label: "Add ROM Folder", onClick: handleAddScanDir }] as const)
            : []),
          ...(section === "emulators"
            ? ([{ btn: "X", label: "Auto-Detect Emulators", onClick: handleDetectEmulators }] as const)
            : []),
          { btn: "B", label: "Back", onClick: back },
        ]}
      />
    </div>
  );
};
