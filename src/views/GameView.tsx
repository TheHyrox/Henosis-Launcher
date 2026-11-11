// Individual Game Page – Overview, Per-Game Technical Settings, Achievements, and Sessions/Logs.
//
// Fully navigable by controller: LB/RB switches tabs, Up/Down selects setting rows,
// Left/Right cycles option values, A activates or opens the On-Screen Keyboard / File Browser,
// X launches the game immediately.

import React, { useEffect, useMemo, useState } from "react";
import {
  api,
  Emulator,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
  Game,
  GameSettings,
  LaunchPreview,
  mediaSrc,
  Platform,
  Session,
} from "../api";
import { CollectibleCard } from "../components/Collectible";
import { BottomPromptBar } from "../components/TopBar";
import { usePad } from "../input";
import { useStore } from "../store";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "settings", label: "Per-Game Technical Settings" },
  { id: "achievements", label: "Achievements" },
  { id: "sessions", label: "Sessions & Logs" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface SettingRowSpec {
  id: string;
  group: string;
  label: string;
  hint: string;
  valueLabel: string;
  isOverridden: boolean;
  onStep?: (dir: -1 | 1) => void;
  onActivate?: () => void;
  onClear?: () => void;
}

export const GameView: React.FC<{ gameId: number; initialTab?: TabId }> = ({
  gameId,
  initialTab = "overview",
}) => {
  const {
    platforms,
    platformDefs,
    emulators,
    back,
    launchGame,
    running,
    stopRunning,
    openKeyboard,
    openFileBrowser,
    pushToast,
    refreshOverview,
    setQuickMenu,
  } = useStore();

  const [game, setGame] = useState<Game | null>(null);
  const [tabIdx, setTabIdx] = useState(() =>
    Math.max(0, TABS.findIndex((t) => t.id === initialTab))
  );
  const [preview, setPreview] = useState<LaunchPreview | null>(null);
  const [cores, setCores] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logText, setLogText] = useState("");
  const [actionIdx, setActionIdx] = useState(0);
  const [settingIdx, setSettingIdx] = useState(0);
  const [fetchingMeta, setFetchingMeta] = useState(false);

  const tab = TABS[tabIdx].id;

  const loadAll = async () => {
    try {
      const [g, prev, sess, log] = await Promise.all([
        api.getGame(gameId),
        api.previewLaunch(gameId),
        api.getSessions(gameId),
        api.readGameLog(gameId),
      ]);
      setGame(g);
      setPreview(prev);
      setSessions(sess);
      setLogText(log);

      const emu = prev.emulator;
      if (emu && emu.preset === "retroarch") {
        api.getCores(emu.id).then(setCores).catch(() => setCores([]));
      } else {
        setCores([]);
      }

      // Automatically scrape metadata if not yet fetched
      const already = Boolean((g.metadata as Record<string, unknown>)?.scrapedAt);
      if (!already || !g.cover || !g.metadata?.description) {
        setFetchingMeta(true);
        api
          .fetchGameMetadata(g.id)
          .then((updated) => setGame(updated))
          .catch(() => {})
          .finally(() => setFetchingMeta(false));
      }
    } catch (e) {
      pushToast(`Could not load game: ${String(e)}`, "error");
    }
  };

  useEffect(() => {
    loadAll();
  }, [gameId, running]);

  const platform: Platform | undefined = useMemo(() => {
    if (!game) return undefined;
    return (
      platforms.find((p) => p.id === game.platform) ||
      platformDefs.find((p) => p.id === game.platform)
    );
  }, [game, platforms, platformDefs]);

  const compatibleEmulators: Emulator[] = useMemo(() => {
    if (!game) return [];
    return emulators.filter((e) => e.platforms.includes(game.platform));
  }, [game, emulators]);

  const updateSettings = async (patch: Partial<GameSettings>) => {
    if (!game) return;
    const next: GameSettings = { ...game.settings, ...patch };
    setGame({ ...game, settings: next });
    await api.saveGameSettings(game.id, next);
    const prev = await api.previewLaunch(game.id);
    setPreview(prev);
    if (prev.emulator && prev.emulator.preset === "retroarch") {
      api.getCores(prev.emulator.id).then(setCores).catch(() => setCores([]));
    }
  };

  const resetAllSettings = async () => {
    if (!game) return;
    await api.saveGameSettings(game.id, {});
    pushToast("Per-game settings reset to platform defaults", "info");
    await loadAll();
  };

  // Build controller-navigable rows for the Per-Game Technical Settings tab.
  const settingRows: SettingRowSpec[] = useMemo(() => {
    if (!game) return [];
    const s = game.settings || {};
    const isRom = game.source !== "steam" && game.platform !== "pc";
    const activeEmu = preview?.emulator || null;

    const cycle = <T,>(list: T[], cur: T, dir: -1 | 1): T => {
      const i = list.indexOf(cur);
      const next = (i + dir + list.length) % list.length;
      return list[next];
    };

    const rows: SettingRowSpec[] = [];

    if (isRom) {
      const emuChoices: (string | null)[] = [null, ...compatibleEmulators.map((e) => e.id)];
      const curEmu = s.emulatorId ?? null;
      const curEmuLabel = curEmu
        ? compatibleEmulators.find((e) => e.id === curEmu)?.name || curEmu
        : `Platform Default (${activeEmu?.name || "Auto"})`;

      rows.push({
        id: "emulator",
        group: "Emulator & Core",
        label: "Preferred Emulator",
        hint: "Choose which emulator launches this specific game",
        valueLabel: curEmuLabel,
        isOverridden: Boolean(curEmu),
        onStep: (dir) => updateSettings({ emulatorId: cycle(emuChoices, curEmu, dir) }),
        onActivate: () => updateSettings({ emulatorId: cycle(emuChoices, curEmu, 1) }),
        onClear: () => updateSettings({ emulatorId: null }),
      });

      if (activeEmu?.preset === "retroarch") {
        const coreChoices: (string | null)[] = [null, ...cores];
        const curCore = s.core ?? null;
        rows.push({
          id: "core",
          group: "Emulator & Core",
          label: "RetroArch Core",
          hint: "Libretro core used for this game",
          valueLabel: curCore || "Auto-select Recommended Core",
          isOverridden: Boolean(curCore),
          onStep: (dir) => updateSettings({ core: cycle(coreChoices, curCore, dir) }),
          onActivate: () =>
            openKeyboard({
              title: "RetroArch Core Name (e.g. snes9x, mesen, swanstation)",
              initial: curCore || "",
              onSubmit: (v) => updateSettings({ core: v.trim() || null }),
            }),
          onClear: () => updateSettings({ core: null }),
        });
      }
    }

    // Graphics & Display
    const apis: (string | null)[] = [null, "vulkan", "opengl", "software"];
    rows.push({
      id: "graphicsApi",
      group: "Graphics & Display",
      label: "Graphics API / Renderer",
      hint: "Rendering backend passed to the emulator",
      valueLabel: s.graphicsApi ? s.graphicsApi.toUpperCase() : "Default (Emulator)",
      isOverridden: Boolean(s.graphicsApi),
      onStep: (dir) => updateSettings({ graphicsApi: cycle(apis, s.graphicsApi ?? null, dir) }),
      onActivate: () => updateSettings({ graphicsApi: cycle(apis, s.graphicsApi ?? null, 1) }),
      onClear: () => updateSettings({ graphicsApi: null }),
    });

    const scales: (number | null)[] = [null, 1, 2, 3, 4, 5, 6, 8];
    rows.push({
      id: "resolutionScale",
      group: "Graphics & Display",
      label: "Internal Resolution Scale",
      hint: "1x = Native console resolution · 2x = 720p/1080p · 4x = 4K",
      valueLabel: s.resolutionScale ? `${s.resolutionScale}x Native` : "Default (Native)",
      isOverridden: Boolean(s.resolutionScale),
      onStep: (dir) =>
        updateSettings({ resolutionScale: cycle(scales, s.resolutionScale ?? null, dir) }),
      onActivate: () =>
        updateSettings({ resolutionScale: cycle(scales, s.resolutionScale ?? null, 1) }),
      onClear: () => updateSettings({ resolutionScale: null }),
    });

    const aspects: (string | null)[] = [null, "auto", "4:3", "16:9", "stretch"];
    rows.push({
      id: "aspectRatio",
      group: "Graphics & Display",
      label: "Aspect Ratio",
      hint: "Override display aspect ratio for this game",
      valueLabel: s.aspectRatio ? s.aspectRatio.toUpperCase() : "Default",
      isOverridden: Boolean(s.aspectRatio),
      onStep: (dir) => updateSettings({ aspectRatio: cycle(aspects, s.aspectRatio ?? null, dir) }),
      onActivate: () => updateSettings({ aspectRatio: cycle(aspects, s.aspectRatio ?? null, 1) }),
      onClear: () => updateSettings({ aspectRatio: null }),
    });

    const triBool: (boolean | null)[] = [null, true, false];
    const fmtBool = (v: boolean | null | undefined, def = "Default") =>
      v === true ? "Enabled" : v === false ? "Disabled" : def;

    rows.push({
      id: "vsync",
      group: "Graphics & Display",
      label: "V-Sync",
      hint: "Synchronize frame pacing to display refresh rate",
      valueLabel: fmtBool(s.vsync),
      isOverridden: s.vsync !== null && s.vsync !== undefined,
      onStep: (dir) => updateSettings({ vsync: cycle(triBool, s.vsync ?? null, dir) }),
      onActivate: () => updateSettings({ vsync: cycle(triBool, s.vsync ?? null, 1) }),
      onClear: () => updateSettings({ vsync: null }),
    });

    const fpsChoices: (number | null)[] = [null, 30, 60, 90, 120, 144, 165, 240];
    rows.push({
      id: "fpsLimit",
      group: "Graphics & Display",
      label: "Frame Rate Limit",
      hint: "Cap FPS via MangoHud / Gamescope",
      valueLabel: s.fpsLimit ? `${s.fpsLimit} FPS` : "Unlimited / Default",
      isOverridden: Boolean(s.fpsLimit),
      onStep: (dir) => updateSettings({ fpsLimit: cycle(fpsChoices, s.fpsLimit ?? null, dir) }),
      onActivate: () => updateSettings({ fpsLimit: cycle(fpsChoices, s.fpsLimit ?? null, 1) }),
      onClear: () => updateSettings({ fpsLimit: null }),
    });

    rows.push({
      id: "fullscreen",
      group: "Graphics & Display",
      label: "Launch in Fullscreen",
      hint: "Start the emulator in borderless/exclusive fullscreen",
      valueLabel: fmtBool(s.fullscreen, "Enabled (Default)"),
      isOverridden: s.fullscreen !== null && s.fullscreen !== undefined,
      onStep: (dir) => updateSettings({ fullscreen: cycle(triBool, s.fullscreen ?? null, dir) }),
      onActivate: () => updateSettings({ fullscreen: cycle(triBool, s.fullscreen ?? null, 1) }),
      onClear: () => updateSettings({ fullscreen: null }),
    });

    // Performance & Linux Wrappers
    rows.push({
      id: "gamemode",
      group: "Performance & Compatibility",
      label: "Feral GameMode (gamemoderun)",
      hint: "Request CPU governor & I/O priority boost while playing",
      valueLabel: fmtBool(s.gamemode, "Off"),
      isOverridden: Boolean(s.gamemode),
      onStep: (dir) => updateSettings({ gamemode: cycle(triBool, s.gamemode ?? null, dir) }),
      onActivate: () => updateSettings({ gamemode: !s.gamemode }),
      onClear: () => updateSettings({ gamemode: null }),
    });

    rows.push({
      id: "mangohud",
      group: "Performance & Compatibility",
      label: "MangoHud Performance Overlay",
      hint: "Show FPS, frame-time graph, and GPU/CPU stats in-game",
      valueLabel: fmtBool(s.mangohud, "Off"),
      isOverridden: Boolean(s.mangohud),
      onStep: (dir) => updateSettings({ mangohud: cycle(triBool, s.mangohud ?? null, dir) }),
      onActivate: () => updateSettings({ mangohud: !s.mangohud }),
      onClear: () => updateSettings({ mangohud: null }),
    });

    rows.push({
      id: "gamescope",
      group: "Performance & Compatibility",
      label: "Gamescope Micro-Compositor",
      hint: "Run inside Valve's Gamescope session for isolated scaling & VRR",
      valueLabel: fmtBool(s.gamescope, "Off"),
      isOverridden: Boolean(s.gamescope),
      onStep: (dir) => updateSettings({ gamescope: cycle(triBool, s.gamescope ?? null, dir) }),
      onActivate: () => updateSettings({ gamescope: !s.gamescope }),
      onClear: () => updateSettings({ gamescope: null }),
    });

    rows.push({
      id: "gamescopeArgs",
      group: "Performance & Compatibility",
      label: "Gamescope Arguments",
      hint: "Example: -W 3840 -H 2160 -F fsr -f",
      valueLabel: s.gamescopeArgs || "-f (Default)",
      isOverridden: Boolean(s.gamescopeArgs),
      onActivate: () =>
        openKeyboard({
          title: "Gamescope Arguments",
          initial: s.gamescopeArgs || "-f",
          onSubmit: (v) => updateSettings({ gamescopeArgs: v.trim() || null }),
        }),
      onClear: () => updateSettings({ gamescopeArgs: null }),
    });

    // Controller, Launch Args, Env, Config Overrides & Mods
    rows.push({
      id: "inputProfile",
      group: "Input, Arguments & Mods",
      label: "Controller Mapping Profile",
      hint: "Controller profile name for this game",
      valueLabel: s.inputProfile || "Standard Xbox Layout",
      isOverridden: Boolean(s.inputProfile),
      onActivate: () =>
        openKeyboard({
          title: "Controller Profile Name",
          initial: s.inputProfile || "",
          onSubmit: (v) => updateSettings({ inputProfile: v.trim() || null }),
        }),
      onClear: () => updateSettings({ inputProfile: null }),
    });

    rows.push({
      id: "launchArgs",
      group: "Input, Arguments & Mods",
      label: "Custom Launch Arguments",
      hint: "Extra CLI flags appended specifically for this game",
      valueLabel: s.launchArgs || "None",
      isOverridden: Boolean(s.launchArgs),
      onActivate: () =>
        openKeyboard({
          title: "Custom Launch Arguments",
          initial: s.launchArgs || "",
          placeholder: "--custom-flag value",
          onSubmit: (v) => updateSettings({ launchArgs: v.trim() || null }),
        }),
      onClear: () => updateSettings({ launchArgs: null }),
    });

    rows.push({
      id: "env",
      group: "Input, Arguments & Mods",
      label: "Environment Variables",
      hint: "Space-separated KEY=VALUE pairs (e.g. MESA_VK_WSI_PRESENT_MODE=mailbox)",
      valueLabel: s.env && s.env.length > 0 ? s.env.join(" ") : "None",
      isOverridden: Boolean(s.env && s.env.length > 0),
      onActivate: () =>
        openKeyboard({
          title: "Environment Variables (KEY=VALUE)",
          initial: (s.env || []).join(" "),
          onSubmit: (v) => {
            const list = v
              .split(/\s+/)
              .map((x) => x.trim())
              .filter(Boolean);
            updateSettings({ env: list.length ? list : null });
          },
        }),
      onClear: () => updateSettings({ env: null }),
    });

    rows.push({
      id: "advanced",
      group: "Input, Arguments & Mods",
      label: "Emulator-Specific Config Lines",
      hint: "Semicolon-separated options (Dolphin -C Key=Val or RetroArch key = \"val\")",
      valueLabel:
        s.advanced && s.advanced.length > 0 ? `${s.advanced.length} custom rule(s)` : "None",
      isOverridden: Boolean(s.advanced && s.advanced.length > 0),
      onActivate: () =>
        openKeyboard({
          title: "Emulator Config Overrides (separate multiple with ;)",
          initial: (s.advanced || []).join(" ; "),
          onSubmit: (v) => {
            const list = v
              .split(";")
              .map((x) => x.trim())
              .filter(Boolean);
            updateSettings({ advanced: list.length ? list : null });
          },
        }),
      onClear: () => updateSettings({ advanced: null }),
    });

    const cfgCount = s.configOverrides?.length || 0;
    rows.push({
      id: "captureConfig",
      group: "Input, Arguments & Mods",
      label: "Per-Game Emulator Config File Snapshot",
      hint: "Capture an emulator config file so changes only apply to this game and restore on exit",
      valueLabel: cfgCount > 0 ? `${cfgCount} isolated config file(s)` : "None – Click to Capture File",
      isOverridden: cfgCount > 0,
      onActivate: () =>
        openFileBrowser({
          title: "Pick Emulator Config File to Snapshot for This Game",
          pickMode: "file",
          onPick: async (target) => {
            try {
              const updated = await api.captureConfig(game.id, target);
              setGame({ ...game, settings: updated });
              pushToast("Config file captured for per-game isolation", "success");
            } catch (e) {
              pushToast(String(e), "error");
            }
          },
        }),
      onClear: () => updateSettings({ configOverrides: null }),
    });

    rows.push({
      id: "modsEnabled",
      group: "Input, Arguments & Mods",
      label: "Mods Enabled",
      hint: "Toggle per-game mod symlinks on launch",
      valueLabel: fmtBool(s.modsEnabled, "Disabled"),
      isOverridden: Boolean(s.modsEnabled),
      onStep: (dir) => updateSettings({ modsEnabled: cycle(triBool, s.modsEnabled ?? null, dir) }),
      onActivate: () => updateSettings({ modsEnabled: !s.modsEnabled }),
      onClear: () => updateSettings({ modsEnabled: null }),
    });

    return rows;
  }, [game, preview, compatibleEmulators, cores]);

  const isGameRunning = running?.gameId === game?.id;

  const overviewActions = useMemo(() => {
    if (!game) return [];
    return [
      {
        label: isGameRunning ? "Stop Running Game" : "Play Now",
        primary: true,
        run: () => (isGameRunning ? stopRunning() : launchGame(game.id)),
      },
      {
        label: game.favorite ? "★ Favorited" : "☆ Add to Favorites",
        run: async () => {
          await api.setGameFlag(game.id, "favorite", !game.favorite);
          await loadAll();
        },
      },
      {
        label: "Per-Game Settings",
        run: () => setTabIdx(1),
      },
      {
        label: fetchingMeta ? "Fetching Metadata…" : "✦ Refresh Metadata & Art",
        run: async () => {
          setFetchingMeta(true);
          try {
            const updated = await api.fetchGameMetadata(game.id);
            setGame(updated);
            pushToast("Metadata & artwork updated", "success");
          } catch (e) {
            pushToast(String(e), "error");
          } finally {
            setFetchingMeta(false);
          }
        },
      },
      {
        label: "Rename Title",
        run: () =>
          openKeyboard({
            title: "Rename Game Title",
            initial: game.title,
            onSubmit: async (v) => {
              if (!v.trim()) return;
              await api.renameGame(game.id, v);
              await loadAll();
              await refreshOverview();
            },
          }),
      },
      {
        label: game.hidden ? "Unhide from Library" : "Hide from Library",
        run: async () => {
          await api.setGameFlag(game.id, "hidden", !game.hidden);
          await loadAll();
          await refreshOverview();
        },
      },
    ];
  }, [game, isGameRunning]);

  usePad((btn) => {
    if (btn === "b") {
      back();
      return true;
    }
    if (btn === "lb") {
      setTabIdx((i) => (i - 1 + TABS.length) % TABS.length);
      return true;
    }
    if (btn === "rb") {
      setTabIdx((i) => (i + 1) % TABS.length);
      return true;
    }
    if (btn === "x" && game) {
      if (isGameRunning) stopRunning();
      else launchGame(game.id);
      return true;
    }
    if (btn === "start") {
      setQuickMenu(true);
      return true;
    }

    if (tab === "overview") {
      if (btn === "left") {
        setActionIdx((i) => Math.max(0, i - 1));
        return true;
      }
      if (btn === "right") {
        setActionIdx((i) => Math.min(overviewActions.length - 1, i + 1));
        return true;
      }
      if (btn === "a") {
        overviewActions[actionIdx]?.run();
        return true;
      }
    }

    if (tab === "settings") {
      const row = settingRows[settingIdx];
      if (btn === "up") {
        setSettingIdx((i) => Math.max(0, i - 1));
        return true;
      }
      if (btn === "down") {
        setSettingIdx((i) => Math.min(settingRows.length - 1, i + 1));
        return true;
      }
      if (btn === "left" && row?.onStep) {
        row.onStep(-1);
        return true;
      }
      if (btn === "right" && row?.onStep) {
        row.onStep(1);
        return true;
      }
      if (btn === "a" && row?.onActivate) {
        row.onActivate();
        return true;
      }
      if (btn === "y" && row?.onClear) {
        row.onClear();
        return true;
      }
    }

    return false;
  }, 0);

  if (!game || !platform) return null;

  const heroSrc =
    mediaSrc(game.hero) || mediaSrc(game.metadata?.header) || mediaSrc(game.cover);
  const logoSrc = mediaSrc(game.logo);

  return (
    <div
      className="game-view"
      style={
        {
          "--theme-color": platform.color,
          "--theme-accent": platform.accent,
        } as React.CSSProperties
      }
    >
      <div className="ambient-backdrop" />

      {/* Hero banner */}
      <section className="game-hero">
        {heroSrc && (
          <div
            className="game-hero-art"
            style={{ backgroundImage: `url("${heroSrc}")` }}
          />
        )}
        <div className="game-hero-scrim" />

        <div className="game-hero-top">
          <button className="btn-back" onClick={back}>
            ← {platform.shortName} Library (B)
          </button>

          <div className="game-tabs">
            <span className="pill-hint">LB</span>
            {TABS.map((t, idx) => (
              <button
                key={t.id}
                className={`game-tab ${idx === tabIdx ? "active" : ""}`}
                onClick={() => setTabIdx(idx)}
              >
                {t.label}
              </button>
            ))}
            <span className="pill-hint">RB</span>
          </div>
        </div>

        <div className="game-hero-content">
          <div className="game-hero-collectible">
            <CollectibleCard game={game} platform={platform} focused />
          </div>

          <div className="game-hero-meta">
            <div className="game-badges">
              <span className="badge-accent" style={{ background: platform.accent }}>
                {platform.name}
              </span>
              <span className="badge-glass">{platform.media.toUpperCase()}</span>
              {game.region && <span className="badge-glass">{game.region}</span>}
              {game.serial && <span className="badge-mono">{game.serial}</span>}
            </div>

            {logoSrc ? (
              <img src={logoSrc} alt={game.title} className="game-logo-img" />
            ) : (
              <h1 className="game-hero-title">{game.title}</h1>
            )}

            <div className="game-quick-stats">
              <div>
                <span className="qs-label">PLAYTIME</span>
                <span className="qs-value">{formatPlaytime(game.playtime)}</span>
              </div>
              <div>
                <span className="qs-label">LAST PLAYED</span>
                <span className="qs-value">{formatRelativeDate(game.lastPlayed)}</span>
              </div>
              <div>
                <span className="qs-label">SESSIONS</span>
                <span className="qs-value">{game.playCount}</span>
              </div>
              <div>
                <span className="qs-label">SIZE</span>
                <span className="qs-value">{formatBytes(game.fileSize)}</span>
              </div>
              <div>
                <span className="qs-label">RUNNER</span>
                <span className="qs-value">
                  {game.source === "steam"
                    ? "Steam Client"
                    : preview?.emulator?.name || "Unconfigured"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tab Body */}
      <main className="game-body">
        {tab === "overview" && (
          <div className="game-overview">
            <div className="overview-actions-row">
              {overviewActions.map((act, idx) => (
                <button
                  key={act.label}
                  className={`overview-action-btn ${act.primary ? "primary" : ""} ${
                    idx === actionIdx ? "focused" : ""
                  }`}
                  onMouseEnter={() => setActionIdx(idx)}
                  onClick={act.run}
                >
                  {act.primary ? `▶ ${act.label} (X)` : act.label}
                </button>
              ))}
            </div>

            <div className="overview-grid">
              <div className="overview-card">
                <h3>About This Game</h3>
                <p className="overview-synopsis">
                  {game.metadata?.description ||
                    `${game.title} on ${platform.name} (${platform.year}). Stored locally in your collection and launched directly with isolated per-game configuration.`}
                </p>

                <div className="metadata-table">
                  <div>
                    <span>Platform</span>
                    <strong>{platform.name}</strong>
                  </div>
                  <div>
                    <span>Manufacturer</span>
                    <strong>{platform.manufacturer}</strong>
                  </div>
                  <div>
                    <span>Developer</span>
                    <strong>{game.metadata?.developer || "—"}</strong>
                  </div>
                  <div>
                    <span>Publisher</span>
                    <strong>{game.metadata?.publisher || "—"}</strong>
                  </div>
                  <div>
                    <span>Release Date</span>
                    <strong>{game.metadata?.releaseDate || platform.year}</strong>
                  </div>
                  <div>
                    <span>Genre</span>
                    <strong>{game.metadata?.genre || platform.media.toUpperCase()}</strong>
                  </div>
                </div>

                {game.metadata?.screenshots && game.metadata.screenshots.length > 0 && (
                  <div className="screenshots-section">
                    <h4>Screenshots & Promotional Media</h4>
                    <div className="screenshots-strip">
                      {game.metadata.screenshots.map((shot, i) => {
                        const sUrl = mediaSrc(shot);
                        return sUrl ? (
                          <img key={i} src={sUrl} alt={`Screenshot ${i + 1}`} loading="lazy" />
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="overview-card">
                <h3>Launch Pipeline & File Location</h3>
                <div className="pipeline-kv">
                  <span>Source Path</span>
                  <code>{game.path}</code>
                </div>
                {preview?.emulator && (
                  <div className="pipeline-kv">
                    <span>Configured Emulator</span>
                    <code>
                      {preview.emulator.name} ({preview.emulator.kind})
                    </code>
                  </div>
                )}
                <div className="pipeline-kv">
                  <span>Effective Command Line</span>
                  {preview?.command ? (
                    <code className="cmd-code">{preview.command}</code>
                  ) : (
                    <div className="cmd-error">{preview?.error || "Unavailable"}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="game-settings-panel">
            <div className="settings-banner">
              <div>
                <h3>Isolated Per-Game Technical Configuration</h3>
                <p>
                  Every setting below is saved exclusively for <b>{game.title}</b>. Use{" "}
                  <b>D-Pad Left/Right</b> to cycle values, <b>A</b> to edit, and <b>Y</b> to reset a row to the console default.
                </p>
              </div>
              <button className="btn-ghost" onClick={resetAllSettings}>
                Reset All Overrides
              </button>
            </div>

            {preview?.command && (
              <div className="live-cmd-preview">
                <span className="cmd-tag">LIVE COMMAND</span>
                <code>{preview.command}</code>
              </div>
            )}

            <div className="settings-rows">
              {settingRows.map((r, idx) => {
                const prevGroup = idx > 0 ? settingRows[idx - 1].group : null;
                return (
                  <React.Fragment key={r.id}>
                    {r.group !== prevGroup && (
                      <div className="settings-group-header">{r.group}</div>
                    )}
                    <div
                      className={`setting-row ${idx === settingIdx ? "focused" : ""} ${
                        r.isOverridden ? "overridden" : ""
                      }`}
                      onMouseEnter={() => setSettingIdx(idx)}
                      onClick={() => r.onActivate?.()}
                    >
                      <div className="setting-row-left">
                        <div className="setting-row-title">
                          <span>{r.label}</span>
                          {r.isOverridden && <span className="override-dot">CUSTOM</span>}
                        </div>
                        <div className="setting-row-hint">{r.hint}</div>
                      </div>

                      <div className="setting-row-right">
                        {r.onStep && (
                          <button
                            className="step-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              r.onStep?.(-1);
                            }}
                          >
                            ◀
                          </button>
                        )}
                        <span className="setting-value">{r.valueLabel}</span>
                        {r.onStep && (
                          <button
                            className="step-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              r.onStep?.(1);
                            }}
                          >
                            ▶
                          </button>
                        )}
                        {r.isOverridden && r.onClear && (
                          <button
                            className="reset-pill"
                            title="Reset to default (Y)"
                            onClick={(e) => {
                              e.stopPropagation();
                              r.onClear?.();
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {tab === "achievements" && (
          <div className="achievements-panel">
            <div className="ach-card">
              <div className="ach-icon">🏆</div>
              <div>
                <h3>
                  {game.source === "steam"
                    ? "Steam Achievements Integration"
                    : "RetroAchievements Integration"}
                </h3>
                <p>
                  {game.source === "steam"
                    ? "Authentic Steam achievement progress, unlock timestamps, and completion percentages synchronize directly with your Steam account in Phase 2."
                    : "RetroAchievements hash verification, achievement lists, and progression synchronization are wired into this tab in Phase 2."}
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === "sessions" && (
          <div className="sessions-panel">
            <div className="sessions-col">
              <h3>Play Sessions ({sessions.length})</h3>
              {sessions.length === 0 ? (
                <div className="muted-box">No recorded sessions yet. Press X to launch and start tracking.</div>
              ) : (
                <div className="session-list">
                  {sessions.map((s) => (
                    <div key={s.id} className="session-row">
                      <span>{new Date(s.started * 1000).toLocaleString()}</span>
                      <strong>{formatPlaytime(s.duration)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sessions-col">
              <h3>Last Launch Log</h3>
              <pre className="log-box">{logText || "No launch log recorded yet."}</pre>
            </div>
          </div>
        )}
      </main>

      <BottomPromptBar
        items={[
          {
            btn: "X",
            label: isGameRunning ? "Stop Game" : "Play Game",
            onClick: () => (isGameRunning ? stopRunning() : launchGame(game.id)),
          },
          {
            btn: "A",
            label: tab === "settings" ? "Edit / Toggle" : "Select",
          },
          ...(tab === "settings"
            ? ([
                {
                  btn: "Y",
                  label: "Reset Row to Default",
                  onClick: () => settingRows[settingIdx]?.onClear?.(),
                },
              ] as const)
            : []),
          {
            btn: "LB",
            label: "Prev Tab",
            onClick: () => setTabIdx((i) => (i - 1 + TABS.length) % TABS.length),
          },
          {
            btn: "RB",
            label: "Next Tab",
            onClick: () => setTabIdx((i) => (i + 1) % TABS.length),
          },
          { btn: "B", label: "Back", onClick: back },
        ]}
      />
    </div>
  );
};
