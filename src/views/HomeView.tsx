// Step 1 of the Console-First Flow: 3D Console Showcase Carousel with Dynamic Environment
//
// Directive implementations:
// - Dynamic Console-Themed Environment (Wii U cyan wavy ribbons, Switch scarlet glowing waves,
//   PlayStation navy/indigo atmosphere, Xbox 360 radiant emerald curves).
// - Interactive 3D Showcase Carousel: highlighted console elevated and centered facing forward,
//   adjacent systems angled inward with realistic perspective, depth of field blur, and smooth transitions.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatRelativeDate, PlatformSummary } from "../api";
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
    if (btn === "x") {
      triggerScan();
      return true;
    }
    if (btn === "y") {
      updateAppSettings({
        ...appSettings,
        showEmptyPlatforms: !appSettings.showEmptyPlatforms,
      });
      return true;
    }
    if (btn === "start") {
      setQuickMenu(true);
      return true;
    }
    if (btn === "select") {
      navigate({ kind: "settings" });
      return true;
    }
    return false;
  }, 0);

  const bgAccent = activePlatform?.accent || "#7c5cff";
  const bgColor = activePlatform?.color || "#121628";

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

      {/* Top manufacturer filter strip */}
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
          {appSettings.showEmptyPlatforms ? "All 42 Systems Shown (Y)" : "Installed Systems Only (Y)"}
        </button>
      </div>

      {activePlatform ? (
        /* Grand Central Hero Carousel Stage (Maximum Height replacing static hero stage) */
        <section className="console-hero-carousel-stage">
          <div className="carousel-hero-header">
            <span className="carousel-hero-counter">
              ◀ SELECT CONSOLE ({clampedHome + 1} / {filteredPlatforms.length}) ▶
            </span>
            <span className="carousel-hero-sub">
              D-Pad Left / Right to rotate · Press <b>A</b> to enter {activePlatform.shortName} Library
            </span>
          </div>

          <div className="console-carousel-track" ref={trackRef}>
            {filteredPlatforms.map((plat, idx) => {
              const offset = idx - clampedHome;
              const focused = idx === clampedHome;
              const absOffset = Math.abs(offset);
              const blur = focused ? 0 : Math.min(4.5, absOffset * 1.3);

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
                      filter: `blur(${blur}px)`,
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
                          : "Not played yet"}
                      </span>
                    </div>

                    {focused && (
                      <button
                        className="hero-card-enter-btn"
                        style={{ background: plat.accent }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ kind: "platform", platformId: plat.id });
                        }}
                      >
                        <span>Browse {plat.shortName} Library</span>
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
            Press <b>Y</b> to browse all 42 supported gaming systems, or open{" "}
            <b>Settings → Library & ROM Folders</b> to add your games directory.
          </p>
          <div className="empty-actions">
            <button
              className="btn-primary"
              onClick={() => updateAppSettings({ ...appSettings, showEmptyPlatforms: true })}
            >
              Show All 42 Consoles (Y)
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
            label: "Open Console Games",
            onClick: activePlatform
              ? () => navigate({ kind: "platform", platformId: activePlatform.id })
              : undefined,
          },
          { btn: "X", label: "Rescan Library", onClick: () => triggerScan() },
          {
            btn: "Y",
            label: appSettings.showEmptyPlatforms ? "Installed Only" : "Show All 42 Consoles",
            onClick: () =>
              updateAppSettings({
                ...appSettings,
                showEmptyPlatforms: !appSettings.showEmptyPlatforms,
              }),
          },
          { btn: "LB", label: "Prev Maker" },
          { btn: "RB", label: "Next Maker" },
          {
            btn: "SELECT",
            label: "Settings",
            onClick: () => navigate({ kind: "settings" }),
          },
          { btn: "START", label: "Quick Menu", onClick: () => setQuickMenu(true) },
        ]}
      />
    </div>
  );
};
