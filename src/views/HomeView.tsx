// Screen 1: Consoles Hub (Platform Selection Carousel)
//
// Implements UI/UX Design System Specification:
// - 3D Perspective Carousel (perspective: 1200px) with elliptical curve & 15% isotropic focus scale (scale(1.15))
// - High-precision Vector Console Silhouettes (3DS dual-screen hinge, Switch detached rails, Steam/PC monitor chassis)
// - Hardware Meta Badge (manufacturer branding, hardware release year, installed ROM count)
// - Center HUD header (< SELECT CONSOLE (X/Y) >, Console Title, Game Count, [PRESS (A) TO OPEN])
// - Controller Mapping: D-Pad Left/Right cycle, LB/RB Maker Filter jump, A Open Console, X Rescan, Y Global Search

import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, formatRelativeDate, getContrastTextColor, PlatformSummary } from "../api";
import { ConsoleHardwareSvg } from "../components/Collectible";
import { ConsoleEnvironment } from "../components/ConsoleEnvironment";
import { BottomPromptBar } from "../components/TopBar";
import { usePad } from "../input";
import { useStore } from "../store";

const MAKERS = ["All", "Valve", "Nintendo", "Sony", "Sega", "Microsoft", "Other"] as const;

export const HomeView: React.FC = () => {
  const {
    platforms,
    homeIndex,
    setHomeIndex,
    navigate,
    triggerScan,
    appSettings,
    updateAppSettings,
    setQuickMenu,
    openKeyboard,
    pushToast,
    running,
  } = useStore();

  const [makerIdx, setMakerIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const maker = MAKERS[makerIdx];

  const filteredPlatforms: PlatformSummary[] = useMemo(() => {
    return platforms.filter((p) => {
      if (maker === "All") return true;
      if (maker === "Valve") return p.manufacturer === "Valve" || p.manufacturer === "PC";
      if (maker === "Other") {
        return !["Valve", "PC", "Nintendo", "Sony", "Sega", "Microsoft"].includes(p.manufacturer);
      }
      return p.manufacturer === maker;
    });
  }, [platforms, maker]);

  const clampedHome = Math.min(homeIndex, Math.max(0, filteredPlatforms.length - 1));
  const activePlatform = filteredPlatforms[clampedHome] || filteredPlatforms[0] || null;

  useEffect(() => {
    if (!trackRef.current) return;
    const card = trackRef.current.querySelector<HTMLElement>(`[data-idx="${clampedHome}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [clampedHome, filteredPlatforms.length]);

  const openGlobalSearch = () => {
    openKeyboard({
      title: "Global Library & Console Search",
      initial: "",
      placeholder: "Search games or consoles…",
      onSubmit: async (q) => {
        const query = q.trim().toLowerCase();
        if (!query) return;
        const platIdx = filteredPlatforms.findIndex(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.shortName.toLowerCase().includes(query)
        );
        if (platIdx !== -1) {
          setHomeIndex(platIdx);
          return;
        }
        try {
          const allGames = await api.getGames(null);
          const match = allGames.find(
            (g) => !g.hidden && !g.missing && g.title.toLowerCase().includes(query)
          );
          if (match) {
            navigate({ kind: "game", gameId: match.id });
            return;
          }
          pushToast(`No console or game matching "${q}"`, "info");
        } catch (err) {
          pushToast(String(err), "error");
        }
      },
    });
  };

  usePad((btn) => {
    if (btn === "lb") {
      setMakerIdx((i) => (i - 1 + MAKERS.length) % MAKERS.length);
      setHomeIndex(0);
      return true;
    }
    if (btn === "rb") {
      setMakerIdx((i) => (i + 1) % MAKERS.length);
      setHomeIndex(0);
      return true;
    }
    if (btn === "left" && filteredPlatforms.length > 0) {
      setHomeIndex((clampedHome - 1 + filteredPlatforms.length) % filteredPlatforms.length);
      return true;
    }
    if (btn === "right" && filteredPlatforms.length > 0) {
      setHomeIndex((clampedHome + 1) % filteredPlatforms.length);
      return true;
    }
    if (btn === "a" && activePlatform) {
      navigate({ kind: "platform", platformId: activePlatform.id });
      return true;
    }
    if (btn === "x" && !running) {
      triggerScan();
      return true;
    }
    if (btn === "y") {
      openGlobalSearch();
      return true;
    }
    if (btn === "start") {
      setQuickMenu(true);
      return true;
    }
    if (btn === "select") {
      updateAppSettings({
        ...appSettings,
        showEmptyPlatforms: !appSettings.showEmptyPlatforms,
      });
      return true;
    }
    return false;
  }, 0);

  const bgAccent = activePlatform?.accent || "#FF3D55";
  const bgColor = activePlatform?.color || "#101622";

  return (
    <div
      className="home-showcase"
      style={
        {
          "--theme-color": bgColor,
          "--theme-accent": bgAccent,
        } as React.CSSProperties
      }
    >
      {/* Dynamic Console-Themed Environment */}
      <ConsoleEnvironment platformId={activePlatform?.id} />

      <div className="showcase-grid-floor" />

      {/* Manufacturer filter strip */}
      <div className="home-filter-bar">
        <span className="pill-hint">LB</span>
        <div className="maker-tabs">
          {MAKERS.map((m, idx) => (
            <button
              key={m}
              className={`maker-tab ${idx === makerIdx ? "active" : ""}`}
              onClick={() => {
                setMakerIdx(idx);
                setHomeIndex(0);
              }}
            >
              {m === "Valve" ? "PC / Steam" : m}
            </button>
          ))}
        </div>
        <span className="pill-hint">RB</span>

        <div className="home-filter-spacer" />
        <button
          className={`toggle-empty-btn ${appSettings.showEmptyPlatforms ? "active" : ""}`}
          onClick={() =>
            updateAppSettings({
              ...appSettings,
              showEmptyPlatforms: !appSettings.showEmptyPlatforms,
            })
          }
        >
          {appSettings.showEmptyPlatforms ? "All 42 Systems (View)" : "Installed Only (View)"}
        </button>
      </div>

      {activePlatform ? (
        <section className="console-hero-carousel-stage">
          {/* Spec Center HUD Header: < SELECT CONSOLE (3/8) > / Console Title / X Games / [PRESS (A) TO OPEN] */}
          <div className="carousel-hero-header">
            <span className="carousel-hero-counter">
              &lt; SELECT CONSOLE ({clampedHome + 1}/{filteredPlatforms.length}) &gt;
            </span>
            <h1 className="carousel-hero-active-title">{activePlatform.name}</h1>
            <span className="carousel-hero-game-count">
              {activePlatform.gameCount} {activePlatform.gameCount === 1 ? "Game" : "Games"} ·{" "}
              {activePlatform.year}
            </span>
            <button
              className="carousel-press-open-pill"
              onClick={() => navigate({ kind: "platform", platformId: activePlatform.id })}
            >
              [PRESS (A) TO OPEN]
            </button>
          </div>

          <div className="console-carousel-track" ref={trackRef}>
            {filteredPlatforms.map((plat, idx) => {
              const offset = idx - clampedHome;
              const focused = idx === clampedHome;
              const absOffset = Math.abs(offset);
              const opacity = focused ? 1 : Math.max(0.55, 1 - absOffset * 0.14);

              return (
                <div
                  key={plat.id}
                  data-idx={idx}
                  className={`console-hero-card ${focused ? "is-focused" : ""}`}
                  style={
                    {
                      "--card-color": plat.color,
                      "--card-accent": plat.accent,
                      "--offset": Math.max(-4, Math.min(4, offset)),
                      opacity,
                    } as React.CSSProperties
                  }
                  onMouseEnter={() => setHomeIndex(idx)}
                  onClick={() => {
                    if (focused) {
                      navigate({ kind: "platform", platformId: plat.id });
                    } else {
                      setHomeIndex(idx);
                    }
                  }}
                >
                  <div className="hero-card-pedestal-glow" />

                  <div className="hero-card-top">
                    <span
                      className="hero-card-maker"
                      style={{ borderColor: plat.accent, color: plat.accent }}
                    >
                      {plat.manufacturer}
                    </span>
                    <span className="hero-card-year">{plat.year}</span>
                    <span className="hero-card-count">
                      {plat.gameCount} {plat.gameCount === 1 ? "Game" : "Games"}
                    </span>
                  </div>

                  <div className="hero-card-hardware-box">
                    <ConsoleHardwareSvg platform={plat} className="hero-card-svg" />
                  </div>

                  <div className="hero-card-bottom">
                    <div className="hero-card-title-group">
                      <h2 className="hero-card-title">{plat.name}</h2>
                      <div className="hero-card-media-badge">
                        {plat.media.toUpperCase()} COLLECTION
                      </div>
                    </div>

                    <div className="hero-card-meta-row">
                      <span className="hero-card-last-played">
                        {plat.lastPlayed
                          ? `Last played ${formatRelativeDate(plat.lastPlayed)}`
                          : "Ready to launch"}
                      </span>
                    </div>

                    {focused && (
                      <button
                        className="hero-card-enter-btn"
                        style={{
                          background: plat.accent,
                          color: getContrastTextColor(plat.accent),
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ kind: "platform", platformId: plat.id });
                        }}
                      >
                        <span>Open {plat.shortName} Library</span>
                        <span className="xbox-btn btn-a">A</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="console-empty-state">
          <h2>No Consoles Found in This Category</h2>
          <p>
            Press <b>View (Select)</b> to browse all 42 supported gaming systems, or open{" "}
            <b>Settings → Library &amp; ROM Folders</b> to add your games directory.
          </p>
          <div className="empty-actions">
            <button
              className="btn-primary"
              onClick={() => updateAppSettings({ ...appSettings, showEmptyPlatforms: true })}
            >
              Show All 42 Consoles
            </button>
            <button
              className="btn-ghost"
              onClick={() => navigate({ kind: "settings", section: "directories" })}
            >
              Configure ROM Directories
            </button>
          </div>
        </section>
      )}

      <BottomPromptBar
        items={[
          {
            btn: "A",
            label: "Open Console",
            onClick: activePlatform
              ? () => navigate({ kind: "platform", platformId: activePlatform.id })
              : undefined,
          },
          ...(!running ? [{ btn: "X" as const, label: "Rescan", onClick: () => triggerScan() }] : []),
          {
            btn: "LB/RB",
            label: "Maker Filter",
            onClick: () => {
              setMakerIdx((i) => (i + 1) % MAKERS.length);
              setHomeIndex(0);
            },
          },
          {
            btn: "Y",
            label: "Search",
            onClick: openGlobalSearch,
          },
          {
            btn: "VIEW",
            label: appSettings.showEmptyPlatforms ? "Installed Only" : "All 42 Systems",
            onClick: () =>
              updateAppSettings({
                ...appSettings,
                showEmptyPlatforms: !appSettings.showEmptyPlatforms,
              }),
          },
          {
            btn: "B",
            label: "Back",
            onClick: () => setMakerIdx(0),
          },
        ]}
      />
    </div>
  );
};
