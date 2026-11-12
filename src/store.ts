// Central application state (Zustand) – navigation stack, cached library data, modals and toasts.

import { create } from "zustand";
import {
  api,
  AppSettings,
  Emulator,
  Game,
  Platform,
  PlatformSummary,
  Preset,
  RunningGame,
  ScanReport,
} from "./api";
import { setSoundsEnabled, sfx } from "./sound";

export type Screen =
  | { kind: "home" }
  | { kind: "platform"; platformId: string }
  | { kind: "game"; gameId: number; initialTab?: "overview" | "settings" | "achievements" | "sessions" }
  | { kind: "settings"; section?: "directories" | "emulators" | "platforms" | "system" };

export interface KeyboardModalState {
  title: string;
  initial: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

export interface FileBrowserModalState {
  title: string;
  initialPath?: string | null;
  pickMode: "dir" | "file";
  onPick: (path: string) => void;
}

export interface SessionErrorState {
  gameId: number;
  title: string;
  message: string;
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
}

interface Store {
  screen: Screen;
  history: Screen[];
  homeIndex: number;
  platformFocus: Record<string, number>;
  platformViewMode: "coverflow" | "grid";
  totalPlaytimeSeconds: number;

  platforms: PlatformSummary[];
  platformDefs: Platform[];
  recent: Game[];
  emulators: Emulator[];
  presets: Preset[];
  appSettings: AppSettings;
  running: RunningGame | null;

  scanning: boolean;
  scanStatus: string;
  quickMenuOpen: boolean;
  sessionOverlayOpen: boolean;
  sessionError: SessionErrorState | null;
  holdXProgress: number;
  holdBProgress: number;
  keyboardModal: KeyboardModalState | null;
  fileBrowserModal: FileBrowserModalState | null;
  toasts: Toast[];

  init: () => Promise<void>;
  refreshOverview: () => Promise<void>;
  navigate: (next: Screen) => void;
  replaceScreen: (next: Screen) => void;
  back: () => void;
  goHome: () => void;
  setHomeIndex: (idx: number) => void;
  setPlatformFocus: (platformId: string, idx: number) => void;
  setPlatformViewMode: (mode: "coverflow" | "grid") => void;
  togglePlatformViewMode: () => void;

  triggerScan: () => Promise<ScanReport | null>;
  launchGame: (gameId: number) => Promise<void>;
  stopRunning: () => Promise<void>;
  updateAppSettings: (next: AppSettings) => Promise<void>;

