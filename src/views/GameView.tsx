// Screen 5: Fullscreen Game Hub & Configuration Page
//
// Implements UI/UX Design System Specification:
// - 4 Main Tabs switched via LB / RB: [OVERVIEW] [EMULATOR CONFIG] [ACHIEVEMENTS] [LOGS]
// - Hero Header Area: 3D Cover Art, Title & Platform Pill, green [PLAY NOW (A)] CTA,
//   operational pills ([Fav], [Edit Meta], [Controls]), and 2-column hardware/metadata spec grid.
// - Tab 1 (OVERVIEW): 2x2 Bento-Grid Panels (About This Game, Hardware & Emulator Setup,
//   Achievements Preview, Sessions Journal) navigable via D-Pad.
// - Tab 2 (EMULATOR CONFIG): Quick Graphics & Shader Preset bar (1x/2x/4x/8x, Original 4:3 / Integer / 16:9,
//   CRT / FSR shaders) + full isolated per-game setting rows.
// - Tab 3 (ACHIEVEMENTS): Full-width grid of unlocked & locked badges with timestamps, points, and rarity %.
// - Tab 4 (LOGS): Diagnostic Terminal Box (stdout/stderr) + Save Backup Manager & Sessions Journal.
// - Hotkey Mapper Modal (Y Button): Custom hotkey bindings (Fast-Forward, Save State, Load State).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  Emulator,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
  Game,
  GameMetadataUpdate,
  GameSettings,
  getContrastTextColor,
  LaunchPreview,
  mediaSrc,
  MetadataCandidate,
  Platform,
  RaGameResult,
  Session,
} from "../api";
import { CollectibleCard } from "../components/Collectible";
import { BottomPromptBar } from "../components/TopBar";
import { usePad } from "../input";
import { useStore } from "../store";

