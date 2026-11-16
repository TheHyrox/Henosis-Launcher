// Persistent Header (52px) and Persistent Quiet Footer (36px)
// Calm neutral charcoal (#141518) with warm amber (#e9a23b) active accent:
// - Header Left: Plain "Henosis" wordmark + 3 text tabs (Library, Consoles, Settings) with thin amber underline
// - Header Right: Rescan action, minimal controller status, and tabular clock
// - Footer Left: Outlined circle + label per controller button (4-5 relevant hints)
// - Footer Right: "<X> h played · Ready"

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  if (!connected) return "Keyboard";
  const lower = rawName.toLowerCase();
  if (
    lower.includes("dualsense") ||
    lower.includes("dualshock") ||
    lower.includes("playstation") ||
    lower.includes("sony")
  ) {
    return "DualSense";
  }
  if (lower.includes("switch") || lower.includes("pro controller") || lower.includes("nintendo")) {
    return "Switch Pro";
  }
  return "Xbox Pad";
}

function formatTotalHours(seconds: number): string {
  if (!seconds || seconds <= 0) return "0.0 h played";
  const hrs = seconds / 3600;
  if (hrs < 0.1) return `${Math.max(1, Math.round(seconds / 60))} m played`;
  if (hrs < 100) return `${hrs.toFixed(1)} h played`;
  return `${Math.round(hrs)} h played`;
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
  } = useStore();

  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
  );
  const [pad, setPad] = useState<{ connected: boolean; name: string }>({
    connected: false,
    name: "",
  });

  useEffect(() => {
    const t = setInterval(() => {
      setClock(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    }, 10000);
    const unsub = onPadStatus(setPad);
    return () => {
      clearInterval(t);
      unsub();
    };
  }, []);

  const handleOpenLibrary = () => {
    if (screen.kind === "platform") return;
    const targetPlat = platforms[homeIndex] || platforms[0] || platformDefs[0];
    if (targetPlat) {
      navigate({ kind: "platform", platformId: targetPlat.id });
    }
  };

  const isLibraryActive = screen.kind === "platform" || screen.kind === "game";
  const profileLabel = detectControllerProfile(pad.name, pad.connected);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="brand-wordmark" onClick={goHome} title="Henosis Home">
          Henosis
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
          <div
            className="running-banner"
            onClick={() => useStore.getState().setSessionOverlayOpen(true)}
            title="Open Session Menu (R3)"
          >
            <span className="pulse-dot" />
            <span>
              {running.status === "STARTING"
                ? `Starting: ${running.title}`
                : running.status === "STOPPING"
                  ? `Stopping: ${running.title}`
                  : `Now Playing: ${running.title}`}
            </span>
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
          className="topbar-action"
          onClick={() => triggerScan()}
          disabled={scanning}
          title="Rescan Library"
        >
          ↻ Rescan
        </button>

        <span
          className={`pad-status ${pad.connected ? "is-connected" : ""}`}
          title={pad.connected ? pad.name : "Keyboard & Controller Ready"}
        >
          <span className="pad-status-dot" />
          <span>{profileLabel}</span>
        </span>

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
  const [slot, setSlot] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? document.getElementById("henosis-footer-slot") : null
  );

  useEffect(() => {
    if (!slot) {
      setSlot(document.getElementById("henosis-footer-slot"));
    }
  }, [slot]);

  const visibleItems = items.slice(0, 5);

  const content = (
    <footer className="promptbar">
      <div className="promptbar-list">
        {visibleItems.map((it, idx) => (
          <button
            key={`${it.btn}-${idx}`}
            className="prompt-item"
            onClick={it.onClick}
            disabled={!it.onClick}
          >
            <span className="btn-circle">{it.btn}</span>
            <span className="prompt-label">{it.label}</span>
          </button>
        ))}
      </div>

      <div className="promptbar-analytics">
        <span>{formatTotalHours(totalPlaytimeSeconds)}</span>
        <span className="ticker-sep">·</span>
        <span>{running ? "Session active" : "Ready"}</span>
      </div>
    </footer>
  );

  return slot ? createPortal(content, slot) : content;
};
