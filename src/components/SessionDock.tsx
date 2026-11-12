// Persistent Session Dock – compact floating bottom-left widget when a game session is active.
// Keeps all session telemetry & controller actions in a sleek card above the bottom prompt bar.

import React, { useEffect, useState } from "react";
import { mediaSrc, SessionStatus } from "../api";
import { useStore } from "../store";

export const SessionDock: React.FC = () => {
  const {
    running,
    sessionError,
    holdXProgress,
    holdBProgress,
    setSessionOverlayOpen,
    stopRunning,
    setSessionError,
    navigate,
    platformDefs,
  } = useStore();

  const [elapsed, setElapsed] = useState("00:00:00");

  const status: SessionStatus = running
    ? running.status || "RUNNING"
    : sessionError
      ? "ERROR"
      : "IDLE";

  useEffect(() => {
    if (!running || status !== "RUNNING") {
      setElapsed("00:00:00");
      return;
    }

    const update = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const totalSec = Math.max(0, nowSec - running.started);
      const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
      const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
      const s = String(totalSec % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [running?.gameId, running?.started, status]);

  const isVisible = status !== "IDLE";
  const coverUrl = running?.cover ? mediaSrc(running.cover) : null;
  const platDef = running
    ? platformDefs.find((p) => p.id === running.platform)
    : undefined;
  const platformLabel = platDef?.shortName || running?.platform?.toUpperCase() || "";
  const runnerLabel = running?.runner || (running?.platform === "steam" ? "Steam" : "Emulator");

  const stateClass =
    status === "STARTING"
      ? "is-starting"
      : status === "RUNNING"
        ? "is-running"
        : status === "STOPPING"
          ? "is-stopping"
          : status === "ERROR"
            ? "is-error"
            : "";

  return (
    <aside
      className={`session-dock ${isVisible ? "is-visible" : ""} ${stateClass}`}
      aria-hidden={!isVisible}
    >
      {status === "ERROR" && sessionError ? (
        <div className="session-dock-inner">
          <div className="session-dock-top">
            <div className="session-dock-thumb session-dock-thumb-err">!</div>
            <div className="session-dock-meta">
              <div className="session-dock-title-row">
                <strong className="session-dock-title">{sessionError.title}</strong>
                <span className="session-dock-badge badge-err">ERROR</span>
              </div>
              <p className="session-dock-sub session-dock-sub-err">
                {sessionError.message}
              </p>
            </div>
          </div>

          <div className="session-dock-actions">
            <button
              className="session-dock-btn session-dock-btn-logs"
              onClick={() => {
                const gid = sessionError.gameId;
                setSessionError(null);
                navigate({ kind: "game", gameId: gid, initialTab: "sessions" });
              }}
            >
              <span className="xbox-btn btn-a">A</span>
              <span>View Logs</span>
            </button>
            <button
              className="session-dock-btn"
              onClick={() => setSessionError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : running ? (
        <div className="session-dock-inner">
          {/* Top Cluster: Cover + Title + Runner/Platform + Status/Timer */}
          <div className="session-dock-top">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={running.title}
                className="session-dock-thumb"
              />
            ) : (
              <div className="session-dock-thumb session-dock-thumb-fallback">
                🎮
              </div>
            )}

            <div className="session-dock-meta">
              <div className="session-dock-title-row">
                <strong className="session-dock-title">{running.title}</strong>
                <span className="session-dock-runner-pill">
                  {runnerLabel}
                  {platformLabel ? ` / ${platformLabel}` : ""}
                </span>
              </div>

              {status === "STARTING" ? (
                <p className="session-dock-sub session-dock-sub-amber">
                  {running.statusMessage ||
                    "Preparing emulator & config…"}
                </p>
              ) : status === "STOPPING" ? (
                <div className="session-dock-status-row">
                  <span className="session-dock-status-stopping">
                    <span className="session-dot dot-amber" />
                    CLOSING SESSION…
                  </span>
                </div>
              ) : (
                <div className="session-dock-status-row">
                  <span className="session-dock-status-running">
                    <span className="session-dot dot-emerald" />
                    RUNNING
                  </span>
                  <span className="session-dock-sep">•</span>
                  <span className="session-dock-timer">{elapsed}</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar (Only during STARTING) */}
          {status === "STARTING" && (
            <div className="session-progress-track">
              <div className="session-progress-bar" />
            </div>
          )}

          {/* Bottom Cluster: Compact Controller Actions */}
          <div className="session-dock-actions">
            {status === "STARTING" ? (
              <button
                className="session-dock-hold-btn is-cancel"
                onClick={() => stopRunning()}
                title="Hold B (600ms) or click to cancel launch"
              >
                <span
                  className="session-hold-fill fill-amber"
                  style={{ width: `${holdBProgress}%` }}
                />
                <span className="xbox-btn btn-b">B</span>
                <span className="session-hold-label">Hold to Cancel</span>
              </button>
            ) : status === "STOPPING" ? (
              <span className="session-dock-closing-pill">Flushing saves…</span>
            ) : (
              <>
                <button
                  className="session-dock-btn"
                  onClick={() => setSessionOverlayOpen(true)}
                  title="Open Quick Session Menu (R3 / F2)"
                >
                  <kbd className="r3-kbd">R3</kbd>
                  <span>Menu</span>
                </button>

                <button
                  className="session-dock-hold-btn is-stop"
                  onClick={() => stopRunning()}
                  title="Hold X (800ms) or click to stop game"
                >
                  <span
                    className="session-hold-fill fill-crimson"
                    style={{ width: `${holdXProgress}%` }}
                  />
                  <span className="xbox-btn btn-x">X</span>
                  <span className="session-hold-label">Hold to Stop</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
};
