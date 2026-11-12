// Quick Session Overlay Modal (triggered via R3 / F2 or clicking the Session Dock menu).
// Controller-navigable 480px modal dedicated to the currently running game session.

import React, { useEffect, useState } from "react";
import { api, getContrastTextColor, mediaSrc } from "../api";
import { usePad } from "../input";
import { useStore } from "../store";

export const SessionOverlayModal: React.FC = () => {
  const {
    running,
    sessionOverlayOpen,
    setSessionOverlayOpen,
    stopRunning,
    navigate,
    platformDefs,
    holdXProgress,
  } = useStore();

  const [focusIdx, setFocusIdx] = useState(0);
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (sessionOverlayOpen) setFocusIdx(0);
  }, [sessionOverlayOpen]);

  useEffect(() => {
    if (!sessionOverlayOpen || !running) return;
    const update = () => {
      const totalSec = Math.max(0, Math.floor(Date.now() / 1000) - running.started);
      const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
      const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
      const s = String(totalSec % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sessionOverlayOpen, running?.started, running?.gameId]);

  const resumeGame = () => {
    setSessionOverlayOpen(false);
    api.resumeGame().catch(() => {});
  };

  const openLogs = () => {
    if (!running) return;
    setSessionOverlayOpen(false);
    navigate({ kind: "game", gameId: running.gameId, initialTab: "sessions" });
  };

  const forceStop = () => {
    setSessionOverlayOpen(false);
    stopRunning();
  };

  const actions = [
    {
      id: "resume",
      label: "Resume / Focus Game Window",
      sub: "Bring the running game or emulator back to the foreground",
      badge: "A",
      badgeClass: "btn-a",
      danger: false,
      run: resumeGame,
    },
    {
      id: "logs",
      label: "Open Game Hub & Logs",
      sub: "Inspect live stdout/stderr output & session history",
      badge: "Y",
      badgeClass: "btn-y",
      danger: false,
      run: openLogs,
    },
    {
      id: "stop",
      label: "Force Stop Session",
      sub: "Send SIGTERM, flush saves, and log session duration",
      badge: "Hold X",
      badgeClass: "btn-x",
      danger: true,
      run: forceStop,
    },
    {
      id: "close",
      label: "Close Overlay",
      sub: "Return to the Henosis menu underneath",
      badge: "B",
      badgeClass: "btn-b",
      danger: false,
      run: () => setSessionOverlayOpen(false),
    },
  ];

  usePad(
    (btn) => {
      if (!sessionOverlayOpen) return false;
      if (btn === "b" || btn === "start") {
        setSessionOverlayOpen(false);
        return true;
      }
      if (btn === "y") {
        openLogs();
        return true;
      }
      if (btn === "up") {
        setFocusIdx((i) => (i - 1 + actions.length) % actions.length);
        return true;
      }
      if (btn === "down") {
        setFocusIdx((i) => (i + 1) % actions.length);
        return true;
      }
      if (btn === "a") {
        actions[focusIdx]?.run();
        return true;
      }
      return true;
    },
    18,
    sessionOverlayOpen && Boolean(running)
  );

  if (!sessionOverlayOpen || !running) return null;

  const coverUrl = running.cover ? mediaSrc(running.cover) : null;
  const platDef = platformDefs.find((p) => p.id === running.platform);
  const accent = platDef?.accent || "#00E676";

  return (
    <div
      className="session-overlay-backdrop"
      onClick={() => setSessionOverlayOpen(false)}
    >
      <div
        className="session-overlay-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="session-overlay-header">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={running.title}
              className="session-overlay-cover"
            />
          ) : (
            <div className="session-overlay-cover session-overlay-cover-fallback">
              🎮
            </div>
          )}

          <div className="session-overlay-meta">
            <div className="session-overlay-eyebrow">
              <span className="session-dot dot-emerald" />
              <span>ACTIVE SESSION</span>
            </div>
            <h2 className="session-overlay-title">{running.title}</h2>
            <div className="session-overlay-pills">
              <span
                className="session-overlay-plat-badge"
                style={{
                  background: accent,
                  color: getContrastTextColor(accent),
                }}
              >
                {platDef?.name || running.platform.toUpperCase()}
              </span>
              <span className="session-overlay-timer">{elapsed}</span>
            </div>
          </div>
        </div>

        <div className="session-overlay-actions">
          {actions.map((item, idx) => (
            <button
              key={item.id}
              className={`session-overlay-item ${
                idx === focusIdx ? "focused" : ""
              } ${item.danger ? "danger" : ""}`}
              onMouseEnter={() => setFocusIdx(idx)}
              onClick={item.run}
            >
              {item.danger && holdXProgress > 0 && (
                <span
                  className="session-hold-fill fill-crimson"
                  style={{ width: `${holdXProgress}%` }}
                />
              )}
              <div className="session-overlay-item-text">
                <div className="session-overlay-item-label">{item.label}</div>
                <div className="session-overlay-item-sub">{item.sub}</div>
              </div>
              <span className={`xbox-btn ${item.badgeClass} session-overlay-btn-badge`}>
                {item.badge}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
