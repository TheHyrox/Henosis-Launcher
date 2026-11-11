// Persistent Top Bar (48px) and Persistent Bottom Action Bar (40px)
// Implements Global Design System & Foundations specification:
// - Top Bar Left: Brand ID (Henosis) and top-level navigation pill (Library, Consoles, Settings)
// - Top Bar Right: Global Search shortcut hint ((Y) Search), Network status indicator,
//   Controller profile badge (Xbox / DualSense / Switch Pro), and tabular system clock.
// - Bottom Action Bar Left: Contextual controller button legends dynamically generated per screen.
// - Bottom Action Bar Right: Session analytics ticker (PLAYTIME: Xh, Battery / Status).

import React, { useEffect, useState } from "react";
import { api } from "../api";
import { onPadStatus } from "../input";
import { useStore } from "../store";

export interface PromptItem {
  btn:
    | "A"
    | "B"
    | "X"
    | "Y"
    | "LB"
    | "RB"
    | "LB/RB"
    | "LT"
    | "RT"
    | "LT/RT"
    | "VIEW"
    | "START"
    | "SELECT"
    | "D-PAD"
    | "UP/DOWN"
    | "GUIDE";
  label: string;
  onClick?: () => void;
}

function detectControllerProfile(rawName: string, connected: boolean): string {
  if (!connected) return "Xbox / Key";
  const lower = rawName.toLowerCase();
  if (lower.includes("dualsense") || lower.includes("dualshock") || lower.includes("playstation") || lower.includes("sony")) {
    return "DualSense";
  }
  if (lower.includes("switch") || lower.includes("pro controller") || lower.includes("nintendo")) {
    return "Switch Pro";
  }
  return "Xbox Pad";
}

function formatTotalHours(seconds: number): string {
  if (!seconds || seconds <= 0) return "0h";
  const hrs = seconds / 3600;
  if (hrs < 1) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (hrs < 10) return `${hrs.toFixed(1)}h`;
  return `${Math.round(hrs)}h`;
}

export const TopBar: React.FC = () => {
  const {
    screen,
    platforms,
    platformDefs,
    homeIndex,
    navigate,
    goHome,
    triggerScan,
    scanning,
    scanStatus,
    running,
    setQuickMenu,
    openKeyboard,
    pushToast,
  } = useStore();

  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
  );
  const [pad, setPad] = useState<{ connected: boolean; name: string }>({
    connected: false,
    name: "",
  });
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const t = setInterval(() => {
      setClock(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    }, 10000);
    const unsub = onPadStatus(setPad);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      clearInterval(t);
      unsub();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleOpenLibrary = () => {
    if (screen.kind === "platform") return;
    const targetPlat =
      platforms[homeIndex] || platforms[0] || platformDefs[0];
    if (targetPlat) {
      navigate({ kind: "platform", platformId: targetPlat.id });
    }
  };

  const handleGlobalSearch = () => {
    openKeyboard({
      title: "Global Library Search",
      initial: "",
      placeholder: "Type game or console title…",
      onSubmit: async (q) => {
        const query = q.trim().toLowerCase();
        if (!query) return;
        try {
          const allGames = await api.getGames(null);
          const match = allGames.find(
            (g) => !g.hidden && !g.missing && g.title.toLowerCase().includes(query)
          );
          if (match) {
            navigate({ kind: "game", gameId: match.id });
            return;
          }
          const platMatch = platforms.find(
            (p) =>
              p.name.toLowerCase().includes(query) ||
              p.shortName.toLowerCase().includes(query)
          );
          if (platMatch) {
            navigate({ kind: "platform", platformId: platMatch.id });
            return;
          }
          pushToast(`No titles matching "${q}"`, "info");
        } catch (err) {
          pushToast(String(err), "error");
        }
      },
    });
  };

  const isLibraryActive = screen.kind === "platform" || screen.kind === "game";
  const profileLabel = detectControllerProfile(pad.name, pad.connected);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="brand-pill" onClick={goHome} title="Henosis Home">
          <span className="brand-glyph">◆</span>
          <span className="brand-name">Henosis</span>
        </button>

        <nav className="topbar-nav" aria-label="Primary Navigation">
          <button
            className={`nav-tab ${isLibraryActive ? "active" : ""}`}
            onClick={handleOpenLibrary}
          >
            Library
          </button>
          <button
            className={`nav-tab ${screen.kind === "home" ? "active" : ""}`}
            onClick={goHome}
          >
            Consoles
          </button>
          <button
            className={`nav-tab ${screen.kind === "settings" ? "active" : ""}`}
            onClick={() => navigate({ kind: "settings" })}
          >
            Settings
          </button>
        </nav>
      </div>

      <div className="topbar-center">
        {running && (
          <div className="running-banner" onClick={() => setQuickMenu(true)}>
            <span className="pulse-dot" />
            <span>Now Playing: {running.title}</span>
          </div>
        )}
        {scanning && (
          <div className="scan-banner">
            <span className="spinner-dot" />
            <span>{scanStatus || "Scanning…"}</span>
          </div>
        )}
      </div>

      <div className="topbar-right">
        <button
          className="topbar-search-hint"
          onClick={handleGlobalSearch}
          title="Global Search (Y)"
        >
          <span className="xbox-btn btn-y">Y</span>
          <span>{screen.kind === "platform" ? "Filter / Search" : "Search"}</span>
        </button>

        <button
          className="topbar-action"
          onClick={() => triggerScan()}
          disabled={scanning}
          title="Rescan Library"
        >
          ↻ Rescan
        </button>

        <div
          className={`network-badge ${online ? "is-online" : "is-offline"}`}
          title={online ? "Network Online" : "Offline Mode"}
        >
          <span className="net-dot" />
          <span>{online ? "Online" : "Offline"}</span>
        </div>

        <div
          className={`pad-indicator ${pad.connected ? "connected" : "disconnected"}`}
          title={pad.connected ? pad.name : "Keyboard & Controller Input Ready"}
        >
          <span className="pad-icon">🎮</span>
          <span className="pad-text">{profileLabel}</span>
        </div>

        <button
          className="topbar-clock"
          onClick={() => setQuickMenu(true)}
          title="Quick Menu (Start)"
        >
          {clock}
        </button>
      </div>
    </header>
  );
};

export const BottomPromptBar: React.FC<{ items: PromptItem[] }> = ({ items }) => {
  const { totalPlaytimeSeconds, running } = useStore();

  return (
    <footer className="promptbar">
      <div className="promptbar-list">
        {items.map((it, idx) => {
          const btnSlug = it.btn.toLowerCase().replace(/[^a-z0-9]/g, "");
          return (
            <button
              key={`${it.btn}-${idx}`}
              className="prompt-item"
              onClick={it.onClick}
              disabled={!it.onClick}
            >
              <span className={`xbox-btn btn-${btnSlug}`}>{it.btn}</span>
              <span className="prompt-label">{it.label}</span>
            </button>
          );
        })}
      </div>

      <div className="promptbar-analytics">
        <div className="analytics-ticker-item">
          <span className="ticker-label">PLAYTIME:</span>
          <strong className="ticker-val">{formatTotalHours(totalPlaytimeSeconds)}</strong>
        </div>
        <span className="ticker-sep">·</span>
        <div className="analytics-ticker-item">
          <span className="status-led" />
          <span className="ticker-val">{running ? "SESSION ACTIVE" : "READY"}</span>
        </div>
        <span className="ticker-sep">·</span>
        <div className="promptbar-hint">
          <span className="xbox-btn btn-guide">❖</span>
          <span>Guide</span>
        </div>
      </div>
    </footer>
  );
};
