// Quick Guide / System overlay menu (opened with Start or when summoned while a game is running).

import React, { useEffect, useState } from "react";
import { api } from "../api";
import { usePad } from "../input";
import { useStore } from "../store";

export const QuickMenuModal: React.FC = () => {
  const {
    quickMenuOpen,
    setQuickMenu,
    running,
    stopRunning,
    goHome,
    navigate,
    triggerScan,
  } = useStore();
  const [idx, setIdx] = useState(0);

  const actions = [
    ...(running
      ? [
          {
            label: `Resume ${running.title}`,
            sub: "Hide launcher and return to running game",
            run: () => {
              setQuickMenu(false);
              api.resumeGame();
            },
          },
          {
            label: `Stop ${running.title}`,
            sub: "Terminate the running game process",
            danger: true,
            run: () => {
              setQuickMenu(false);
              stopRunning();
            },
          },
        ]
      : []),
    {
      label: "Console Hub (Home)",
      sub: "Return to the main platform selection screen",
      run: () => {
        setQuickMenu(false);
        goHome();
      },
    },
    {
      label: "Rescan Game Library",
      sub: "Scan Steam and all configured ROM directories now",
      run: () => {
        setQuickMenu(false);
        triggerScan();
      },
    },
    {
      label: "Settings & Emulators",
      sub: "Configure ROM folders, emulators, BIOS paths, and system options",
      run: () => {
        setQuickMenu(false);
        navigate({ kind: "settings" });
      },
    },
    {
      label: "Minimize to Background",
      sub: "Hide window and wait for the Xbox Guide button",
      run: () => {
        setQuickMenu(false);
        api.hideWindow();
      },
    },
    {
      label: "Quit Henosis Launcher",
      sub: "Exit the application completely",
      danger: true,
      run: () => {
        api.quitApp();
      },
    },
  ];

  useEffect(() => {
    if (quickMenuOpen) setIdx(0);
  }, [quickMenuOpen, running]);

  usePad(
    (btn) => {
      if (!quickMenuOpen) return false;
      if (btn === "up") {
        setIdx((i) => (i - 1 + actions.length) % actions.length);
      } else if (btn === "down") {
        setIdx((i) => (i + 1) % actions.length);
      } else if (btn === "a") {
        actions[idx]?.run();
      } else if (btn === "b" || btn === "start") {
        setQuickMenu(false);
      }
      return true;
    },
    20,
    quickMenuOpen
  );

  if (!quickMenuOpen) return null;

  return (
    <div className="modal-backdrop" onClick={() => setQuickMenu(false)}>
      <div className="quick-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quick-header">
          <span className="quick-badge">❖ HENOSIS GUIDE</span>
          <h3>Quick Menu</h3>
        </div>
        <div className="quick-list">
          {actions.map((a, i) => (
            <button
              key={a.label}
              className={`quick-item ${i === idx ? "focused" : ""} ${
                (a as { danger?: boolean }).danger ? "danger" : ""
              }`}
              onMouseEnter={() => setIdx(i)}
              onClick={a.run}
            >
              <div className="quick-item-label">{a.label}</div>
              <div className="quick-item-sub">{a.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
