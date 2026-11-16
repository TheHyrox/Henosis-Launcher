// Settings & Configuration View
// Left navigation list: Library, Emulators, Consoles & BIOS, System, Accounts
// Flat list rows separated by hairline dividers, real switches, one primary action per page,
// red text for Remove actions, and JetBrains Mono reserved strictly for file paths and CLI args.

import React, { useEffect, useMemo, useState } from "react";
import { api, Emulator, IgdbCredentials, Platform, PlatformConfig, RaCredentials, ScanDir } from "../api";
import { BottomPromptBar } from "../components/TopBar";
import { usePad } from "../input";
import { useStore } from "../store";

const SECTIONS = [
  { id: "directories", label: "Library" },
  { id: "emulators", label: "Emulators" },
  { id: "platforms", label: "Consoles & BIOS" },
  { id: "system", label: "System" },
  { id: "accounts", label: "Accounts" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const MAKER_GROUPS = ["Nintendo", "Sony", "Sega", "Microsoft", "Other"] as const;

function shortenPath(p: string): string {
  if (!p) return "";
  const homeMatch = p.replace(/^\/home\/[^/]+/, "~");
  if (homeMatch.length <= 44) return homeMatch;
  const parts = homeMatch.split("/");
  if (parts.length <= 3) return homeMatch;
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

function formatKindLabel(kind: Emulator["kind"]): string {
  if (kind === "appimage") return "AppImage";
  if (kind === "flatpak") return "Flatpak";
  return "Binary";
}

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`ui-switch ${checked ? "is-on" : ""}`}
    onClick={onChange}
  >
    <span className="ui-switch-thumb" />
  </button>
);

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
  const [ra, setRa] = useState<RaCredentials>({ username: "", apiKey: "", hardcore: true });
  const [raPassword, setRaPassword] = useState("");
  const [igdb, setIgdb] = useState<IgdbCredentials>({ clientId: "", clientSecret: "" });
  const [collapsedMakers, setCollapsedMakers] = useState<Record<string, boolean>>({});
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});
  const [raStatus, setRaStatus] = useState<string | null>(null);
  const [igdbStatus, setIgdbStatus] = useState<string | null>(null);

  const section = SECTIONS[secIdx].id;

  const loadAll = async () => {
    const [dirs, edirs, creds] = await Promise.all([
      api.getScanDirs(),
      api.getEmulatorDirs(),
      api.getIgdbCredentials(),
      api.getRaCredentials().then(setRa).catch(() => {}),
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

  const consolePlatforms = useMemo(
    () => platformDefs.filter((p) => p.id !== "steam" && p.id !== "pc"),
    [platformDefs]
  );

  const supportedConsolePlatforms = useMemo(() => {
    const supportedIds = new Set(presets.flatMap((p) => p.platforms));
    return consolePlatforms.filter((p) => supportedIds.has(p.id));
  }, [consolePlatforms, presets]);

  const groupedConsoles = useMemo(() => {
    const map: Record<string, Platform[]> = {};
    for (const m of MAKER_GROUPS) map[m] = [];
    for (const p of consolePlatforms) {
      const m = MAKER_GROUPS.includes(p.manufacturer as (typeof MAKER_GROUPS)[number])
        ? p.manufacturer
        : "Other";
      map[m].push(p);
    }
    return MAKER_GROUPS.map((maker) => ({ maker, platforms: map[maker] })).filter(
      (g) => g.platforms.length > 0
    );
  }, [consolePlatforms]);

  return (
    <div className="settings-view">
      <div className="settings-shell">
        <aside className="settings-sidebar" aria-label="Settings Categories">
          <div className="settings-sidebar-title">Settings</div>
          <nav className="settings-nav-list">
            {SECTIONS.map((s, idx) => (
              <button
                key={s.id}
                className={`settings-nav-item ${idx === secIdx ? "active" : ""}`}
                onClick={() => setSecIdx(idx)}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-body">
          {/* ── 1. Library ─────────────────────────────────────────────────── */}
          {section === "directories" && (
            <div className="settings-page">
              <div className="settings-page-head">
                <div>
                  <h2>Library</h2>
                  <p>Manage Steam integration and local ROM directories.</p>
                </div>
                <div className="head-actions">
                  <button
                    className="btn-ghost"
                    onClick={() => triggerScan()}
                    disabled={scanning}
                  >
                    {scanning ? "Scanning…" : "Rescan"}
                  </button>
                  <button className="btn-primary" onClick={handleAddScanDir}>
                    Add ROM Directory
                  </button>
                </div>
              </div>

              <div className="settings-list">
                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Steam library integration</strong>
                    <p>
                      Detect installed games from{" "}
                      <code>~/.local/share/Steam/steamapps/libraryfolders.vdf</code>
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={appSettings.steamEnabled}
                    label="Steam library integration"
                    onChange={() =>
                      updateAppSettings({
                        ...appSettings,
                        steamEnabled: !appSettings.steamEnabled,
                      })
                    }
                  />
                </div>
              </div>

              <div className="settings-group-header">
                <h3>ROM directories ({scanDirs.length})</h3>
              </div>

              {scanDirs.length === 0 ? (
                <div className="settings-empty-note">
                  No ROM directories added yet. Use <b>Add ROM Directory</b> to pick a folder.
                </div>
              ) : (
                <div className="settings-list">
                  {scanDirs.map((d) => (
                    <div key={d.path} className="setting-row">
                      <div className="setting-row-info">
                        <code className="mono-path">{shortenPath(d.path)}</code>
                        <p>
                          {d.platform
                            ? platformDefs.find((p) => p.id === d.platform)?.name || d.platform
                            : "Auto-detect by subfolder and extension"}
                        </p>
                      </div>

                      <div className="setting-row-controls">
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
                          <option value="">Auto-detect</option>
                          {consolePlatforms.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <button
                          className="btn-danger-text"
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
          )}

          {/* ── 2. Emulators ───────────────────────────────────────────────── */}
          {section === "emulators" && (
            <div className="settings-page">
              <div className="settings-page-head">
                <div>
                  <h2>Emulators</h2>
                  <p>
                    Standalone binaries, Flatpaks, AppImages, and RetroArch profiles (
                    {emulators.length}).
                  </p>
                </div>
                <div className="head-actions">
                  <button className="btn-ghost" onClick={handleAddEmulatorDir}>
                    Add Folder
                  </button>
                  <button className="btn-ghost" onClick={() => startNewEmulator("custom")}>
                    Add Custom
                  </button>
                  <button className="btn-primary" onClick={handleDetectEmulators}>
                    Auto-detect
                  </button>
                </div>
              </div>

              {emuDirs.length > 0 && (
                <div className="emu-dirs-strip">
                  <span>Search folders:</span>
                  {emuDirs.map((d) => (
                    <code key={d} className="mono-path">
                      {shortenPath(d)}
                    </code>
                  ))}
                </div>
              )}

              {emulators.length === 0 ? (
                <div className="settings-empty-note">
                  No emulators configured yet. Run <b>Auto-detect</b> or add one manually.
                </div>
              ) : (
                <div className="settings-list">
                  {emulators.map((emu) => {
                    const consoleNames = emu.platforms
                      .slice(0, 5)
                      .map((pid) => platformDefs.find((p) => p.id === pid)?.shortName || pid)
                      .join(", ");
                    const extraCount =
                      emu.platforms.length > 5 ? ` +${emu.platforms.length - 5}` : "";
                    return (
                      <div key={emu.id} className="setting-row">
                        <div className="setting-row-info">
                          <div className="emu-row-title">
                            <strong>{emu.name}</strong>
                            <span className="emu-row-type">{formatKindLabel(emu.kind)}</span>
                          </div>
                          <p className="emu-row-meta">
                            <code className="mono-path">{shortenPath(emu.exec)}</code>
                            {consoleNames && (
                              <span className="emu-row-consoles">
                                {" · "}
                                {consoleNames}
                                {extraCount}
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="setting-row-controls">
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => setEditingEmu({ ...emu })}
                          >
                            Configure
                          </button>
                          <button
                            className="btn-danger-text"
                            onClick={() => handleDeleteEmulator(emu.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="settings-group-header">
                <h3>Supported Emulators</h3>
              </div>
              <div className="settings-list">
                {presets.map((p) => {
                  const plats = p.platforms
                    .map((pid) => platformDefs.find((pl) => pl.id === pid)?.shortName || pid)
                    .join(", ");
                  return (
                    <div key={p.id} className="setting-row">
                      <div className="setting-row-info">
                        <div className="emu-row-title">
                          <strong>{p.name}</strong>
                          {plats && <span className="emu-row-type">{plats}</span>}
                        </div>
                        {p.url && (
                          <p className="emu-row-meta">
                            <code className="mono-path">{p.url}</code>
                          </p>
                        )}
                      </div>
                      <div className="setting-row-controls">
                        {p.url && (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => api.openExternalUrl(p.url).catch(() => {})}
                          >
                            Source ↗
                          </button>
                        )}
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => startNewEmulator(p.id)}
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 3. Consoles & BIOS (42-row grouped page) ───────────────────── */}
          {section === "platforms" && (
            <div className="settings-page">
              <div className="settings-page-head">
                <div>
                  <h2>Consoles &amp; BIOS</h2>
                  <p>
                    Default emulator and firmware directories across {consolePlatforms.length}{" "}
                    supported systems.
                  </p>
                </div>
              </div>

              {groupedConsoles.map(({ maker, platforms: list }) => {
                const isCollapsed = !!collapsedMakers[maker];
                return (
                  <div key={maker} className="maker-group-block">
                    <button
                      className="maker-group-toggle"
                      onClick={() =>
                        setCollapsedMakers((prev) => ({ ...prev, [maker]: !prev[maker] }))
                      }
                    >
                      <span>{maker}</span>
                      <span className="maker-group-count">
                        {list.length} {isCollapsed ? "▸" : "▾"}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="settings-list">
                        {list.map((plat) => {
                          const cfg = platConfigs[plat.id];
                          const compat = emulators.filter((e) => e.platforms.includes(plat.id));
                          const activeEmu =
                            compat.find((e) => e.id === cfg?.defaultEmulator) || compat[0];
                          const advOpen = !!expandedAdvanced[plat.id];

                          return (
                            <div key={plat.id} className="console-config-item">
                              <div className="setting-row">
                                <div className="setting-row-info">
                                  <strong>{plat.name}</strong>
                                  <p>
                                    {plat.year} ·{" "}
                                    {activeEmu
                                      ? `Default: ${activeEmu.name}`
                                      : "No emulator installed"}
                                    {cfg?.biosDir ? ` · BIOS set` : ""}
                                  </p>
                                </div>
                                <div className="setting-row-controls">
                                  <button
                                    className="btn-ghost btn-sm"
                                    onClick={() =>
                                      setExpandedAdvanced((prev) => ({
                                        ...prev,
                                        [plat.id]: !prev[plat.id],
                                      }))
                                    }
                                  >
                                    {advOpen ? "Hide Advanced" : "Advanced"}
                                  </button>
                                </div>
                              </div>

                              {advOpen && (
                                <div className="console-advanced-drawer">
                                  <div className="advanced-field">
                                    <span>Emulator override</span>
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
                                        Auto ({compat[0]?.name || "None"})
                                      </option>
                                      {compat.map((e) => (
                                        <option key={e.id} value={e.id}>
                                          {e.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="advanced-field">
                                    <span>BIOS folder</span>
                                    <div className="advanced-bios-control">
                                      {cfg?.biosDir && (
                                        <code className="mono-path">{shortenPath(cfg.biosDir)}</code>
                                      )}
                                      <button
                                        className="btn-ghost btn-sm"
                                        onClick={() =>
                                          openFileBrowser({
                                            title: `Select BIOS Directory for ${plat.shortName}`,
                                            initialPath: cfg?.biosDir || null,
                                            pickMode: "dir",
                                            onPick: (path) =>
                                              updatePlatConfig(plat.id, { biosDir: path }),
                                          })
                                        }
                                      >
                                        {cfg?.biosDir ? "Change…" : "Set BIOS Folder…"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 4. System ──────────────────────────────────────────────────── */}
          {section === "system" && (
            <div className="settings-page">
              <div className="settings-page-head">
                <div>
                  <h2>System</h2>
                  <p>Controller input, window lifecycle, and library maintenance.</p>
                </div>
              </div>

              <div className="settings-list">
                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Summon launcher with Xbox Guide button</strong>
                    <p>
                      Bring Henosis to the foreground from anywhere on your desktop via KWin DBus.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={appSettings.guideSummons}
                    label="Summon launcher with Xbox Guide button"
                    onChange={() =>
                      updateAppSettings({
                        ...appSettings,
                        guideSummons: !appSettings.guideSummons,
                      })
                    }
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Hide launcher while a game is running</strong>
                    <p>
                      Minimize Henosis once the emulator or Steam window renders, and restore on
                      exit.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={appSettings.hideOnLaunch}
                    label="Hide launcher while a game is running"
                    onChange={() =>
                      updateAppSettings({
                        ...appSettings,
                        hideOnLaunch: !appSettings.hideOnLaunch,
                      })
                    }
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>UI navigation sounds</strong>
                    <p>Subtle audio feedback when moving across cards and menus.</p>
                  </div>
                  <ToggleSwitch
                    checked={appSettings.uiSounds}
                    label="UI navigation sounds"
                    onChange={() =>
                      updateAppSettings({
                        ...appSettings,
                        uiSounds: !appSettings.uiSounds,
                      })
                    }
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Start Henosis at login</strong>
                    <p>
                      Write an XDG autostart entry at{" "}
                      <code>~/.config/autostart/henosis-launcher.desktop</code>.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={appSettings.autostart}
                    label="Start Henosis at login"
                    onChange={() =>
                      updateAppSettings({
                        ...appSettings,
                        autostart: !appSettings.autostart,
                      })
                    }
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Show empty consoles</strong>
                    <p>Display all 42 supported systems even when no ROMs are installed.</p>
                  </div>
                  <ToggleSwitch
                    checked={appSettings.showEmptyPlatforms}
                    label="Show empty consoles"
                    onChange={() =>
                      updateAppSettings({
                        ...appSettings,
                        showEmptyPlatforms: !appSettings.showEmptyPlatforms,
                      })
                    }
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Purge missing library entries</strong>
                    <p>Remove database entries for files that no longer exist on disk.</p>
                  </div>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={async () => {
                      const n = await api.purgeMissing();
                      await refreshOverview();
                      pushToast(`Removed ${n} missing entries`, "info");
                    }}
                  >
                    Clean Up
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 5. Accounts (IGDB & RetroAchievements) ─────────────────────── */}
          {section === "accounts" && (
            <div className="settings-page">
              <div className="settings-page-head">
                <div>
                  <h2>Accounts</h2>
                  <p>
                    External metadata and achievement services. Steam Store and Libretro boxart
                    work without credentials.
                  </p>
                </div>
              </div>

              <div className="settings-group-header">
                <h3>IGDB (Twitch Developer)</h3>
                <div className="head-actions">
                  {igdbStatus && <span className="inline-status">{igdbStatus}</span>}
                  <button
                    className="btn-ghost btn-sm"
                    onClick={async () => {
                      try {
                        await api.saveIgdbCredentials(igdb);
                        setIgdbStatus(
                          igdb.clientId && igdb.clientSecret ? "Saved" : "Missing keys"
                        );
                        pushToast("IGDB credentials saved", "success");
                      } catch (err) {
                        setIgdbStatus("Error");
                        pushToast(String(err), "error");
                      }
                    }}
                  >
                    Test &amp; Save
                  </button>
                </div>
              </div>

              <div className="settings-list">
                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Client ID</strong>
                    <p>Twitch Developer application Client ID for IGDB lookups.</p>
                  </div>
                  <div className="setting-inline-input">
                    <input
                      value={igdb.clientId}
                      placeholder="Twitch Client ID"
                      onChange={(e) => setIgdb({ ...igdb, clientId: e.target.value })}
                    />
                    <button
                      className="btn-ghost btn-sm"
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
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Client Secret</strong>
                    <p>Used locally to request an IGDB OAuth token.</p>
                  </div>
                  <div className="setting-inline-input">
                    <input
                      type="password"
                      value={igdb.clientSecret}
                      placeholder="Twitch Client Secret"
                      onChange={(e) => setIgdb({ ...igdb, clientSecret: e.target.value })}
                    />
                    <button
                      className="btn-ghost btn-sm"
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
                </div>
              </div>

              <div className="settings-group-header">
                <h3>RetroAchievements</h3>
                <div className="head-actions">
                  {raStatus && <span className="inline-status">{raStatus}</span>}
                  <button
                    className="btn-ghost btn-sm"
                    onClick={async () => {
                      try {
                        const who = await api.testRaCredentials(ra);
                        setRaStatus(`Connected: ${who}`);
                        pushToast(`Connected: ${who}`, "success");
                      } catch (err) {
                        setRaStatus("Failed");
                        pushToast(`RetroAchievements: ${String(err)}`, "error");
                      }
                    }}
                  >
                    Test
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    onClick={async () => {
                      await api.saveRaCredentials(ra);
                      setRaStatus("Saved");
                      pushToast("RetroAchievements credentials saved", "success");
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="settings-list">
                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Username</strong>
                    <p>Your RetroAchievements account handle.</p>
                  </div>
                  <div className="setting-inline-input">
                    <input
                      value={ra.username}
                      placeholder="Username"
                      onChange={(e) => setRa({ ...ra, username: e.target.value })}
                    />
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        openKeyboard({
                          title: "RetroAchievements Username",
                          initial: ra.username,
                          onSubmit: (v) => setRa({ ...ra, username: v.trim() }),
                        })
                      }
                    >
                      ⌨
                    </button>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Web API Key</strong>
                    <p>Found under retroachievements.org → Settings → Keys.</p>
                  </div>
                  <div className="setting-inline-input">
                    <input
                      type="password"
                      value={ra.apiKey}
                      placeholder="Web API Key"
                      onChange={(e) => setRa({ ...ra, apiKey: e.target.value })}
                    />
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        openKeyboard({
                          title: "RetroAchievements Web API Key",
                          initial: ra.apiKey,
                          onSubmit: (v) => setRa({ ...ra, apiKey: v.trim() }),
                        })
                      }
                    >
                      ⌨
                    </button>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Hardcore mode</strong>
                    <p>
                      Disables savestates and cheats in supported emulators; turn off for Softcore.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={ra.hardcore ?? true}
                    label="Hardcore mode"
                    onChange={async () => {
                      const next = { ...ra, hardcore: !(ra.hardcore ?? true) };
                      setRa(next);
                      await api.saveRaCredentials(next);
                      pushToast(
                        next.hardcore ? "Hardcore mode enabled" : "Softcore mode enabled",
                        "info"
                      );
                    }}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-row-info">
                    <strong>Emulator token login</strong>
                    <p>Password is used once to fetch an emulator token and is never stored.</p>
                  </div>
                  <div className="setting-inline-input">
                    <input
                      type="password"
                      value={raPassword}
                      placeholder="Password (one-time)"
                      onChange={(e) => setRaPassword(e.target.value)}
                    />
                    <button
                      className="btn-ghost btn-sm"
                      onClick={async () => {
                        try {
                          await api.saveRaCredentials(ra);
                          await api.raLogin(ra.username, raPassword);
                          setRaPassword("");
                          pushToast("Emulator login OK", "success");
                        } catch (err) {
                          pushToast(`RetroAchievements: ${String(err)}`, "error");
                        }
                      }}
                    >
                      Log In
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Emulator Configure Modal (Args & Consoles live here) */}
      {editingEmu && (
        <div className="modal-backdrop" onClick={() => setEditingEmu(null)}>
          <div className="emu-editor-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Configure {editingEmu.name || "Emulator"}</h3>

            <div className="form-grid">
              <label>
                <span>Display name</span>
                <div className="input-with-btn">
                  <input
                    value={editingEmu.name}
                    onChange={(e) => setEditingEmu({ ...editingEmu, name: e.target.value })}
                  />
                  <button
                    className="btn-ghost btn-sm"
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
                <span>Executable path (or Flatpak ID)</span>
                <div className="input-with-btn">
                  <input
                    className="mono-input"
                    value={editingEmu.exec}
                    placeholder="/usr/bin/dolphin-emu or org.DolphinEmu.dolphin-emu"
                    onChange={(e) => setEditingEmu({ ...editingEmu, exec: e.target.value })}
                  />
                  <button
                    className="btn-ghost btn-sm"
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
                  Launch arguments (<code>{"{rom}"}</code>, <code>{"{settings}"}</code>,{" "}
                  <code>{"{core}"}</code>, <code>{"{bios}"}</code>)
                </span>
                <div className="input-with-btn">
                  <input
                    className="mono-input"
                    value={editingEmu.args}
                    onChange={(e) => setEditingEmu({ ...editingEmu, args: e.target.value })}
                  />
                  <button
                    className="btn-ghost btn-sm"
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
              <span>Supported consoles</span>
              <div className="editor-plat-chips">
                {supportedConsolePlatforms.map((p) => {
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
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveEmulator}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomPromptBar
        items={[
          {
            btn: "LB/RB",
            label: "Category",
            onClick: () => setSecIdx((i) => (i + 1) % SECTIONS.length),
          },
          ...(section === "directories"
            ? ([{ btn: "X", label: "Add Folder", onClick: handleAddScanDir }] as const)
            : []),
          ...(section === "emulators"
            ? ([{ btn: "X", label: "Auto-detect", onClick: handleDetectEmulators }] as const)
            : []),
          { btn: "B", label: "Back", onClick: back },
        ]}
      />
    </div>
  );
};
