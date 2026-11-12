// Root application shell – connects Tauri backend events (scan progress, game session lifecycle,
// Xbox Guide button summons) to the store and renders the active screen + controller modals.

import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RunningGame } from "./api";
import { FileBrowserModal } from "./components/FileBrowserModal";
import { OnScreenKeyboard } from "./components/OnScreenKeyboard";
import { QuickMenuModal } from "./components/QuickMenuModal";
import { TopBar } from "./components/TopBar";
import { initInputBus, usePad } from "./input";
import { useStore } from "./store";
import { GameView } from "./views/GameView";
import { HomeView } from "./views/HomeView";
import { PlatformView } from "./views/PlatformView";
import { SettingsView } from "./views/SettingsView";

export const App: React.FC = () => {
  const {
    screen,
    running,
    stopRunning,
    init,
    refreshOverview,
    setRunning,
    setScanProgress,
    setQuickMenu,
    goHome,
    pushToast,
    toasts,
  } = useStore();

  useEffect(() => {
    initInputBus();
    init();

    // Test & automation hooks for Wayland MCP bridge
    (window as any).__HENOSIS_STORE = useStore;
    (window as any).__NEXUS_STORE = useStore;
    const queryState = () => {
      const store = useStore.getState();
      const envEl = document.querySelector(".env-container") || document.querySelector(".console-environment");
      const coverflowItems = document.querySelectorAll(".coverflow-item");
      const centerItem = document.querySelector(".coverflow-item.is-center");
      const focusedConsoleCard = document.querySelector(".console-hero-card.is-focused");
      return {
        screen: store.screen,
        platformViewMode: store.platformViewMode,
        platformsCount: store.platforms.length,
        homeIndex: store.homeIndex,
        activePlatform: store.platforms[store.homeIndex]?.id || null,
        activePlatformName: store.platforms[store.homeIndex]?.name || null,
        running: store.running,
        quickMenu: store.quickMenuOpen,
        showEmptyPlatforms: store.appSettings.showEmptyPlatforms,
        envClassName: envEl ? envEl.className : null,
        coverflowCount: coverflowItems.length,
        hasCenterCover: !!centerItem,
        centerCoverTransform: centerItem ? (centerItem as HTMLElement).style.transform : null,
        focusedConsoleTitle: focusedConsoleCard
          ? focusedConsoleCard.querySelector(".hero-card-title")?.textContent || null
          : null,
        focusedGameTitle: document.querySelector(".spotlight-panel-title")?.textContent || null,
      };
    };
    (window as any).__HENOSIS_QUERY_STATE = queryState;
    (window as any).__NEXUS_QUERY_STATE = queryState;

    const reportState = () => {
      const q = queryState();
      if (q) {
        invoke("report_test_state", { state: q }).catch(() => {});
      }
    };
    (window as any).__HENOSIS_REPORT = reportState;
    (window as any).__NEXUS_REPORT = reportState;
    reportState();

    const unsubs = [
      listen<{ phase: string; count: number; current: string }>("scan-progress", (ev) => {
        setScanProgress(`${ev.payload.phase.toUpperCase()}: ${ev.payload.current} (${ev.payload.count})`);
      }),
      listen<RunningGame>("game-started", (ev) => {
        setRunning(ev.payload);
      }),
      listen<{
        gameId: number;
        id: number;
        title: string;
        desc?: string;
        points: number;
        hardcore?: boolean;
      }>("ra-unlocked", (ev) => {
        const p = ev.payload;
        pushToast(
          `🏆 Achievement Unlocked: ${p.title} (${p.points} PTS${p.hardcore ? " · Hardcore" : ""})`,
          "success"
        );
      }),
      listen<{ gameId: number; duration: number; error: string | null }>("game-ended", (ev) => {
        setRunning(null);
        refreshOverview();
        if (ev.payload.error) {
          pushToast(ev.payload.error, "error");
        }
      }),
      listen("guide-summon", () => {
        if (useStore.getState().running) {
          setQuickMenu(true);
        }
      }),
    ];

    return () => {
      unsubs.forEach((p) => p.then((f) => f()));
    };
  }, []);

  useEffect(() => {
    ((window as any).__HENOSIS_REPORT || (window as any).__NEXUS_REPORT)?.();
  }, [screen, running, toasts.length]);

  // Global fallback for Guide button when already focused
  usePad(
    (btn) => {
      if (btn === "guide") {
        goHome();
        return true;
      }
      return false;
    },
    -10
  );

  return (
    <div className="henosis-shell">
      <TopBar />

      <div className="henosis-stage">
        {screen.kind === "home" && <HomeView />}
        {screen.kind === "platform" && <PlatformView platformId={screen.platformId} />}
        {screen.kind === "game" && (
          <GameView gameId={screen.gameId} initialTab={screen.initialTab} />
        )}
        {screen.kind === "settings" && <SettingsView initialSection={screen.section} />}
      </div>

      <QuickMenuModal />
      <FileBrowserModal />
      <OnScreenKeyboard />

      {running && (
        <div className="launch-overlay">
          <div className="launch-overlay-card">
            <div className="launch-spinner-ring" />
            <span className="launch-eyebrow">STARTING GAME SESSION</span>
            <h2>{running.title}</h2>
            <p>
              Preparing emulator & applying per-game configuration… The launcher will stay in front until the game window is ready.
            </p>
            <button className="btn-danger-ghost" onClick={stopRunning}>
              Cancel / Stop
            </button>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-item toast-${t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
