// Shared TypeScript types matching the Rust backend models, plus typed Tauri command wrappers.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export type ArtStyle =
  | "cart-nes"
  | "cart-snes"
  | "cart-n64"
  | "cart-gb"
  | "cart-gba"
  | "cart-sega"
  | "cart-generic"
  | "card-ds"
  | "card-3ds"
  | "card-switch"
  | "card-vita"
  | "disc-cd"
  | "disc-dvd"
  | "disc-bd"
  | "disc-mini"
  | "umd"
  | "digital";

export type MediaType = "cartridge" | "card" | "disc" | "digital";

export interface Platform {
  id: string;
  name: string;
  shortName: string;
  manufacturer: string;
  year: number;
  media: MediaType;
  artStyle: ArtStyle;
  extensions: string[];
  aliases: string[];
  color: string;
  accent: string;
}

export interface PlatformSummary extends Platform {
  gameCount: number;
  lastPlayed: number | null;
  defaultEmulator: string | null;
}

export interface FileOverride {
  source: string;
  target: string;
}

export interface GameSettings {
  emulatorId?: string | null;
  core?: string | null;
  graphicsApi?: string | null;
  resolutionScale?: number | null;
  vsync?: boolean | null;
  fpsLimit?: number | null;
  aspectRatio?: string | null;
  fullscreen?: boolean | null;
  inputProfile?: string | null;
  launchArgs?: string | null;
  env?: string[] | null;
  gamemode?: boolean | null;
  mangohud?: boolean | null;
  gamescope?: boolean | null;
  gamescopeArgs?: string | null;
  configOverrides?: FileOverride[] | null;
  modsEnabled?: boolean | null;
  modLinks?: FileOverride[] | null;
  advanced?: string[] | null;
}

export interface Game {
  id: number;
  platform: string;
  title: string;
  path: string;
  source: "steam" | "rom" | "manual";
  steamAppId: number | null;
  region: string | null;
  serial: string | null;
  cover: string | null;
  hero: string | null;
  logo: string | null;
  favorite: boolean;
  hidden: boolean;
  addedAt: number;
  lastPlayed: number | null;
  playtime: number;
  playCount: number;
  missing: boolean;
  fileSize: number | null;
  settings: GameSettings;
  metadata: {
    installDir?: string;
    header?: string;
    developer?: string;
    publisher?: string;
    releaseDate?: string;
    genre?: string;
    description?: string;
    screenshots?: string[];
    titleLocked?: number;
  };
}

export interface ScanDir {
  path: string;
  platform: string | null;
  enabled: boolean;
}

export interface PlatformConfig {
  platform: string;
  defaultEmulator: string | null;
  biosDir: string | null;
  settings: GameSettings;
}

export interface Emulator {
  id: string;
  preset: string;
  name: string;
  exec: string;
  kind: "binary" | "flatpak" | "appimage";
  version: string | null;
  platforms: string[];
  args: string;
  workdir: string | null;
  coresDir: string | null;
}

export interface Preset {
  id: string;
  name: string;
  platforms: string[];
  binaries: string[];
  flatpaks: string[];
  appimages: string[];
  args: string;
  supports: string[];
  notes: string;
}

export interface AppSettings {
  steamEnabled: boolean;
  steamPath: string | null;
  autostart: boolean;
  startHidden: boolean;
  hideOnLaunch: boolean;
  guideSummons: boolean;
  uiSounds: boolean;
  showEmptyPlatforms: boolean;
  esDeMediaDir: string | null;
}

export interface ScanReport {
  added: number;
  updated: number;
  missing: number;
  total: number;
  errors: string[];
}

export interface Session {
  id: number;
  gameId: number;
  started: number;
  ended: number;
  duration: number;
}

export interface RunningGame {
  gameId: number;
  title: string;
  platform: string;
  started: number;
}

export interface LaunchPreview {
  command: string | null;
  emulator: Emulator | null;
  error: string | null;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

export interface IgdbCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string | null;
}

export interface Place {
  name: string;
  path: string;
}

export type PadButton =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "x"
  | "y"
  | "lb"
  | "rb"
  | "lt"
  | "rt"
  | "select"
  | "start"
  | "guide"
  | "ls"
  | "rs";

export interface PadEvent {
  button: PadButton;
  repeat: boolean;
}

/** Resolve local filesystem paths through Tauri's asset protocol while leaving http(s) URLs untouched. */
export function mediaSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("asset:") || path.startsWith("data:")) {
    return path;
  }
  return convertFileSrc(path);
}

