// Top console status bar and bottom controller button-legend bar.

import React, { useEffect, useState } from "react";
import { onPadStatus } from "../input";
import { useStore } from "../store";

export interface PromptItem {
  btn: "A" | "B" | "X" | "Y" | "LB" | "RB" | "LT" | "RT" | "START" | "SELECT" | "GUIDE";
  label: string;
  onClick?: () => void;
}

export const TopBar: React.FC = () => {
  const { screen, navigate, goHome, triggerScan, scanning, scanStatus, running, setQuickMenu } =
    useStore();
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  const [pad, setPad] = useState<{ connected: boolean; name: string }>({
    connected: false,
    name: "",
  });

  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 10000);
    const unsub = onPadStatus(setPad);
    return () => {
      clearInterval(t);
      unsub();
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="brand-pill" onClick={goHome} title="Home">
          <span className="brand-glyph">◆</span>
          <span className="brand-name">HENOSIS</span>
        </button>

        <nav className="topbar-nav">
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
          className="topbar-action"
          onClick={() => triggerScan()}
          disabled={scanning}
          title="Rescan Library"
        >
          ↻ Rescan
        </button>
        <div
          className={`pad-indicator ${pad.connected ? "connected" : "disconnected"}`}
          title={pad.connected ? pad.name : "No controller detected (keyboard active)"}
        >
          <span className="pad-icon">🎮</span>
          <span className="pad-text">{pad.connected ? "Controller" : "Keyboard"}</span>
        </div>
        <button className="topbar-clock" onClick={() => setQuickMenu(true)} title="Quick Menu (Start)">
          {clock}
        </button>
      </div>
    </header>
  );
};

export const BottomPromptBar: React.FC<{ items: PromptItem[] }> = ({ items }) => {
  return (
    <footer className="promptbar">
      <div className="promptbar-list">
        {items.map((it, idx) => (
          <button
            key={`${it.btn}-${idx}`}
            className="prompt-item"
            onClick={it.onClick}
            disabled={!it.onClick}
          >
            <span className={`xbox-btn btn-${it.btn.toLowerCase()}`}>{it.btn}</span>
            <span className="prompt-label">{it.label}</span>
          </button>
        ))}
      </div>
      <div className="promptbar-hint">
        <span className="xbox-btn btn-guide">❖</span>
        <span>Xbox Guide · Summon / Home</span>
      </div>
    </footer>
  );
};