  setQuickMenu: (open: boolean) => void;
  setSessionOverlayOpen: (open: boolean) => void;
  setSessionError: (err: SessionErrorState | null) => void;
  setHoldXProgress: (p: number) => void;
  setHoldBProgress: (p: number) => void;
  openKeyboard: (cfg: KeyboardModalState) => void;
  closeKeyboard: () => void;
  openFileBrowser: (cfg: FileBrowserModalState) => void;
  closeFileBrowser: () => void;
  setRunning: (r: RunningGame | null) => void;
  setScanProgress: (text: string) => void;
  pushToast: (text: string, tone?: Toast["tone"]) => void;
}

let toastSeq = 1;

export const useStore = create<Store>((set, get) => ({
  screen: { kind: "home" },
  history: [],
  homeIndex: 0,
  platformFocus: {},
  platformViewMode: "coverflow",
  totalPlaytimeSeconds: 0,

  platforms: [],
  platformDefs: [],
  recent: [],
  emulators: [],
  presets: [],
  appSettings: {
    steamEnabled: true,
    steamPath: null,
    autostart: false,
    startHidden: false,
    hideOnLaunch: true,
    guideSummons: true,
    uiSounds: true,
    showEmptyPlatforms: false,
    esDeMediaDir: null,
  },
  running: null,

  scanning: false,
  scanStatus: "",
  quickMenuOpen: false,
  sessionOverlayOpen: false,
  sessionError: null,
  holdXProgress: 0,
  holdBProgress: 0,
  keyboardModal: null,
  fileBrowserModal: null,
  toasts: [],

  init: async () => {
    const [appSettings, platformDefs, presets, running] = await Promise.all([
      api.getAppSettings(),
      api.getPlatformDefs(),
      api.getPresets(),
      api.getRunning(),
    ]);
    setSoundsEnabled(appSettings.uiSounds);
    set({ appSettings, platformDefs, presets, running });
    await get().refreshOverview();
    // Run a short delayed refresh to pick up the background startup scan results.
    setTimeout(() => {
      get().refreshOverview();
    }, 1400);
  },

  refreshOverview: async () => {
    const showEmpty = get().appSettings.showEmptyPlatforms;
    const [platforms, recent, emulators, allGames] = await Promise.all([
      api.getPlatforms(showEmpty),
      api.getRecent(16),
      api.getEmulators(),
      api.getGames(null).catch(() => [] as Game[]),
    ]);
    const totalPlaytimeSeconds = allGames.reduce((acc, g) => acc + (g.playtime || 0), 0);
    set({ platforms, recent, emulators, totalPlaytimeSeconds });
  },

  navigate: (next) => {
    const cur = get().screen;
    set((s) => ({ screen: next, history: [...s.history, cur] }));
  },

  replaceScreen: (next) => {
    set({ screen: next });
  },

  back: () => {
    const h = get().history;
    if (h.length === 0) {
      set({ screen: { kind: "home" }, history: [] });
      return;
    }
    const prev = h[h.length - 1];
    set({ screen: prev, history: h.slice(0, -1) });
  },

  goHome: () => {
    set({ screen: { kind: "home" }, history: [], quickMenuOpen: false, sessionOverlayOpen: false });
  },

  setHomeIndex: (idx) => set({ homeIndex: idx }),
  setPlatformFocus: (platformId, idx) =>
    set((s) => ({ platformFocus: { ...s.platformFocus, [platformId]: idx } })),
  setPlatformViewMode: (mode) => set({ platformViewMode: mode }),
  togglePlatformViewMode: () =>
    set((s) => ({
      platformViewMode: s.platformViewMode === "coverflow" ? "grid" : "coverflow",
    })),

  triggerScan: async () => {
    if (get().scanning) return null;
    set({ scanning: true, scanStatus: "Scanning library…" });
    try {
      const report = await api.scanLibrary();
      await get().refreshOverview();
      get().pushToast(
        `Scan complete: ${report.total} games (${report.added} new)`,
        "success"
      );
      return report;
    } catch (e) {
      get().pushToast(`Scan failed: ${String(e)}`, "error");
      return null;
    } finally {
      set({ scanning: false, scanStatus: "" });
    }
  },

  launchGame: async (gameId) => {
    try {
      set({ sessionError: null });
      sfx.launch();
      await api.launchGame(gameId);
    } catch (e) {
      sfx.error();
      get().pushToast(String(e), "error");
    }
  },

  stopRunning: async () => {
    try {
      await api.stopGame();
      get().pushToast("Stopping game…", "info");
    } catch (e) {
      get().pushToast(String(e), "error");
    }
  },

  updateAppSettings: async (next) => {
    setSoundsEnabled(next.uiSounds);
    await api.saveAppSettings(next);
    set({ appSettings: next });
    await get().refreshOverview();
  },

  setQuickMenu: (open) => set({ quickMenuOpen: open }),
  setSessionOverlayOpen: (open) => set({ sessionOverlayOpen: open }),
  setSessionError: (err) => set({ sessionError: err }),
  setHoldXProgress: (p) => set({ holdXProgress: p }),
  setHoldBProgress: (p) => set({ holdBProgress: p }),
  openKeyboard: (cfg) => set({ keyboardModal: cfg }),
  closeKeyboard: () => set({ keyboardModal: null }),
  openFileBrowser: (cfg) => set({ fileBrowserModal: cfg }),
  closeFileBrowser: () => set({ fileBrowserModal: null }),
  setRunning: (r) => set({ running: r }),
  setScanProgress: (text) => set({ scanStatus: text }),

  pushToast: (text, tone = "info") => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4200);
  },
}));