export function formatPlaytime(seconds: number): string {
  if (!seconds || seconds < 60) return seconds > 0 ? "< 1 min" : "Never played";
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)} min`;
  if (hours < 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours)} h`;
}

export function formatRelativeDate(epochSec: number | null): string {
  if (!epochSec) return "Never";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(epochSec * 1000).toLocaleDateString();
}

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export const api = {
  getPlatforms: (includeEmpty: boolean) => invoke<PlatformSummary[]>("get_platforms", { includeEmpty }),
  getPlatformDefs: () => invoke<Platform[]>("get_platform_defs"),
  getGames: (platform?: string | null) => invoke<Game[]>("get_games", { platform: platform ?? null }),
  getRecent: (limit = 16) => invoke<Game[]>("get_recent", { limit }),
  getGame: (id: number) => invoke<Game>("get_game", { id }),
  saveGameSettings: (id: number, settings: GameSettings) => invoke<void>("save_game_settings", { id, settings }),
  setGameFlag: (id: number, flag: "favorite" | "hidden", value: boolean) =>
    invoke<void>("set_game_flag", { id, flag, value }),
  renameGame: (id: number, title: string) => invoke<void>("rename_game", { id, title }),
  setGamePlatform: (id: number, platform: string) => invoke<void>("set_game_platform", { id, platform }),
  deleteGame: (id: number) => invoke<void>("delete_game", { id }),
  purgeMissing: () => invoke<number>("purge_missing"),
  addManualGame: (path: string, title: string | null, platform: string) =>
    invoke<number>("add_manual_game", { path, title, platform }),
  getSessions: (id: number) => invoke<Session[]>("get_sessions", { id }),
  fetchGameMetadata: (id: number) => invoke<Game>("fetch_game_metadata", { id }),
  fetchPlatformMetadata: (platform: string) =>
    invoke<number>("fetch_platform_metadata", { platform }),
  getIgdbCredentials: () => invoke<IgdbCredentials>("get_igdb_credentials"),
  saveIgdbCredentials: (creds: IgdbCredentials) =>
    invoke<void>("save_igdb_credentials", { creds }),

  scanLibrary: () => invoke<ScanReport>("scan_library"),
  getScanDirs: () => invoke<ScanDir[]>("get_scan_dirs"),
  saveScanDir: (dir: ScanDir) => invoke<void>("save_scan_dir", { dir }),
  removeScanDir: (path: string) => invoke<void>("remove_scan_dir", { path }),

  getEmulators: () => invoke<Emulator[]>("get_emulators"),
  getPresets: () => invoke<Preset[]>("get_presets"),
  detectEmulators: () => invoke<Emulator[]>("detect_emulators"),
  saveEmulator: (emulator: Emulator) => invoke<Emulator>("save_emulator", { emulator }),
  deleteEmulator: (id: string) => invoke<void>("delete_emulator", { id }),
  getCores: (emulatorId: string) => invoke<string[]>("get_cores", { emulatorId }),
  getEmulatorDirs: () => invoke<string[]>("get_emulator_dirs"),
  setEmulatorDirs: (dirs: string[]) => invoke<void>("set_emulator_dirs", { dirs }),

  getPlatformConfig: (platform: string) => invoke<PlatformConfig>("get_platform_config", { platform }),
  savePlatformConfig: (config: PlatformConfig) => invoke<void>("save_platform_config", { config }),

  launchGame: (id: number) => invoke<void>("launch_game", { id }),
  stopGame: () => invoke<void>("stop_game"),
  getRunning: () => invoke<RunningGame | null>("get_running"),
  resumeGame: () => invoke<void>("resume_game"),
  previewLaunch: (id: number) => invoke<LaunchPreview>("preview_launch", { id }),
  readGameLog: (id: number) => invoke<string>("read_game_log", { id }),
  captureConfig: (id: number, target: string) => invoke<GameSettings>("capture_config", { id, target }),

  listDir: (path: string | null, showFiles: boolean, showHidden: boolean) =>
    invoke<DirListing>("list_dir", { path, showFiles, showHidden }),
  getPlaces: () => invoke<Place[]>("get_places"),

  getAppSettings: () => invoke<AppSettings>("get_app_settings"),
  saveAppSettings: (settings: AppSettings) => invoke<void>("save_app_settings", { settings }),
  hideWindow: () => invoke<void>("hide_window"),
  quitApp: () => invoke<void>("quit_app"),
};