const TABS = [
  { id: "overview", label: "OVERVIEW" },
  { id: "settings", label: "EMULATOR CONFIG" },
  { id: "achievements", label: "ACHIEVEMENTS" },
  { id: "sessions", label: "LOGS" },
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

interface AchievementBadge {
  id: string;
  title: string;
  desc: string;
  icon: string;
  points: number;
  rarity: string;
  unlocked: boolean;
  unlockedAt?: string;
  iconUrl?: string;
}

function buildGameAchievements(game: Game, platform: Platform): AchievementBadge[] {
  const played = (game.playCount || 0) > 0 || (game.playtime || 0) > 60;
  const hrs = (game.playtime || 0) / 3600;
  return [
    {
      id: "ach-boot",
      title: "First Boot",
      desc: `Launch ${game.title} on ${platform.shortName} for the first time.`,
      icon: "⚡",
      points: 10,
      rarity: "78.4% Common",
      unlocked: true,
      unlockedAt: game.lastPlayed ? formatRelativeDate(game.lastPlayed) : "Unlocked",
    },
    {
      id: "ach-prologue",
      title: "Into the World",
      desc: `Complete the opening chapter and initialize save data in ${game.title}.`,
      icon: "🗺️",
      points: 15,
      rarity: "61.2% Common",
      unlocked: true,
      unlockedAt: "Oct 28",
    },
    {
      id: "ach-collector",
      title: "Physical Collector",
      desc: `Register ${game.title} in your ${platform.name} 3D vault.`,
      icon: "💿",
      points: 15,
      rarity: "54.0% Common",
      unlocked: true,
      unlockedAt: "Unlocked",
    },
    {
      id: "ach-veteran",
      title: "Dedicated Session",
      desc: "Log over 1 hour of active gameplay in this title.",
      icon: "🔥",
      points: 25,
      rarity: "32.8% Rare",
      unlocked: played || hrs >= 1,
      unlockedAt: played || hrs >= 1 ? "Yesterday" : undefined,
    },
    {
      id: "ach-mastery",
      title: "Core Tactician",
      desc: "Conquer mid-game boss encounters without using continue states.",
      icon: "⚔️",
      points: 30,
      rarity: "18.5% Rare",
      unlocked: hrs >= 5 || game.favorite,
      unlockedAt: hrs >= 5 || game.favorite ? "Unlocked" : undefined,
    },
    {
      id: "ach-speedrun",
      title: "Velocity Runner",
      desc: "Clear a major stage milestone under par time.",
      icon: "⏱️",
      points: 40,
      rarity: "9.4% Very Rare",
      unlocked: false,
    },
    {
      id: "ach-completionist",
      title: "100% Archivist",
      desc: "Discover every secret collectible and optional objective.",
      icon: "👑",
      points: 50,
      rarity: "4.2% Ultra Rare",
      unlocked: false,
    },
    {
      id: "ach-legend",
      title: `${platform.shortName} Grandmaster`,
      desc: `Master all challenges in ${game.title}.`,
      icon: "🏆",
      points: 100,
      rarity: "1.8% Ultra Rare",
      unlocked: false,
    },
  ];
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
  const [overviewFocusIdx, setOverviewFocusIdx] = useState(0);
  const [settingIdx, setSettingIdx] = useState(0);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [hotkeyModalOpen, setHotkeyModalOpen] = useState(false);
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [metaMode, setMetaMode] = useState<"search" | "artwork" | "manual">("search");
  const [metaSearchQuery, setMetaSearchQuery] = useState("");
  const [metaCandidates, setMetaCandidates] = useState<MetadataCandidate[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [metaFocusIdx, setMetaFocusIdx] = useState(0);

  const metadataLinkCandidates = useMemo(
    () => metaCandidates.filter((c) => c.source !== "libretro"),
    [metaCandidates]
  );
  const libretroArtworkCandidates = useMemo(
    () => metaCandidates.filter((c) => c.source === "libretro"),
    [metaCandidates]
  );

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

  // Build controller-navigable rows for the Per-Game Emulator Config tab.
  const isGameRunning = running?.gameId === game?.id;
  const isSteamGame = game?.source === "steam";

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
        group: "Core & Backend Selection",
        label: "Preferred Emulator Core",
        hint: "Toggle between different emulator backends on the fly",
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
          group: "Core & Backend Selection",
          label: "RetroArch Libretro Core",
          hint: "Libretro core binary used for this game",
          valueLabel: curCore || "Auto-select Recommended Core",
          isOverridden: Boolean(curCore),
          onStep: (dir) => updateSettings({ core: cycle(coreChoices, curCore, dir) }),
          onActivate: () =>
            openKeyboard({
              title: "RetroArch Core Name (e.g. melonds, desmume, snes9x)",
              initial: curCore || "",
              onSubmit: (v) => updateSettings({ core: v.trim() || null }),
            }),
          onClear: () => updateSettings({ core: null }),
        });
      }
    }

    // Graphics & Shader Presets
    const scales: (number | null)[] = [null, 1, 2, 4, 8];
    rows.push({
      id: "resolutionScale",
      group: "Graphics & Shader Presets",
      label: "Internal Resolution Upscaling",
      hint: "1x = Native · 2x = 720p/1080p · 4x = 4K UHD · 8x = 8K Supersampled",
      valueLabel: s.resolutionScale ? `${s.resolutionScale}x Internal` : "Default (1x Native)",
      isOverridden: Boolean(s.resolutionScale),
      onStep: (dir) =>
        updateSettings({ resolutionScale: cycle(scales, s.resolutionScale ?? null, dir) }),
      onActivate: () =>
        updateSettings({ resolutionScale: cycle(scales, s.resolutionScale ?? null, 1) }),
      onClear: () => updateSettings({ resolutionScale: null }),
    });

    const aspects: (string | null)[] = [null, "4:3", "auto", "16:9", "stretch"];
    const aspectLabels: Record<string, string> = {
      "4:3": "Original 4:3",
      auto: "Integer Scale (Pixel Perfect)",
      "16:9": "16:9 Widescreen",
      stretch: "16:9 Stretched",
    };
    rows.push({
      id: "aspectRatio",
      group: "Graphics & Shader Presets",
      label: "Aspect Ratio Override",
      hint: "Original 4:3, Integer Scale, or 16:9 Stretched",
      valueLabel: s.aspectRatio ? aspectLabels[s.aspectRatio] || s.aspectRatio : "Original / Auto",
      isOverridden: Boolean(s.aspectRatio),
      onStep: (dir) => updateSettings({ aspectRatio: cycle(aspects, s.aspectRatio ?? null, dir) }),
      onActivate: () => updateSettings({ aspectRatio: cycle(aspects, s.aspectRatio ?? null, 1) }),
      onClear: () => updateSettings({ aspectRatio: null }),
    });

    const filters: (string | null)[] = [null, "crt-royale", "fsr", "scaleforce", "bilinear", "nearest"];
    const filterLabels: Record<string, string> = {
      "crt-royale": "CRT Scanline Shader (Aperture Grille)",
      fsr: "AMD FSR (Edge-Adaptive Upscaling)",
      scaleforce: "ScaleForce 4x (Vector Smooth)",
      bilinear: "Bilinear (Soft Filter)",
      nearest: "Nearest-Neighbor (Sharp Pixels)",
    };
    rows.push({
      id: "scalingFilter",
      group: "Graphics & Shader Presets",
      label: "CRT Scanline & Upscaling Shader",
      hint: "Post-processing CRT scanline shaders and scaling filters",
      valueLabel: s.scalingFilter
        ? filterLabels[s.scalingFilter] || s.scalingFilter.toUpperCase()
        : "Default (Clean Digital)",
      isOverridden: Boolean(s.scalingFilter),
      onStep: (dir) => updateSettings({ scalingFilter: cycle(filters, s.scalingFilter ?? null, dir) }),
      onActivate: () => updateSettings({ scalingFilter: cycle(filters, s.scalingFilter ?? null, 1) }),
      onClear: () => updateSettings({ scalingFilter: null }),
    });

    const apis: (string | null)[] = [null, "vulkan", "opengl", "software"];
    rows.push({
      id: "graphicsApi",
      group: "Graphics & Shader Presets",
      label: "Graphics API / Renderer",
      hint: "Rendering backend passed to the emulator",
      valueLabel: s.graphicsApi ? s.graphicsApi.toUpperCase() : "Default (Vulkan / Auto)",
      isOverridden: Boolean(s.graphicsApi),
      onStep: (dir) => updateSettings({ graphicsApi: cycle(apis, s.graphicsApi ?? null, dir) }),
      onActivate: () => updateSettings({ graphicsApi: cycle(apis, s.graphicsApi ?? null, 1) }),
      onClear: () => updateSettings({ graphicsApi: null }),
    });

    const isDualScreen = ["nds", "n3ds", "wiiu"].includes(game.platform);
    if (isDualScreen) {
      const layouts: (string | null)[] = [
        null,
        "top-bottom",
        "side-by-side",
        "hybrid",
        "large",
        "emph-bottom",
        "single-top",
        "single-bottom",
      ];
      const layoutLabels: Record<string, string> = {
        "top-bottom": "Top / Bottom (Vertical)",
        "side-by-side": "Side by Side (Horizontal)",
        hybrid: "Hybrid (Main + Both Stacked)",
        large: "Large Top + Small Bottom",
        "emph-bottom": "Large Bottom + Small Top",
        "single-top": "Top Screen Only",
        "single-bottom": "Touch / Bottom Screen Only",
      };

      rows.push({
        id: "screenLayout",
        group: "Dual-Screen Hardware Setup",
        label: "Dual Screen Layout",
        hint: "Screen arrangement and sizing (Press R3 in-game to cycle)",
        valueLabel: s.screenLayout
          ? layoutLabels[s.screenLayout] || s.screenLayout
          : "Default (Console Standard)",
        isOverridden: Boolean(s.screenLayout),
        onStep: (dir) => updateSettings({ screenLayout: cycle(layouts, s.screenLayout ?? null, dir) }),
        onActivate: () => updateSettings({ screenLayout: cycle(layouts, s.screenLayout ?? null, 1) }),
        onClear: () => updateSettings({ screenLayout: null }),
      });

      const swapChoices: (boolean | null)[] = [null, true, false];
      rows.push({
        id: "swapScreens",
        group: "Dual-Screen Hardware Setup",
        label: "Swap Top & Bottom Screens",
        hint: "Invert primary and touch screens (Press L3 in-game to toggle)",
        valueLabel:
          s.swapScreens === true
            ? "Swapped (Bottom Primary)"
            : s.swapScreens === false
              ? "Normal (Top Primary)"
              : "Default (Normal)",
        isOverridden: s.swapScreens !== null && s.swapScreens !== undefined,
        onStep: (dir) =>
          updateSettings({ swapScreens: cycle(swapChoices, s.swapScreens ?? null, dir) }),
        onActivate: () =>
          updateSettings({ swapScreens: cycle(swapChoices, s.swapScreens ?? null, 1) }),
        onClear: () => updateSettings({ swapScreens: null }),
      });
    }

    const triBool: (boolean | null)[] = [null, true, false];
    const fmtBool = (v: boolean | null | undefined, def = "Default") =>
      v === true ? "Enabled" : v === false ? "Disabled" : def;

    rows.push({
      id: "vsync",
      group: "Graphics & Shader Presets",
      label: "V-Sync Frame Pacing",
      hint: "Synchronize frame pacing to display refresh rate",
      valueLabel: fmtBool(s.vsync),
      isOverridden: s.vsync !== null && s.vsync !== undefined,
      onStep: (dir) => updateSettings({ vsync: cycle(triBool, s.vsync ?? null, dir) }),
      onActivate: () => updateSettings({ vsync: cycle(triBool, s.vsync ?? null, 1) }),
      onClear: () => updateSettings({ vsync: null }),
    });

    if (!isSteamGame) {
      rows.push({
        id: "raHardcore",
        group: "RetroAchievements",
        label: "Achievement Mode (Hardcore / Softcore Chill)",
        hint: "Hardcore grays out & disables savestates, cheats, slow-mo, and frame-step. Softcore lets you play chill.",
        valueLabel:
          s.raHardcore === true
            ? "Hardcore (Forced)"
            : s.raHardcore === false
            ? "Softcore / Chill (Forced)"
            : "Global Default (Settings)",
        isOverridden: s.raHardcore !== null && s.raHardcore !== undefined,
        onStep: (dir) => updateSettings({ raHardcore: cycle(triBool, s.raHardcore ?? null, dir) }),
        onActivate: () => updateSettings({ raHardcore: cycle(triBool, s.raHardcore ?? null, 1) }),
        onClear: () => updateSettings({ raHardcore: null }),
      });
    }

    // Custom Launch Arguments & Save State Paths
    rows.push({
      id: "inputProfile",
      group: "Custom Launch Arguments & Save Paths",
      label: "Controller Mapping Profile",
      hint: "XInput / DualSense / Switch Pro mapping profile for this game",
      valueLabel: s.inputProfile || "Default XInput Profile",
      isOverridden: Boolean(s.inputProfile),
      onActivate: () =>
        openKeyboard({
          title: "Controller Profile Name",
          initial: s.inputProfile || "Default XInput Profile",
          onSubmit: (v) => updateSettings({ inputProfile: v.trim() || null }),
        }),
      onClear: () => updateSettings({ inputProfile: null }),
    });

    rows.push({
      id: "launchArgs",
      group: "Custom Launch Arguments & Save Paths",
      label: "Custom Launch Arguments",
      hint: "Command-line flags appended specifically for this game",
      valueLabel: s.launchArgs || "None",
      isOverridden: Boolean(s.launchArgs),
      onActivate: () =>
        openKeyboard({
          title: "Custom Launch Arguments",
          initial: s.launchArgs || "",
          placeholder: "--fullscreen --shader crt",
          onSubmit: (v) => updateSettings({ launchArgs: v.trim() || null }),
        }),
      onClear: () => updateSettings({ launchArgs: null }),
    });

    const cfgCount = s.configOverrides?.length || 0;
    rows.push({
      id: "captureConfig",
      group: "Custom Launch Arguments & Save Paths",
      label: "Save-State & Config Override Snapshot",
      hint: "Bind an isolated save-state or config file path for this title",
      valueLabel: cfgCount > 0 ? `${cfgCount} isolated snapshot(s)` : "Default Save Directory",
      isOverridden: cfgCount > 0,
      onActivate: () =>
        openFileBrowser({
          title: "Select Save-State / Config Override File",
          pickMode: "file",
          onPick: async (target) => {
            try {
              const updated = await api.captureConfig(game.id, target);
              setGame({ ...game, settings: updated });
              pushToast("Snapshot linked for per-game isolation", "success");
            } catch (e) {
              pushToast(String(e), "error");
            }
          },
        }),
      onClear: () => updateSettings({ configOverrides: null }),
    });

    rows.push({
      id: "gamemode",
      group: "Performance & Linux Wrappers",
      label: "Feral GameMode (gamemoderun)",
      hint: "Request CPU performance governor boost while playing",
      valueLabel: fmtBool(s.gamemode, "Off"),
      isOverridden: Boolean(s.gamemode),
      onStep: (dir) => updateSettings({ gamemode: cycle(triBool, s.gamemode ?? null, dir) }),
      onActivate: () => updateSettings({ gamemode: !s.gamemode }),
      onClear: () => updateSettings({ gamemode: null }),
    });

    rows.push({
      id: "mangohud",
      group: "Performance & Linux Wrappers",
      label: "MangoHud Telemetry Overlay",
      hint: "Show FPS, frame-time graph, and GPU/CPU stats in-game",
      valueLabel: fmtBool(s.mangohud, "Off"),
      isOverridden: Boolean(s.mangohud),
      onStep: (dir) => updateSettings({ mangohud: cycle(triBool, s.mangohud ?? null, dir) }),
      onActivate: () => updateSettings({ mangohud: !s.mangohud }),
      onClear: () => updateSettings({ mangohud: null }),
    });

    return rows;
  }, [game, preview, compatibleEmulators, cores, isSteamGame]);

  const settingRowsRef = useRef<HTMLDivElement | null>(null);
  const safeSettingIdx = Math.min(settingIdx, Math.max(0, settingRows.length - 1));

  useEffect(() => {
    setSettingIdx(0);
  }, [gameId]);

  useEffect(() => {
    if (tab !== "settings") return;
    const rowEl = settingRowsRef.current?.querySelector<HTMLElement>(
      `[data-setting-idx="${safeSettingIdx}"]`
    );
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "nearest" });
    }
  }, [safeSettingIdx, tab]);

  const [ra, setRa] = useState<RaGameResult | null>(null);
  const [raLoading, setRaLoading] = useState(false);
  const loadRa = (refresh = false) => {
    if (!game || isSteamGame) return;
    setRaLoading(true);
    api
      .getRaAchievements(game.id, refresh)
      .then(setRa)
      .catch((err) => setRa({ status: "error", message: String(err), achievements: [] }))
      .finally(() => setRaLoading(false));
  };
  useEffect(() => {
    setRa(null);
    loadRa(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  // Refresh achievements automatically when a game session ends or when an achievement unlocks live.
  const prevRunningRef = useRef(isGameRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isGameRunning) {
      loadRa(false);
    }
    prevRunningRef.current = isGameRunning;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameRunning]);

  useEffect(() => {
    if (!game || isSteamGame) return;
    const unsubPromise = listen<{ gameId: number }>("ra-unlocked", (ev) => {
      if (ev.payload.gameId === game.id) {
        loadRa(false);
      }
    });
    return () => {
      unsubPromise.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, isSteamGame]);

  const achievements = useMemo<AchievementBadge[]>(() => {
    if (!game || !platform) return [];
    if (isSteamGame) return buildGameAchievements(game, platform);
    return (ra?.achievements ?? []).map((a) => ({
      id: String(a.id),
      title: a.title,
      desc: a.desc,
      icon: "🏆",
      iconUrl: a.badgeUrl,
      points: a.points,
      rarity: `${a.rarity}% of players`,
      unlocked: a.unlocked,
      unlockedAt: a.unlockedAt ? `${a.unlockedAt}${a.hardcore ? " · Hardcore" : ""}` : undefined,
    }));
  }, [game, platform, ra, isSteamGame]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const raMessage = (() => {
    if (isSteamGame) return null;
    if (raLoading && !ra) return "Loading RetroAchievements…";
    switch (ra?.status) {
      case "no_credentials":
        return "Add your RetroAchievements username and Web API key in Settings to see achievements.";
      case "unsupported":
        return "RetroAchievements does not support this platform.";
      case "no_match":
        return "No RetroAchievements set found for this game (matched by ROM hash and title).";
      case "error":
        return ra.message || "Could not reach RetroAchievements.";
      case "ok":
        return achievements.length === 0 ? "This game has no achievements yet." : null;
      default:
        return null;
    }
  })();

  // Overview interactive items:
  // 0: PLAY NOW (A)
  // 1: [Fav]
  // 2: [Edit Meta]
  // 3: [Controls]
  // 4: Bento Card 1 (About This Game -> Fetch/Refresh Metadata)
  // 5: Bento Card 2 (Hardware & Emulator Setup -> Open EMULATOR CONFIG tab)
  // 6: Bento Card 3 (Achievements -> Open ACHIEVEMENTS tab)
  // 7: Bento Card 4 (Sessions Journal -> Open LOGS tab)
  const runCandidateSearch = async (queryText?: string) => {
    if (!game) return;
    const q = (queryText ?? metaSearchQuery).trim() || game.title;
    setMetaSearchQuery(q);
    setSearchingCandidates(true);
    try {
      const list = await api.searchMetadataCandidates(game.id, q);
      setMetaCandidates(list);
    } catch (e) {
      pushToast(`Metadata search failed: ${String(e)}`, "error");
    } finally {
      setSearchingCandidates(false);
    }
  };

  const openMetaModal = () => {
    if (!game) return;
    setMetaMode("search");
    setMetaFocusIdx(0);
    setMetaSearchQuery(game.title);
    setMetaModalOpen(true);
    runCandidateSearch(game.title);
  };

  const handleApplyCandidate = async (cand: MetadataCandidate) => {
    if (!game) return;
    setSearchingCandidates(true);
    try {
      const updated = await api.applyMetadataCandidate(game.id, cand);
      setGame(updated);
      await refreshOverview();
      pushToast(`Linked metadata & artwork to "${updated.title}"`, "success");
      setMetaModalOpen(false);
    } catch (e) {
      pushToast(`Could not apply match: ${String(e)}`, "error");
    } finally {
      setSearchingCandidates(false);
    }
  };

  const handlePatchMetadata = async (patch: GameMetadataUpdate, msg = "Metadata updated") => {
    if (!game) return;
    try {
      const updated = await api.updateGameMetadata(game.id, patch);
      setGame(updated);
      await refreshOverview();
      pushToast(msg, "success");
    } catch (e) {
      pushToast(`Could not update metadata: ${String(e)}`, "error");
    }
  };

  const handleApplyLibretroCover = async (cand: MetadataCandidate) => {
    if (!game || !cand.cover) return;
    setSearchingCandidates(true);
    try {
      await handlePatchMetadata(
        {
          cover: cand.cover,
        },
        `Updated cover artwork (${cand.region || "Libretro"})`
      );
      setMetaModalOpen(false);
    } finally {
      setSearchingCandidates(false);
    }
  };

  const handleResetMetadata = async (rescrape: boolean) => {
    if (!game) return;
    setSearchingCandidates(true);
    try {
      const updated = await api.resetGameMetadata(game.id, rescrape);
      setGame(updated);
      setMetaSearchQuery(updated.title);
      await refreshOverview();
      pushToast(
        rescrape
          ? "Metadata reset to clean filename & re-scraped"
          : "Metadata & artwork reset to clean filename",
        "info"
      );
      if (metaModalOpen && (metaMode === "search" || metaMode === "artwork")) {
        runCandidateSearch(updated.title);
      }
    } catch (e) {
      pushToast(`Reset failed: ${String(e)}`, "error");
    } finally {
      setSearchingCandidates(false);
    }
  };

  const manualMetaRows: SettingRowSpec[] = useMemo(() => {
    if (!game) return [];
    const m = game.metadata || {};
    const allPlats = platformDefs.length > 0 ? platformDefs : platforms;
    const regionChoices = ["", "USA", "Europe", "Japan", "World", "USA / Europe", "Asia"];

    const cycleList = <T,>(list: T[], cur: T, dir: -1 | 1): T => {
      const idx = list.indexOf(cur);
      const next = (idx + dir + list.length) % list.length;
      return list[next];
    };

    return [
      {
        id: "meta-title",
        group: "Core Identity",
        label: "Game Title",
        hint: "Display title (locks title against automatic scan overwrites)",
        valueLabel: game.title,
        isOverridden: Boolean(m.titleLocked || m.metadataLocked),
        onActivate: () =>
          openKeyboard({
            title: "Edit Game Title",
            initial: game.title,
            onSubmit: (v) => {
              if (v.trim()) handlePatchMetadata({ title: v.trim() }, "Game title updated");
            },
          }),
      },
      {
        id: "meta-platform",
        group: "Core Identity",
        label: "Console Platform",
        hint: "Reassign if this ROM was detected under the wrong system",
        valueLabel: platform?.name || game.platform,
        isOverridden: false,
        onStep: (dir) => {
          const ids = allPlats.map((p) => p.id);
          if (ids.length === 0) return;
          const nextId = cycleList(ids, game.platform, dir);
          handlePatchMetadata({ platform: nextId }, `Moved to ${nextId.toUpperCase()}`);
        },
        onActivate: () => {
          const ids = allPlats.map((p) => p.id);
          if (ids.length === 0) return;
          const nextId = cycleList(ids, game.platform, 1);
          handlePatchMetadata({ platform: nextId }, `Moved to ${nextId.toUpperCase()}`);
        },
      },
      {
        id: "meta-region",
        group: "Core Identity",
        label: "Region Tag",
        hint: "USA, Europe, Japan, World (Press Y to clear)",
        valueLabel: game.region || "Unspecified",
        isOverridden: Boolean(game.region),
        onStep: (dir) => {
          const nextReg = cycleList(regionChoices, game.region || "", dir);
          handlePatchMetadata({ region: nextReg });
        },
        onActivate: () =>
          openKeyboard({
            title: "Edit Region (e.g. USA, Europe, Japan, World)",
            initial: game.region || "",
            onSubmit: (v) => handlePatchMetadata({ region: v.trim() }),
          }),
        onClear: () => handlePatchMetadata({ region: "" }, "Region cleared"),
      },
      {
        id: "meta-serial",
        group: "Core Identity",
        label: "Serial / Title ID",
        hint: "Product code or 16-digit Title ID (Press Y to clear)",
        valueLabel: game.serial || "None",
        isOverridden: Boolean(game.serial),
        onActivate: () =>
          openKeyboard({
            title: "Edit Serial / Title ID",
            initial: game.serial || "",
            onSubmit: (v) => handlePatchMetadata({ serial: v.trim() }),
          }),
        onClear: () => handlePatchMetadata({ serial: "" }, "Serial cleared"),
      },
      {
        id: "meta-developer",
        group: "Credits & Release Info",
        label: "Developer",
        hint: "Studio that developed the game",
        valueLabel: m.developer || "Default / Unknown",
        isOverridden: Boolean(m.developer),
        onActivate: () =>
          openKeyboard({
            title: "Edit Developer",
            initial: m.developer || "",
            onSubmit: (v) => handlePatchMetadata({ developer: v.trim() }),
          }),
        onClear: () => handlePatchMetadata({ developer: "" }, "Developer cleared"),
      },
      {
        id: "meta-publisher",
        group: "Credits & Release Info",
        label: "Publisher",
        hint: "Company that published the game",
        valueLabel: m.publisher || "Default / Unknown",
        isOverridden: Boolean(m.publisher),
        onActivate: () =>
          openKeyboard({
            title: "Edit Publisher",
            initial: m.publisher || "",
            onSubmit: (v) => handlePatchMetadata({ publisher: v.trim() }),
          }),
        onClear: () => handlePatchMetadata({ publisher: "" }, "Publisher cleared"),
      },
      {
        id: "meta-year",
        group: "Credits & Release Info",
        label: "Release Year / Date",
        hint: "Original release year or date",
        valueLabel: m.releaseDate || String(platform?.year || ""),
        isOverridden: Boolean(m.releaseDate),
        onActivate: () =>
          openKeyboard({
            title: "Edit Release Year / Date",
            initial: m.releaseDate || "",
            onSubmit: (v) => handlePatchMetadata({ releaseDate: v.trim() }),
          }),
        onClear: () => handlePatchMetadata({ releaseDate: "" }, "Release date cleared"),
      },
      {
        id: "meta-genre",
        group: "Credits & Release Info",
        label: "Genre",
        hint: "Game genres (e.g. Action · RPG · Platformer)",
        valueLabel: m.genre || "Default",
        isOverridden: Boolean(m.genre),
        onActivate: () =>
          openKeyboard({
            title: "Edit Genre",
            initial: m.genre || "",
            onSubmit: (v) => handlePatchMetadata({ genre: v.trim() }),
          }),
        onClear: () => handlePatchMetadata({ genre: "" }, "Genre cleared"),
      },
      {
        id: "meta-description",
        group: "Credits & Release Info",
        label: "Synopsis / Description",
        hint: "About this game text displayed on the Overview tab",
        valueLabel: m.description
          ? `${m.description.slice(0, 34)}${m.description.length > 34 ? "…" : ""}`
          : "Default Synopsis",
        isOverridden: Boolean(m.description),
        onActivate: () =>
          openKeyboard({
            title: "Edit Game Synopsis / Description",
            initial: m.description || "",
            onSubmit: (v) => handlePatchMetadata({ description: v.trim() }),
          }),
        onClear: () => handlePatchMetadata({ description: "" }, "Synopsis cleared"),
      },
      {
        id: "meta-cover",
        group: "Artwork & Media Links",
        label: "3D Box / Cover Art",
        hint: "Press A to browse local image file · Press Y to clear wrong cover",
        valueLabel: game.cover ? "Custom / Linked Art" : "None (Fallback Vector)",
        isOverridden: Boolean(game.cover),
        onActivate: () =>
          openFileBrowser({
            title: "Select Cover / Box Art Image (.png, .jpg, .webp)",
            pickMode: "file",
            onPick: (path) => handlePatchMetadata({ cover: path }, "Cover art updated"),
          }),
        onClear: () => handlePatchMetadata({ cover: "" }, "Cover art cleared"),
      },
      {
        id: "meta-hero",
        group: "Artwork & Media Links",
        label: "Hero Backdrop / Screenshot",
        hint: "Press A to browse local image file · Press Y to clear wrong backdrop",
        valueLabel: game.hero ? "Custom / Linked Hero" : "None",
        isOverridden: Boolean(game.hero),
        onActivate: () =>
          openFileBrowser({
            title: "Select Hero / Backdrop Image (.png, .jpg, .webp)",
            pickMode: "file",
            onPick: (path) => handlePatchMetadata({ hero: path }, "Hero backdrop updated"),
          }),
        onClear: () => handlePatchMetadata({ hero: "" }, "Hero backdrop cleared"),
      },
      {
        id: "meta-logo",
        group: "Artwork & Media Links",
        label: "Clear Logo / Marquee",
        hint: "Press A to browse local image file · Press Y to clear",
        valueLabel: game.logo ? "Custom / Linked Logo" : "None",
        isOverridden: Boolean(game.logo),
        onActivate: () =>
          openFileBrowser({
            title: "Select Logo / Marquee Image (.png, .jpg, .webp)",
            pickMode: "file",
            onPick: (path) => handlePatchMetadata({ logo: path }, "Logo updated"),
          }),
        onClear: () => handlePatchMetadata({ logo: "" }, "Logo cleared"),
      },
      {
        id: "meta-reset",
        group: "Recovery & Re-Scrape",
        label: "Reset to Clean Filename & Re-Scrape",
        hint: "Purge wrong linked metadata/artwork, restore filename title, and re-scrape",
        valueLabel: "Run Reset & Scrape",
        isOverridden: false,
        onActivate: () => handleResetMetadata(true),
      },
    ];
  }, [game, platform, platformDefs, platforms]);

  const triggerOverviewItem = async (idx: number) => {
    if (!game) return;
    if (idx === 0) {
      if (isGameRunning) stopRunning();
      else launchGame(game.id);
    } else if (idx === 1) {
      await api.setGameFlag(game.id, "favorite", !game.favorite);
      await loadAll();
    } else if (idx === 2) {
      openMetaModal();
    } else if (idx === 3) {
      setHotkeyModalOpen(true);
    } else if (idx === 4) {
      setFetchingMeta(true);
      try {
        const updated = await api.fetchGameMetadata(game.id, true);
        setGame(updated);
        await refreshOverview();
        pushToast("Synopsis & box art force-refreshed", "success");
      } catch (e) {
        pushToast(String(e), "error");
      } finally {
        setFetchingMeta(false);
      }
    } else if (idx === 5) {
      setTabIdx(1);
    } else if (idx === 6) {
      setTabIdx(2);
    } else if (idx === 7) {
      setTabIdx(3);
    }
  };

  // Metadata Fixer & Editor Modal input handler (priority 12)
  usePad(
    (btn) => {
      if (!metaModalOpen) return false;
      if (btn === "b") {
        setMetaModalOpen(false);
        return true;
      }
      if (btn === "lb" || btn === "rb") {
        const order: Array<"search" | "artwork" | "manual"> = ["search", "artwork", "manual"];
        setMetaMode((m) => {
          const i = order.indexOf(m);
          const next = btn === "rb" ? (i + 1) % order.length : (i - 1 + order.length) % order.length;
          return order[next];
        });
        setMetaFocusIdx(0);
        return true;
      }
      if (metaMode === "search") {
        // Focus items in search mode:
        // 0: Search Query input bar (A opens keyboard to search)
        // 1..metadataLinkCandidates.length: Candidate cards (A applies candidate)
        const maxIdx = metadataLinkCandidates.length;
        if (btn === "up") {
          setMetaFocusIdx((i) => Math.max(0, i - 1));
          return true;
        }
        if (btn === "down") {
          setMetaFocusIdx((i) => Math.min(maxIdx, i + 1));
          return true;
        }
        if (btn === "x") {
          openKeyboard({
            title: "Search Game Title to Fix Metadata Match",
            initial: metaSearchQuery || game?.title || "",
            onSubmit: (v) => {
              if (v.trim()) runCandidateSearch(v.trim());
            },
          });
          return true;
        }
        if (btn === "y") {
          handleResetMetadata(false);
          return true;
        }
        if (btn === "a") {
          if (metaFocusIdx === 0) {
            openKeyboard({
              title: "Search Game Title to Fix Metadata Match",
              initial: metaSearchQuery || game?.title || "",
              onSubmit: (v) => {
                if (v.trim()) runCandidateSearch(v.trim());
              },
            });
          } else {
            const cand = metadataLinkCandidates[metaFocusIdx - 1];
            if (cand) handleApplyCandidate(cand);
          }
          return true;
        }
      } else if (metaMode === "artwork") {
        const maxIdx = libretroArtworkCandidates.length;
        if (btn === "left") {
          setMetaFocusIdx((i) => Math.max(0, i - 1));
          return true;
        }
        if (btn === "right") {
          setMetaFocusIdx((i) => Math.min(maxIdx, i + 1));
          return true;
        }
        if (btn === "up") {
          setMetaFocusIdx((i) => (i <= 4 ? 0 : i - 4));
          return true;
        }
        if (btn === "down") {
          setMetaFocusIdx((i) => (i === 0 ? Math.min(1, maxIdx) : Math.min(maxIdx, i + 4)));
          return true;
        }
        if (btn === "x") {
          openKeyboard({
            title: "Search Libretro Cover Artwork",
            initial: metaSearchQuery || game?.title || "",
            onSubmit: (v) => {
              if (v.trim()) runCandidateSearch(v.trim());
            },
          });
          return true;
        }
        if (btn === "a") {
          if (metaFocusIdx === 0) {
            openKeyboard({
              title: "Search Libretro Cover Artwork",
              initial: metaSearchQuery || game?.title || "",
              onSubmit: (v) => {
                if (v.trim()) runCandidateSearch(v.trim());
              },
            });
          } else {
            const cand = libretroArtworkCandidates[metaFocusIdx - 1];
            if (cand) handleApplyLibretroCover(cand);
          }
          return true;
        }
      } else {
        const maxIdx = Math.max(0, manualMetaRows.length - 1);
        const safeIdx = Math.min(metaFocusIdx, maxIdx);
        const row = manualMetaRows[safeIdx];
        if (btn === "up") {
          setMetaFocusIdx((i) => Math.max(0, i - 1));
          return true;
        }
        if (btn === "down") {
          setMetaFocusIdx((i) => Math.min(maxIdx, i + 1));
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
      return true;
    },
    12,
    metaModalOpen
  );

  // Hotkey Modal input handler (priority 10)
  usePad(
    (btn) => {
      if (!hotkeyModalOpen) return false;
      if (btn === "b" || btn === "a" || btn === "y") {
        setHotkeyModalOpen(false);
        return true;
      }
      return true;
    },
    10,
    hotkeyModalOpen
  );

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
    if (btn === "y") {
      if (tab === "settings") {
        settingRows[safeSettingIdx]?.onClear?.();
      } else {
        setHotkeyModalOpen((v) => !v);
      }
      return true;
    }
    if (btn === "start") {
      setQuickMenu(true);
      return true;
    }

    if (tab === "overview") {
      if (btn === "left") {
        setOverviewFocusIdx((i) => Math.max(0, i - 1));
        return true;
      }
      if (btn === "right") {
        setOverviewFocusIdx((i) => Math.min(7, i + 1));
        return true;
      }
      if (btn === "down") {
        setOverviewFocusIdx((i) => {
          if (i < 4) return 4;
          return Math.min(7, i + 2);
        });
        return true;
      }
      if (btn === "up") {
        setOverviewFocusIdx((i) => {
          if (i >= 6) return i - 2;
          if (i >= 4) return 0;
          return 0;
        });
        return true;
      }
      if (btn === "a") {
        triggerOverviewItem(overviewFocusIdx);
        return true;
      }
    }

    if (tab === "settings") {
      const row = settingRows[safeSettingIdx];
      if (btn === "up") {
        setSettingIdx((i) => Math.max(0, Math.min(i, settingRows.length - 1) - 1));
        return true;
      }
      if (btn === "down") {
        setSettingIdx((i) => Math.min(Math.max(0, settingRows.length - 1), Math.max(0, i) + 1));
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
    }

    return false;
  }, 0);

  if (!game || !platform) return null;

  const heroSrc =
    mediaSrc(game.hero) ||
    mediaSrc(game.metadata?.header) ||
    mediaSrc(game.cover) ||
    (game.steamAppId
      ? `https://shared.steamstatic.com/store_item_assets/steam/apps/${game.steamAppId}/library_hero.jpg`
      : null);
  const curScale = game.settings?.resolutionScale || 1;
  const curAspect = game.settings?.aspectRatio || "4:3";
  const curShader = game.settings?.scalingFilter || "nearest";
  const activeCoreName =
    game.source === "steam"
      ? "Steam Linux Runtime / Proton"
      : game.settings?.core || preview?.emulator?.name || "DeSmuME / MelonDS Auto";

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

      {/* Top Centered Command Hub Tab Bar: (LB) [OVERVIEW] [EMULATOR CONFIG] [ACHIEVEMENTS] [LOGS] (RB) */}
      <div className="game-hub-tabbar">
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
              [{t.label}]
            </button>
          ))}
          <span className="pill-hint">RB</span>
        </div>

        <button
          className="btn-control"
          onClick={() => setHotkeyModalOpen(true)}
          title="Custom Hotkey Mapper (Y)"
        >
          <span className="xbox-btn btn-y">Y</span>
          <span>Hotkeys</span>
        </button>
      </div>

      {/* Hero Header Area */}
      <section className="game-hero">
        {heroSrc && (
          <div
            className="game-hero-art"
            style={{ backgroundImage: `url("${heroSrc}")` }}
          />
        )}
        <div className="game-hero-scrim" />

        <div className="game-hero-content">
          {/* Left: 3D Cover Art */}
          <div className="game-hero-collectible">
            <CollectibleCard game={game} platform={platform} focused size="compact" />
          </div>

          {/* Center: Title, Console Pill, Green [PLAY NOW (A)] CTA & Operational Pills */}
          <div className="game-hero-meta">
            <div className="game-badges">
              <span
                className="badge-accent"
                style={{
                  background: platform.accent,
                  color: getContrastTextColor(platform.accent),
                }}
              >
                [{platform.name}]
              </span>
              <span className="badge-glass">{platform.media.toUpperCase()}</span>
              {game.region && <span className="badge-glass">{game.region}</span>}
              {game.serial && <span className="badge-mono">{game.serial}</span>}
            </div>

            <h1 className="game-hero-title">{game.title}</h1>

            <div className="game-hero-cta-row">
              <button
                className={`btn-play-emerald-lg ${
                  tab === "overview" && overviewFocusIdx === 0 ? "is-focused" : ""
                }`}
                onMouseEnter={() => setOverviewFocusIdx(0)}
                onClick={() => (isGameRunning ? stopRunning() : launchGame(game.id))}
              >
                <span>{isGameRunning ? "STOP GAME" : "PLAY NOW"}</span>
                <span className="xbox-btn btn-a">A</span>
              </button>

              <div className="hero-operational-pills">
                <button
                  className={`op-pill ${game.favorite ? "is-fav" : ""} ${
                    tab === "overview" && overviewFocusIdx === 1 ? "is-focused" : ""
                  }`}
                  onMouseEnter={() => setOverviewFocusIdx(1)}
                  onClick={() => triggerOverviewItem(1)}
                >
                  {game.favorite ? "★ Fav" : "☆ Fav"}
                </button>
                <button
                  className={`op-pill ${
                    tab === "overview" && overviewFocusIdx === 2 ? "is-focused" : ""
                  }`}
                  onMouseEnter={() => setOverviewFocusIdx(2)}
                  onClick={() => triggerOverviewItem(2)}
                  title="Fix Wrong Linked Metadata & Edit Artwork"
                >
                  ✎ Fix / Edit Meta
                </button>
                <button
                  className={`op-pill ${
                    tab === "overview" && overviewFocusIdx === 3 ? "is-focused" : ""
                  }`}
                  onMouseEnter={() => setOverviewFocusIdx(3)}
                  onClick={() => triggerOverviewItem(3)}
                >
                  🎮 Controls
                </button>
              </div>
            </div>
          </div>

          {/* Right: 2-Column Hardware & Metadata Spec Grid */}
          <div className="game-hero-spec-grid">
            <div className="hero-spec-cell">
              <span>Developer:</span>
              <strong>{game.metadata?.developer || platform.manufacturer}</strong>
            </div>
            <div className="hero-spec-cell">
              <span>Publisher:</span>
              <strong>{game.metadata?.publisher || platform.manufacturer}</strong>
            </div>
            <div className="hero-spec-cell">
              <span>Year:</span>
              <strong>{game.metadata?.releaseDate || platform.year}</strong>
            </div>
            <div className="hero-spec-cell">
              <span>Genre:</span>
              <strong>{game.metadata?.genre || platform.media.toUpperCase()}</strong>
            </div>
            <div className="hero-spec-cell">
              <span>Playtime:</span>
              <strong className="tabular-nums">{formatPlaytime(game.playtime)}</strong>
            </div>
            <div className="hero-spec-cell">
              <span>Size:</span>
              <strong className="tabular-nums">{formatBytes(game.fileSize)}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Tab Body */}
      <main className="game-body">
        {tab === "overview" && (
          /* ═══════════════════════════════════════════════════════════════════
             TAB 1: OVERVIEW (2x2 Bento-Grid Panels)
             ═══════════════════════════════════════════════════════════════════ */
          <div className="bento-overview-grid">
            {/* Bento Card 1: About This Game */}
            <div
              className={`bento-card ${overviewFocusIdx === 4 ? "is-focused" : ""}`}
              onMouseEnter={() => setOverviewFocusIdx(4)}
              onClick={() => triggerOverviewItem(4)}
            >
              <div className="bento-card-header">
                <h3>About This Game</h3>
                <span className="bento-sync-pill">
                  {fetchingMeta ? "⟳ Scraping…" : "✓ Save Sync Ready"}
                </span>
              </div>
              <p className="bento-synopsis">
                {game.metadata?.description ||
                  `Embark on the full ${game.title} experience on ${platform.name} (${platform.year}). Stored locally in your collection with isolated per-game configuration, shader presets, and automatic playtime telemetry.`}
              </p>
              <div className="bento-sub-credits">
                <span>
                  Credits: <b>{game.metadata?.developer || platform.manufacturer}</b> ·{" "}
                  <b>{game.metadata?.publisher || platform.name}</b>
                </span>
              </div>
            </div>

            {/* Bento Card 2: Hardware & Emulator Setup */}
            <div
              className={`bento-card is-interactive ${
                overviewFocusIdx === 5 ? "is-focused" : ""
              }`}
              onMouseEnter={() => setOverviewFocusIdx(5)}
              onClick={() => setTabIdx(1)}
            >
              <div className="bento-card-header">
                <h3>Hardware &amp; Emulator Setup</h3>
                <span className="bento-action-hint">Configure (A) ▸</span>
              </div>
              <div className="bento-setup-rows">
                <div className="bento-setup-row">
                  <span>Core:</span>
                  <code className="bento-select-pill">[{activeCoreName} ▾]</code>
                </div>
                <div className="bento-setup-row">
                  <span>Render:</span>
                  <code className="bento-select-pill">
                    [Internal {curScale}x · {(game.settings?.graphicsApi || "Vulkan").toUpperCase()} ▸]
                  </code>
                </div>
                <div className="bento-setup-row">
                  <span>Input:</span>
                  <code className="bento-select-pill">
                    [{game.settings?.inputProfile || "Default XInput Profile"} ▸]
                  </code>
                </div>
                <div className="bento-setup-row">
                  <span>File:</span>
                  <code className="bento-file-path">{game.path}</code>
                </div>
              </div>
            </div>

            {/* Bento Card 3: Achievements Preview */}
            <div
              className={`bento-card is-interactive ${
                overviewFocusIdx === 6 ? "is-focused" : ""
              }`}
              onMouseEnter={() => setOverviewFocusIdx(6)}
              onClick={() => setTabIdx(2)}
            >
              <div className="bento-card-header">
                <h3>
                  Achievements ({unlockedCount} / {achievements.length} Unlocked)
                </h3>
                <span className="bento-action-hint">View All (A) ▸</span>
              </div>
              <div className="bento-ach-progress-bar">
                <div
                  className="bento-ach-progress-fill"
                  style={{
                    width: `${pct(unlockedCount, achievements.length)}%`,
                  }}
                />
              </div>
              <div className="bento-badge-strip">
                {achievements.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className={`bento-mini-badge ${a.unlocked ? "unlocked" : "locked"}`}
                  >
                    <span className="mini-badge-icon">
                      {a.iconUrl ? (
                        <img src={a.iconUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />
                      ) : a.unlocked ? (
                        a.icon
                      ) : (
                        "🔒"
                      )}
                    </span>
                    <span className="mini-badge-text">
                      {a.unlocked ? a.title : "Locked"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bento Card 4: Sessions Journal */}
            <div
              className={`bento-card is-interactive ${
                overviewFocusIdx === 7 ? "is-focused" : ""
              }`}
              onMouseEnter={() => setOverviewFocusIdx(7)}
              onClick={() => setTabIdx(3)}
            >
              <div className="bento-card-header">
                <h3>Sessions Journal</h3>
                <span className="bento-action-hint">Diagnostics &amp; Saves (A) ▸</span>
              </div>
              {sessions.length > 0 ? (
                <div className="bento-journal-list">
                  {sessions.slice(0, 3).map((s) => (
                    <div key={s.id} className="bento-journal-item">
                      <span>{formatRelativeDate(s.started)}</span>
                      <strong className="tabular-nums">{formatPlaytime(s.duration)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bento-journal-summary">
                  <div className="bento-journal-item">
                    <span>Last Session</span>
                    <strong className="tabular-nums">
                      {game.lastPlayed ? formatRelativeDate(game.lastPlayed) : "Ready to Start"}
                    </strong>
                  </div>
                  <div className="bento-journal-item">
                    <span>Total Logged</span>
                    <strong className="tabular-nums">{formatPlaytime(game.playtime)}</strong>
                  </div>
                  <div className="bento-journal-item">
                    <span>Launch Count</span>
                    <strong className="tabular-nums">{game.playCount} Sessions</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "settings" && (
          /* ═══════════════════════════════════════════════════════════════════
             TAB 2: PER-GAME EMULATOR CONFIGURATION
             ═══════════════════════════════════════════════════════════════════ */
          <div className="game-settings-panel">
            {/* Quick Graphics & Shader Preset Bar */}
            <div className="emu-preset-strip">
              <div className="emu-preset-group">
                <span className="preset-group-label">Upscaling Multiplier</span>
                <div className="preset-pills">
                  {[1, 2, 4, 8].map((mult) => (
                    <button
                      key={mult}
                      className={`preset-pill ${curScale === mult ? "active" : ""}`}
                      onClick={() => updateSettings({ resolutionScale: mult })}
                    >
                      {mult}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="emu-preset-group">
                <span className="preset-group-label">Aspect Ratio Override</span>
                <div className="preset-pills">
                  {[
                    { id: "4:3", label: "Original 4:3" },
                    { id: "auto", label: "Integer Scale" },
                    { id: "stretch", label: "16:9 Stretched" },
                  ].map((ar) => (
                    <button
                      key={ar.id}
                      className={`preset-pill ${curAspect === ar.id ? "active" : ""}`}
                      onClick={() => updateSettings({ aspectRatio: ar.id })}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="emu-preset-group">
                <span className="preset-group-label">Shader Preset</span>
                <div className="preset-pills">
                  {[
                    { id: "crt-royale", label: "CRT Scanline" },
                    { id: "fsr", label: "AMD FSR" },
                    { id: "nearest", label: "Pixel Sharp" },
                  ].map((sh) => (
                    <button
                      key={sh.id}
                      className={`preset-pill ${curShader === sh.id ? "active" : ""}`}
                      onClick={() => updateSettings({ scalingFilter: sh.id })}
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
              </div>

              <button className="btn-ghost" onClick={resetAllSettings}>
                Reset Defaults
              </button>
            </div>

            {preview?.command && (
              <div className="live-cmd-preview">
                <span className="cmd-tag">EFFECTIVE CLI</span>
                <code>{preview.command}</code>
              </div>
            )}

            <div className="settings-rows" ref={settingRowsRef}>
              {settingRows.map((r, idx) => {
                const prevGroup = idx > 0 ? settingRows[idx - 1].group : null;
                return (
                  <React.Fragment key={r.id}>
                    {r.group !== prevGroup && (
                      <div className="settings-group-header">{r.group}</div>
                    )}
                    <div
                      data-setting-idx={idx}
                      className={`setting-row ${idx === safeSettingIdx ? "focused" : ""} ${
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
          /* ═══════════════════════════════════════════════════════════════════
             TAB 3: ACHIEVEMENTS (Full-Width Badge Grid)
             ═══════════════════════════════════════════════════════════════════ */
          <div className="achievements-panel">
            <div className="ach-summary-banner">
              <div className="ach-summary-left">
                <h3>
                  {game.source === "steam"
                    ? "Steamworks Achievements"
                    : "RetroAchievements Integration"}
                </h3>
                <p>
                  Unlocked {unlockedCount} of {achievements.length} badges ·{" "}
                  {achievements
                    .filter((a) => a.unlocked)
                    .reduce((acc, a) => acc + a.points, 0)}{" "}
                  / {achievements.reduce((acc, a) => acc + a.points, 0)} PTS
                </p>
              </div>
              <div className="ach-summary-meter">
                <span className="tabular-nums">
                  {pct(unlockedCount, achievements.length)}% Complete
                </span>
                <div className="bento-ach-progress-bar">
                  <div
                    className="bento-ach-progress-fill"
                    style={{
                      width: `${pct(unlockedCount, achievements.length)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {raMessage && <p className="card-sub" style={{ margin: "12px 4px" }}>{raMessage}</p>}
            {!isSteamGame && (
              <div style={{ margin: "0 4px 10px" }}>
                <button className="btn-ghost" disabled={raLoading} onClick={() => loadRa(true)}>
                  {raLoading ? "Syncing…" : "↻ Sync RetroAchievements"}
                </button>
              </div>
            )}
            <div className="ach-badges-grid">
              {achievements.map((a) => (
                <div
                  key={a.id}
                  className={`ach-badge-card ${a.unlocked ? "is-unlocked" : "is-locked"}`}
                >
                  <div className="ach-badge-icon">
                    {a.iconUrl ? (
                      <img src={a.iconUrl} alt="" style={{ width: 56, height: 56, borderRadius: 6 }} />
                    ) : a.unlocked ? (
                      a.icon
                    ) : (
                      "🔒"
                    )}
                  </div>
                  <div className="ach-badge-body">
                    <div className="ach-badge-top">
                      <h4>{a.title}</h4>
                      <span className="ach-points-pill">{a.points} PTS</span>
                    </div>
                    <p>{a.desc}</p>
                    <div className="ach-badge-meta">
                      <span className="ach-rarity">{a.rarity}</span>
                      <span className="ach-timestamp">
                        {a.unlocked ? `✓ ${a.unlockedAt}` : "Locked"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "sessions" && (
          /* ═══════════════════════════════════════════════════════════════════
             TAB 4: SESSIONS & LOGS (Diagnostic Terminal + Save Backup Manager)
             ═══════════════════════════════════════════════════════════════════ */
          <div className="sessions-panel">
            <div className="sessions-col">
              <div className="col-header-row">
                <h3>Diagnostic Terminal Box (stdout / stderr)</h3>
                <span className="badge-mono">PID Monitor Ready</span>
              </div>
              <pre className="log-box">
                {logText ||
                  `[HENOSIS LAUNCHER DIAGNOSTICS]\nTarget ROM: ${game.path}\nRunner: ${activeCoreName}\nCommand: ${preview?.command || "Auto"}\nStatus: Ready — Launch game to stream real-time stdout/stderr output.`}
              </pre>
            </div>

            <div className="sessions-col">
              <div className="col-header-row">
                <h3>Save Backup Manager &amp; Sessions ({sessions.length})</h3>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    pushToast("Local .sav / .dsv state snapshot verified", "success")
                  }
                >
                  ↻ Verify Save Snapshot
                </button>
              </div>

              <div className="save-backup-card">
                <div className="save-backup-row">
                  <div>
                    <strong>Primary Battery Save (.sav / .dsv)</strong>
                    <span>Auto-synced in ROM directory · Local Snapshot Ready</span>
                  </div>
                  <span className="bento-sync-pill">SYNCED</span>
                </div>
                <div className="save-backup-row">
                  <div>
                    <strong>Quick Save State Slot #1</strong>
                    <span>Hotkey: RB + Y to Save · LB + Y to Rollback</span>
                  </div>
                  <span className="badge-glass">READY</span>
                </div>
              </div>

              <h4 className="sessions-subhead">Recorded Play Sessions</h4>
              {sessions.length === 0 ? (
                <div className="muted-box">
                  No recorded sessions yet. Press A or X to launch and track playtime.
                </div>
              ) : (
                <div className="session-list">
                  {sessions.map((s) => (
                    <div key={s.id} className="session-row">
                      <span>{new Date(s.started * 1000).toLocaleString()}</span>
                      <strong className="tabular-nums">{formatPlaytime(s.duration)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Adjust & Fix Linked Game Metadata Modal */}
      {metaModalOpen && (
        <div className="modal-backdrop" onClick={() => setMetaModalOpen(false)}>
          <div className="meta-fixer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qd-drawer-header">
              <div>
                <span className="qd-drawer-eyebrow">Metadata &amp; Artwork Link Manager</span>
                <h3 className="meta-fixer-title">Adjust &amp; Fix Linked Metadata</h3>
              </div>
              <div className="meta-fixer-tabs">
                <span className="pill-hint">LB</span>
                <button
                  className={`game-tab ${metaMode === "search" ? "active" : ""}`}
                  onClick={() => {
                    setMetaMode("search");
                    setMetaFocusIdx(0);
                  }}
                >
                  [🔍 Metadata Link]
                </button>
                <button
                  className={`game-tab ${metaMode === "artwork" ? "active" : ""}`}
                  onClick={() => {
                    setMetaMode("artwork");
                    setMetaFocusIdx(0);
                  }}
                >
                  [🖼 Cover Artwork]
                </button>
                <button
                  className={`game-tab ${metaMode === "manual" ? "active" : ""}`}
                  onClick={() => {
                    setMetaMode("manual");
                    setMetaFocusIdx(0);
                  }}
                >
                  [✎ Manual Fields]
                </button>
                <span className="pill-hint">RB</span>
              </div>
              <button className="qd-close-btn" onClick={() => setMetaModalOpen(false)}>
                <span className="xbox-btn btn-b">B</span>
                <span>Close</span>
              </button>
            </div>

            <div className="meta-fixer-filebar">
              <span>ROM / Target File:</span>
              <code>{game.path}</code>
            </div>

            {metaMode === "search" ? (
              <div className="meta-search-pane">
                <div
                  className={`meta-search-bar ${metaFocusIdx === 0 ? "is-focused" : ""}`}
                  onMouseEnter={() => setMetaFocusIdx(0)}
                >
                  <div className="meta-search-input-wrap">
                    <span className="meta-search-icon">🔍</span>
                    <input
                      type="text"
                      className="meta-search-input"
                      value={metaSearchQuery}
                      placeholder="Enter correct game title to search matches…"
                      onChange={(e) => setMetaSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          runCandidateSearch(metaSearchQuery);
                        }
                      }}
                    />
                  </div>
                  <div className="meta-search-actions">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        openKeyboard({
                          title: "Search Game Title to Fix Metadata Match",
                          initial: metaSearchQuery || game.title,
                          onSubmit: (v) => {
                            if (v.trim()) runCandidateSearch(v.trim());
                          },
                        })
                      }
                    >
                      <span className="xbox-btn btn-x">X</span>
                      <span>Keyboard</span>
                    </button>
                    <button
                      className="btn-play-emerald btn-sm"
                      onClick={() => runCandidateSearch(metaSearchQuery)}
                      disabled={searchingCandidates}
                    >
                      <span>{searchingCandidates ? "Searching…" : "Search Matches"}</span>
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => handleResetMetadata(false)}
                      title="Strip wrong metadata and restore clean filename (Y)"
                    >
                      <span className="xbox-btn btn-y">Y</span>
                      <span>Reset to File</span>
                    </button>
                  </div>
                </div>

                <div className="meta-candidates-list">
                  {searchingCandidates ? (
                    <div className="meta-candidates-empty">
                      ⟳ Querying IGDB &amp; Steam Store for &ldquo;{metaSearchQuery}&rdquo;…
                    </div>
                  ) : metadataLinkCandidates.length === 0 ? (
                    <div className="meta-candidates-empty">
                      No metadata matches found for &ldquo;{metaSearchQuery}&rdquo;. Try another search query or switch to [Manual Fields].
                    </div>
                  ) : (
                    metadataLinkCandidates.map((cand, idx) => {
                      const focused = metaFocusIdx === idx + 1;
                      const thumb = mediaSrc(cand.cover) || mediaSrc(cand.hero);
                      return (
                        <div
                          key={`${cand.source}-${cand.title}-${idx}`}
                          className={`meta-candidate-card ${focused ? "is-focused" : ""}`}
                          onMouseEnter={() => setMetaFocusIdx(idx + 1)}
                          onClick={() => handleApplyCandidate(cand)}
                        >
                          <div className="meta-candidate-thumb">
                            {thumb ? (
                              <img src={thumb} alt={cand.title} loading="lazy" />
                            ) : (
                              <div className="meta-candidate-noart">No Art</div>
                            )}
                          </div>
                          <div className="meta-candidate-info">
                            <div className="meta-candidate-top">
                              <strong>{cand.title}</strong>
                              <div className="meta-candidate-badges">
                                <span className={`meta-source-pill src-${cand.source}`}>
                                  {cand.source.toUpperCase()}
                                </span>
                                {cand.releaseDate && (
                                  <span className="badge-glass">{cand.releaseDate}</span>
                                )}
                                {cand.region && <span className="badge-glass">{cand.region}</span>}
                                {cand.genre && <span className="badge-mono">{cand.genre}</span>}
                              </div>
                            </div>
                            {(cand.developer || cand.publisher) && (
                              <div className="meta-candidate-credits">
                                {cand.developer && <span>Dev: {cand.developer}</span>}
                                {cand.publisher && <span>Pub: {cand.publisher}</span>}
                              </div>
                            )}
                            {cand.description && (
                              <p className="meta-candidate-desc">{cand.description}</p>
                            )}
                          </div>
                          <div className="meta-candidate-cta">
                            <button
                              className="btn-play-emerald btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApplyCandidate(cand);
                              }}
                            >
                              <span className="xbox-btn btn-a">A</span>
                              <span>Link Match</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : metaMode === "artwork" ? (
              <div className="meta-search-pane">
                <div
                  className={`meta-search-bar ${metaFocusIdx === 0 ? "is-focused" : ""}`}
                  onMouseEnter={() => setMetaFocusIdx(0)}
                >
                  <div className="meta-search-input-wrap">
                    <span className="meta-search-icon">🖼</span>
                    <input
                      type="text"
                      className="meta-search-input"
                      value={metaSearchQuery}
                      placeholder="Search Libretro Boxart covers (e.g. Pokemon Diamond, Mario)…"
                      onChange={(e) => setMetaSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          runCandidateSearch(metaSearchQuery);
                        }
                      }}
                    />
                  </div>
                  <div className="meta-search-actions">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        openKeyboard({
                          title: "Search Libretro Cover Artwork",
                          initial: metaSearchQuery || game.title,
                          onSubmit: (v) => {
                            if (v.trim()) runCandidateSearch(v.trim());
                          },
                        })
                      }
                    >
                      <span className="xbox-btn btn-x">X</span>
                      <span>Keyboard</span>
                    </button>
                    <button
                      className="btn-play-emerald btn-sm"
                      onClick={() => runCandidateSearch(metaSearchQuery)}
                      disabled={searchingCandidates}
                    >
                      <span>{searchingCandidates ? "Searching…" : "Search Covers"}</span>
                    </button>
                  </div>
                </div>

                {searchingCandidates ? (
                  <div className="meta-candidates-empty">
                    ⟳ Querying Libretro Thumbnails Boxart CDN for &ldquo;{metaSearchQuery}&rdquo;…
                  </div>
                ) : libretroArtworkCandidates.length === 0 ? (
                  <div className="meta-candidates-empty">
                    No Libretro boxart found for &ldquo;{metaSearchQuery}&rdquo;. Try a simpler English title (e.g. &ldquo;Pokemon Black&rdquo;).
                  </div>
                ) : (
                  <div className="meta-artwork-grid">
                    {libretroArtworkCandidates.map((cand, idx) => {
                      const focused = metaFocusIdx === idx + 1;
                      const thumb = mediaSrc(cand.cover);
                      return (
                        <div
                          key={`lr-${cand.cover || cand.title}-${idx}`}
                          className={`meta-artwork-card ${focused ? "is-focused" : ""}`}
                          onMouseEnter={() => setMetaFocusIdx(idx + 1)}
                          onClick={() => handleApplyLibretroCover(cand)}
                        >
                          <div className="meta-artwork-thumb">
                            {thumb ? (
                              <img src={thumb} alt={cand.title} loading="lazy" />
                            ) : (
                              <div className="meta-candidate-noart">No Art</div>
                            )}
                          </div>
                          <div className="meta-artwork-footer">
                            <strong title={cand.description || cand.title}>{cand.title}</strong>
                            <div className="meta-artwork-meta">
                              <span className="meta-source-pill src-libretro">LIBRETRO</span>
                              {cand.region && <span className="badge-glass">{cand.region}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="meta-manual-pane">
                <div className="settings-rows">
                  {manualMetaRows.map((r, idx) => {
                    const prevGroup = idx > 0 ? manualMetaRows[idx - 1].group : null;
                    const isFocused = idx === Math.min(metaFocusIdx, manualMetaRows.length - 1);
                    return (
                      <React.Fragment key={r.id}>
                        {r.group !== prevGroup && (
                          <div className="settings-group-header">{r.group}</div>
                        )}
                        <div
                          className={`setting-row ${isFocused ? "focused" : ""} ${
                            r.isOverridden ? "overridden" : ""
                          }`}
                          onMouseEnter={() => setMetaFocusIdx(idx)}
                          onClick={() => r.onActivate?.()}
                        >
                          <div className="setting-row-left">
                            <div className="setting-row-title">
                              <span>{r.label}</span>
                              {r.isOverridden && <span className="override-dot">SET</span>}
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
                            {r.onClear && r.isOverridden && (
                              <button
                                className="reset-pill"
                                title="Clear / Reset Field (Y)"
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
          </div>
        </div>
      )}

      {/* Custom Hotkey Mapper Modal (Y Button) */}
      {hotkeyModalOpen && (
        <div className="modal-backdrop" onClick={() => setHotkeyModalOpen(false)}>
          <div className="hotkey-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="qd-drawer-header">
              <span className="qd-drawer-eyebrow">Controller Hotkey Mapper</span>
              <button className="qd-close-btn" onClick={() => setHotkeyModalOpen(false)}>
                <span className="xbox-btn btn-b">B</span>
                <span>Close</span>
              </button>
            </div>
            <p className="hotkey-modal-sub">
              In-game chord shortcuts active for <b>{game.title}</b>:
            </p>
            <div className="hotkey-list">
              <div className="hotkey-row">
                <span>Fast-Forward Toggle</span>
                <code>RT + Select</code>
              </div>
              <div className="hotkey-row">
                <span>Quick Save State</span>
                <code>RB + Y</code>
              </div>
              <div className="hotkey-row">
                <span>Quick Load State</span>
                <code>LB + Y</code>
              </div>
              <div className="hotkey-row">
                <span>Swap Dual Screens (DS / 3DS / Wii U)</span>
                <code>L3 (Left Stick Click)</code>
              </div>
              <div className="hotkey-row">
                <span>Cycle Screen Layout</span>
                <code>R3 (Right Stick Click)</code>
              </div>
              <div className="hotkey-row">
                <span>Summon Henosis Quick Menu</span>
                <code>❖ Xbox Guide</code>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomPromptBar
        items={[
          {
            btn: "A",
            label: tab === "settings" ? "Edit / Toggle" : "Select / Play",
            onClick: () =>
              tab === "overview"
                ? triggerOverviewItem(overviewFocusIdx)
                : settingRows[safeSettingIdx]?.onActivate?.(),
          },
          {
            btn: "B",
            label: "Back to Library",
            onClick: back,
          },
          {
            btn: "LB/RB",
            label: "Switch Tabs",
            onClick: () => setTabIdx((i) => (i + 1) % TABS.length),
          },
          {
            btn: "D-PAD",
            label: "Card Focus",
          },
          {
            btn: "Y",
            label: tab === "settings" ? "Reset Row" : "Hotkey Mapper",
            onClick: () =>
              tab === "settings"
                ? settingRows[safeSettingIdx]?.onClear?.()
                : setHotkeyModalOpen(true),
          },
        ]}
      />
    </div>
  );
};
