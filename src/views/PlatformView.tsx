// Screens 2, 3 & 4 of the UI/UX Design System Specification:
// - Screen 2: 3D Cartridge / Disc Coverflow View (3D physical media, showroom floor reflection, 45° inward flanking spines)
// - Screen 3: High-Density Grid / Poster Wall View (adaptive 1:1 / 3:4 / 2:3 aspect ratios, 3px neon focus ring, scale(1.08),
//             40% opacity 60px blurred background crossfade, fixed bottom preview card, 4-way spatial D-Pad + LT/RT 2-row jump)
// - Screen 4: Quick-Details Slide-Over Drawer (38% width right slide-over, 450ms cubic-bezier, left grid dimmed to 30% + 10px blur,
//             vertical micro-hierarchy with 3D box art, green PLAY NOW (A), FULL DETAILS (X), 2-col specs, synopsis & stats)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
  Game,
  getContrastTextColor,
  mediaSrc,
  Platform,
} from "../api";
import { CollectibleCard } from "../components/Collectible";
import { ConsoleEnvironment } from "../components/ConsoleEnvironment";
import { BottomPromptBar } from "../components/TopBar";
import { usePad } from "../input";
import { useStore } from "../store";

const SORTS = [
  { id: "title", label: "A–Z" },
  { id: "recent", label: "Recent" },
  { id: "playtime", label: "Playtime" },
  { id: "favorites", label: "Favorites" },
] as const;

const GRID_COLS = 7;

function getPlatformPosterAspectClass(platformId: string): string {
  const pid = platformId.toLowerCase();
  // 1:1 square art (DS, 3DS, Game Boy, PS1 jewel cases, Saturn, Dreamcast, NGP, PokéMini)
  if (["nds", "n3ds", "gb", "gbc", "psx", "dreamcast", "saturn", "ngp", "pokemini"].includes(pid)) {
    return "poster-aspect-1-1";
  }
  // 3:4 classic cartridge box art (GBA, SNES, NES, N64, Mega Drive, Master System, Game Gear)
  if (["gba", "snes", "nes", "n64", "megadrive", "mastersystem", "gamegear", "pcengine"].includes(pid)) {
    return "poster-aspect-3-4";
  }
  // 2:3 vertical modern & PC/Steam box art
  return "poster-aspect-2-3";
}

const PosterWallImage: React.FC<{
  game: Game;
  platform: Platform;
}> = ({ game, platform }) => {
  const [stage, setStage] = useState<"cover" | "steam_cdn" | "header" | "hero" | "failed">("cover");

  const steamCdn = game.steamAppId
    ? `https://shared.steamstatic.com/store_item_assets/steam/apps/${game.steamAppId}/library_600x900.jpg`
    : null;

  useEffect(() => {
    setStage("cover");
  }, [game.id, game.cover, game.hero]);

  const rawCover = mediaSrc(game.cover);
  let src: string | null = null;

  if (stage === "cover") {
    if (rawCover) src = rawCover;
    else if (steamCdn) src = steamCdn;
    else if (game.metadata?.header) src = mediaSrc(game.metadata.header);
    else if (game.hero) src = mediaSrc(game.hero);
  } else if (stage === "steam_cdn") {
    if (steamCdn && rawCover !== steamCdn) src = steamCdn;
    else if (game.metadata?.header) src = mediaSrc(game.metadata.header);
    else if (game.hero) src = mediaSrc(game.hero);
  } else if (stage === "header") {
    if (game.metadata?.header) src = mediaSrc(game.metadata.header);
    else if (game.hero) src = mediaSrc(game.hero);
  } else if (stage === "hero") {
    if (game.hero) src = mediaSrc(game.hero);
  }

  const handleError = () => {
    if (stage === "cover") {
      if (steamCdn && rawCover !== steamCdn) setStage("steam_cdn");
      else if (game.metadata?.header) setStage("header");
      else if (game.hero) setStage("hero");
      else setStage("failed");
    } else if (stage === "steam_cdn") {
      if (game.metadata?.header) setStage("header");
      else if (game.hero) setStage("hero");
      else setStage("failed");
    } else if (stage === "header") {
      if (game.hero) setStage("hero");
      else setStage("failed");
    } else {
      setStage("failed");
    }
  };

  if (!src || stage === "failed") {
    return (
      <div className="poster-card-fallback">
        <span
          className="poster-fallback-plat"
          style={{ color: platform.accent, borderColor: platform.accent }}
        >
          {platform.shortName}
        </span>
        <strong className="poster-fallback-title">{game.title}</strong>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={game.title}
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  );
};

export const PlatformView: React.FC<{ platformId: string }> = ({ platformId }) => {
  const {
    platforms,
    platformDefs,
    platformFocus,
    setPlatformFocus,
    platformViewMode,
    togglePlatformViewMode,
    navigate,
    replaceScreen,
    back,
    launchGame,
    openKeyboard,
    openFileBrowser,
    pushToast,
    refreshOverview,
    setQuickMenu,
  } = useStore();

  const [games, setGames] = useState<Game[]>([]);
  const [sortIdx, setSortIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [scraping, setScraping] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const drawerDescRef = useRef<HTMLDivElement | null>(null);

  const platform: Platform | undefined = useMemo(
    () =>
      platforms.find((p) => p.id === platformId) ||
      platformDefs.find((p) => p.id === platformId),
    [platforms, platformDefs, platformId]
  );

  const loadGames = async () => {
    try {
      const list = await api.getGames(platformId);
      setGames(list);
    } catch (e) {
      pushToast(`Failed to load library: ${String(e)}`, "error");
    }
  };

  useEffect(() => {
    loadGames();
    setDrawerOpen(false);
  }, [platformId]);

  const visibleGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sortKey = SORTS[sortIdx].id;
    return games
      .filter((g) => !g.hidden && !g.missing)
      .filter((g) => (!q ? true : g.title.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sortKey === "favorites" && a.favorite !== b.favorite) {
          return a.favorite ? -1 : 1;
        }
        if (sortKey === "recent") {
          return (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.title.localeCompare(b.title);
        }
        if (sortKey === "playtime") {
          return b.playtime - a.playtime || a.title.localeCompare(b.title);
        }
        return a.title.localeCompare(b.title);
      });
  }, [games, sortIdx, search]);

  const savedFocus = platformFocus[platformId] ?? 0;
  const focusIdx = Math.min(savedFocus, Math.max(0, visibleGames.length - 1));
  const focusedGame = visibleGames[focusIdx] || null;

  // Scroll focused grid poster into view smoothly
  useEffect(() => {
    if (platformViewMode !== "grid" || !gridRef.current) return;
    const card = gridRef.current.querySelector<HTMLElement>(`[data-grid-idx="${focusIdx}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [focusIdx, platformViewMode]);

  // Background auto-fetch of metadata & boxart for focused game if needed
  useEffect(() => {
    if (!focusedGame) return;
    const alreadyScraped = Boolean(
      (focusedGame.metadata as Record<string, unknown>)?.scrapedAt
    );
    if (alreadyScraped && focusedGame.cover && focusedGame.metadata?.description) return;

    const timer = setTimeout(() => {
      api
        .fetchGameMetadata(focusedGame.id)
        .then((updated) => {
          setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
        })
        .catch(() => {});
    }, 350);

    return () => clearTimeout(timer);
  }, [focusedGame?.id]);

  const cyclePlatform = (dir: -1 | 1) => {
    const list = platforms.length > 0 ? platforms : platformDefs;
    if (list.length === 0) return;
    const idx = list.findIndex((p) => p.id === platformId);
    const next = list[(idx + dir + list.length) % list.length];
    if (next) replaceScreen({ kind: "platform", platformId: next.id });
  };

  // Alphabetical / 5-game jump for LB / RB in Coverflow
  const jumpGames = (dir: -1 | 1) => {
    if (visibleGames.length <= 1) return;
    const step = Math.min(5, Math.max(1, Math.floor(visibleGames.length / 4)));
    const nextIdx = Math.max(0, Math.min(visibleGames.length - 1, focusIdx + dir * step));
    setPlatformFocus(platformId, nextIdx);
  };

  const handleScrapeAll = async () => {
    if (scraping || !platform) return;
    setScraping(true);
    pushToast(`Fetching artwork & metadata for ${platform.shortName}…`, "info");
    try {
      const count = await api.fetchPlatformMetadata(platform.id);
      await loadGames();
      pushToast(`Updated metadata for ${count} title(s)`, "success");
    } catch (e) {
      pushToast(String(e), "error");
    } finally {
      setScraping(false);
    }
  };

  const promptAddGame = () => {
    if (!platform) return;
    openFileBrowser({
      title: `Add ${platform.shortName} Game File / Executable`,
      pickMode: "file",
      onPick: async (pickedPath) => {
        try {
          const id = await api.addManualGame(pickedPath, null, platform.id);
          await loadGames();
          await refreshOverview();
          pushToast("Game added to library", "success");
          navigate({ kind: "game", gameId: id });
        } catch (e) {
          pushToast(String(e), "error");
        }
      },
    });
  };

  const openSearch = () => {
    openKeyboard({
      title: `Filter / Search ${platform?.name || "Library"}`,
      initial: search,
      placeholder: "Type game name…",
      onSubmit: (v) => {
        setSearch(v);
        setPlatformFocus(platformId, 0);
      },
    });
  };

  // Screen 4: Quick-Details Slide-Over Drawer Controller Handler (higher priority = 5)
  usePad(
    (btn) => {
      if (!drawerOpen || !focusedGame) return false;
      if (btn === "b") {
        setDrawerOpen(false);
        return true;
      }
      if (btn === "a") {
        launchGame(focusedGame.id);
        return true;
      }
      if (btn === "x") {
        setDrawerOpen(false);
        navigate({ kind: "game", gameId: focusedGame.id });
        return true;
      }
      if (btn === "up") {
        drawerDescRef.current?.scrollBy({ top: -48, behavior: "smooth" });
        return true;
      }
      if (btn === "down") {
        drawerDescRef.current?.scrollBy({ top: 48, behavior: "smooth" });
        return true;
      }
      return true;
    },
    5,
    drawerOpen
  );

  // Screen 2 (Coverflow) & Screen 3 (Grid) Controller Handler
  usePad((btn) => {
    if (btn === "b") {
      if (search) {
        setSearch("");
        return true;
      }
      back();
      return true;
    }
    if (btn === "select") {
      // View Button: Toggles directly between 3D Coverflow and Grid View
      togglePlatformViewMode();
      setDrawerOpen(false);
      return true;
    }
    if (btn === "y") {
      openSearch();
      return true;
    }
    if (btn === "start") {
      setQuickMenu(true);
      return true;
    }

    if (platformViewMode === "coverflow") {
      // Screen 2: 3D Coverflow Controller Mapping
      if (btn === "left") {
        setPlatformFocus(platformId, Math.max(0, focusIdx - 1));
        return true;
      }
      if (btn === "right") {
        setPlatformFocus(platformId, Math.min(visibleGames.length - 1, focusIdx + 1));
        return true;
      }
      if (btn === "lb") {
        jumpGames(-1);
        return true;
      }
      if (btn === "rb") {
        jumpGames(1);
        return true;
      }
      if (btn === "lt") {
        cyclePlatform(-1);
        return true;
      }
      if (btn === "rt") {
        setSortIdx((i) => (i + 1) % SORTS.length);
        return true;
      }
      if (btn === "a" && focusedGame) {
        launchGame(focusedGame.id);
        return true;
      }
      if (btn === "x" && focusedGame) {
        navigate({ kind: "game", gameId: focusedGame.id });
        return true;
      }
    } else {
      // Screen 3: High-Density Grid / Poster Wall Controller Mapping
      if (btn === "left") {
        setPlatformFocus(platformId, Math.max(0, focusIdx - 1));
        return true;
      }
      if (btn === "right") {
        setPlatformFocus(platformId, Math.min(visibleGames.length - 1, focusIdx + 1));
        return true;
      }
      if (btn === "up") {
        if (focusIdx - GRID_COLS >= 0) {
          setPlatformFocus(platformId, focusIdx - GRID_COLS);
        }
        return true;
      }
      if (btn === "down") {
        if (focusIdx + GRID_COLS < visibleGames.length) {
          setPlatformFocus(platformId, focusIdx + GRID_COLS);
        } else if (Math.floor(focusIdx / GRID_COLS) < Math.floor((visibleGames.length - 1) / GRID_COLS)) {
          setPlatformFocus(platformId, visibleGames.length - 1);
        }
        return true;
      }
      if (btn === "lt") {
        // Fast page scroll: jump 2 full rows up
        setPlatformFocus(platformId, Math.max(0, focusIdx - GRID_COLS * 2));
        return true;
      }
      if (btn === "rt") {
        // Fast page scroll: jump 2 full rows down (or cycle sort if single row)
        if (visibleGames.length > GRID_COLS) {
          setPlatformFocus(platformId, Math.min(visibleGames.length - 1, focusIdx + GRID_COLS * 2));
        } else {
          setSortIdx((i) => (i + 1) % SORTS.length);
        }
        return true;
      }
      if (btn === "lb") {
        cyclePlatform(-1);
        return true;
      }
      if (btn === "rb") {
        cyclePlatform(1);
        return true;
      }
      if (btn === "a" && focusedGame) {
        launchGame(focusedGame.id);
        return true;
      }
      if (btn === "x" && focusedGame) {
        setDrawerOpen(true);
        return true;
      }
    }
    return false;
  }, 0);

  if (!platform) return null;

  const focusedFanArt =
    mediaSrc(focusedGame?.hero) ||
    mediaSrc(focusedGame?.metadata?.header) ||
    mediaSrc(focusedGame?.cover) ||
    (focusedGame?.steamAppId
      ? `https://shared.steamstatic.com/store_item_assets/steam/apps/${focusedGame.steamAppId}/library_hero.jpg`
      : null);
  const aspectClass = getPlatformPosterAspectClass(platform.id);

  return (
    <div
      className={`platform-coverflow-view mode-${platformViewMode} ${
        drawerOpen ? "has-drawer-open" : ""
      }`}
      style={
        {
          "--theme-color": platform.color,
          "--theme-accent": platform.accent,
        } as React.CSSProperties
      }
    >
      {/* Dynamic Console-Themed Environment Background */}
      <ConsoleEnvironment platformId={platform.id} />

      {/* Screen 3: Dynamic Background Crossfade (40% opacity, 60px blurred copy of selected game's art) */}
      {focusedFanArt && (
        <div
          className={`dynamic-art-crossfade ${platformViewMode === "grid" ? "is-grid-bg" : ""}`}
          style={{ backgroundImage: `url("${focusedFanArt}")` }}
        />
      )}

      {/* Top Console Header Bar */}
      <header className="platform-header">
        <div className="platform-header-left">
          <button className="btn-back" onClick={back}>
            ← Consoles (B)
          </button>
          <div className="platform-title-block">
            <div className="platform-eyebrow">
              <span>{platform.manufacturer}</span>
              <span>·</span>
              <span>{platform.year}</span>
              <span>·</span>
              <span>
                {platformViewMode === "coverflow"
                  ? "3D CARTRIDGE / DISC COVERFLOW"
                  : "HIGH-DENSITY POSTER WALL"}
              </span>
            </div>
            <h1>
              {platform.name}{" "}
              <span className="platform-count-pill">{visibleGames.length}</span>
            </h1>
          </div>
        </div>

        <div className="platform-controls">
          <button
            className={`btn-view-toggle ${platformViewMode === "grid" ? "active" : ""}`}
            onClick={() => {
              togglePlatformViewMode();
              setDrawerOpen(false);
            }}
            title="Toggle 3D Coverflow / Grid View (View / Select)"
          >
            <span className="xbox-btn btn-view">VIEW</span>
            <span>{platformViewMode === "coverflow" ? "Toggle Grid" : "3D Coverflow"}</span>
          </button>

          <button className="btn-search-prominent" onClick={openSearch}>
            <span className="xbox-btn btn-y">Y</span>
            <span>{search ? `Filter: "${search}"` : "Filter"}</span>
          </button>
          {search && (
            <button className="btn-ghost" onClick={() => setSearch("")}>
              Clear
            </button>
          )}
          <button
            className="btn-control"
            onClick={() => setSortIdx((i) => (i + 1) % SORTS.length)}
          >
            <span className="xbox-btn btn-rt">RT</span>
            <span>Sort: {SORTS[sortIdx].label}</span>
          </button>
          <button
            className="btn-control"
            onClick={handleScrapeAll}
            disabled={scraping}
          >
            {scraping ? "Scraping…" : "✦ Scrape Art"}
          </button>
          <button className="btn-control" onClick={promptAddGame}>
            + Add ROM
          </button>
        </div>
      </header>

      {visibleGames.length === 0 ? (
        <div className="platform-empty">
          <h2>
            {search
              ? `No ${platform.shortName} titles matching "${search}"`
              : `No ${platform.shortName} Titles in Collection`}
          </h2>
          <p>
            {search
              ? "Press B or Clear to reset your search filter."
              : `Add game files or ROMs into your configured folder for ${platform.shortName}.`}
          </p>
          <div className="empty-actions">
            {search ? (
              <button className="btn-primary" onClick={() => setSearch("")}>
                Clear Search
              </button>
            ) : (
              <button className="btn-primary" onClick={promptAddGame}>
                + Add Game File
              </button>
            )}
          </div>
        </div>
      ) : platformViewMode === "coverflow" ? (
        /* ═══════════════════════════════════════════════════════════════════════
           SCREEN 2: 3D CARTRIDGE / DISC COVERFLOW VIEW
           ═══════════════════════════════════════════════════════════════════════ */
        <div className="coverflow-layout">
          {/* Center HUD Header: < SELECT GAME (17/25) > / Console Name / [PRESS (A) TO PLAY] */}
          <div className="coverflow-hud-top">
            <span className="coverflow-hud-counter">
              &lt; SELECT GAME ({focusIdx + 1}/{visibleGames.length}) &gt;
            </span>
            <span className="coverflow-hud-console">{platform.name}</span>
            {focusedGame && (
              <button
                className="coverflow-press-play-pill"
                onClick={() => launchGame(focusedGame.id)}
              >
                [PRESS (A) TO PLAY]
              </button>
            )}
          </div>

          {/* Center Showcase: 3D Cover Flow Carousel */}
          <section className="coverflow-stage-section">
            <div className="coverflow-stage" ref={stageRef}>
              {/* Dynamic Floor Reflection: blurred mirror plane simulating showroom glass pedestal */}
              <div className="coverflow-glass-floor" />

              {visibleGames.map((g, idx) => {
                const offset = idx - focusIdx;
                if (Math.abs(offset) > 5) return null;

                const isCenter = offset === 0;
                const absOffset = Math.abs(offset);

                // Active Hero State: elevated vertically, front-facing with 0deg Y-rotation
                // Flanking titles: folded inward at 45° angles displaying their 3D spines
                let transform = "";
                let zIndex = 50 - absOffset;
                let opacity = 1;

                if (isCenter) {
                  transform = `translateX(0px) translateY(-28px) translateZ(170px) rotateY(0deg) scale(1.42)`;
                  zIndex = 100;
                  opacity = 1;
                } else if (offset < 0) {
                  const spacing = 240 + (absOffset - 1) * 115;
                  const depth = -80 - (absOffset - 1) * 55;
                  transform = `translateX(-${spacing}px) translateY(0px) translateZ(${depth}px) rotateY(45deg) scale(1.08)`;
                  opacity = Math.max(0.42, 1 - absOffset * 0.14);
                } else {
                  const spacing = 240 + (absOffset - 1) * 115;
                  const depth = -80 - (absOffset - 1) * 55;
                  transform = `translateX(${spacing}px) translateY(0px) translateZ(${depth}px) rotateY(-45deg) scale(1.08)`;
                  opacity = Math.max(0.42, 1 - absOffset * 0.14);
                }

                return (
                  <div
                    key={g.id}
                    className={`coverflow-item ${isCenter ? "is-center" : "is-side"}`}
                    style={{
                      transform,
                      zIndex,
                      opacity,
                    }}
                    onClick={() => {
                      if (isCenter) {
                        navigate({ kind: "game", gameId: g.id });
                      } else {
                        setPlatformFocus(platformId, idx);
                      }
                    }}
                    onDoubleClick={() => launchGame(g.id)}
                  >
                    <CollectibleCard
                      game={g}
                      platform={platform}
                      focused={isCenter}
                      size="coverflow"
                    />
                  </div>
                );
              })}
            </div>

            {/* Carousel navigation indicators */}
            <div className="coverflow-nav-indicator">
              <span
                className="nav-arrow"
                onClick={() => setPlatformFocus(platformId, Math.max(0, focusIdx - 1))}
              >
                ◀
              </span>
              <span className="nav-counter">
                {focusIdx + 1} / {visibleGames.length} · --- Floor Reflection ---
              </span>
              <span
                className="nav-arrow"
                onClick={() =>
                  setPlatformFocus(platformId, Math.min(visibleGames.length - 1, focusIdx + 1))
                }
              >
                ▶
              </span>
            </div>
          </section>

          {/* Focused Game Spotlight Information Panel */}
          {focusedGame && (
            <aside className="coverflow-spotlight-panel">
              <div className="spotlight-panel-inner">
                <div className="spotlight-panel-left">
                  <div className="spotlight-panel-badges">
                    <span
                      className="badge-accent"
                      style={{
                        background: platform.accent,
                        color: getContrastTextColor(platform.accent),
                      }}
                    >
                      {platform.shortName}
                    </span>
                    {focusedGame.region && <span className="badge-glass">{focusedGame.region}</span>}
                    {focusedGame.metadata?.releaseDate && (
                      <span className="badge-glass">{focusedGame.metadata.releaseDate}</span>
                    )}
                    {focusedGame.metadata?.genre && (
                      <span className="badge-glass">{focusedGame.metadata.genre}</span>
                    )}
                    {focusedGame.favorite && <span className="badge-gold">★ Favorite</span>}
                  </div>

                  <h2 className="spotlight-panel-title">{focusedGame.title}</h2>

                  <div className="spotlight-panel-subline">
                    {(focusedGame.metadata?.developer || focusedGame.metadata?.publisher) && (
                      <span className="spotlight-panel-credits">
                        {focusedGame.metadata.developer || focusedGame.metadata.publisher}
                      </span>
                    )}
                    {focusedGame.metadata?.description && (
                      <span className="spotlight-panel-snippet">
                        — {focusedGame.metadata.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className="spotlight-panel-right">
                  <div className="spotlight-panel-stats">
                    <div>
                      <span>PLAYTIME</span>
                      <strong>{formatPlaytime(focusedGame.playtime)}</strong>
                    </div>
                    <div>
                      <span>LAST PLAYED</span>
                      <strong>{formatRelativeDate(focusedGame.lastPlayed)}</strong>
                    </div>
                    <div>
                      <span>SIZE</span>
                      <strong>{formatBytes(focusedGame.fileSize)}</strong>
                    </div>
                  </div>

                  <div className="spotlight-panel-actions">
                    <button
                      className="btn-play-emerald"
                      onClick={() => launchGame(focusedGame.id)}
                    >
                      <span className="xbox-btn btn-a">A</span>
                      <span>Play Game</span>
                    </button>
                    <button
                      className="btn-details-showcase"
                      onClick={() => navigate({ kind: "game", gameId: focusedGame.id })}
                    >
                      <span className="xbox-btn btn-x">X</span>
                      <span>Game Details</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════════
           SCREEN 3: HIGH-DENSITY GRID / POSTER WALL VIEW
           + SCREEN 4: QUICK-DETAILS SLIDE-OVER DRAWER
           ═══════════════════════════════════════════════════════════════════════ */
        <div className="poster-grid-workspace">
          {/* Left / Main Grid Container (Dimmed to 30% brightness & 10px blur when Drawer is open) */}
          <div
            className={`poster-grid-stage ${drawerOpen ? "is-dimmed-blurred" : ""}`}
            onClick={() => {
              if (drawerOpen) setDrawerOpen(false);
            }}
          >
            <div className="poster-wall-scroll" ref={gridRef}>
              <div className="poster-wall-grid">
                {visibleGames.map((g, idx) => {
                  const isFocused = idx === focusIdx;
                  return (
                    <div
                      key={g.id}
                      data-grid-idx={idx}
                      className={`poster-wall-card ${aspectClass} ${
                        isFocused ? "is-focused" : ""
                      }`}
                      onMouseEnter={() => {
                        if (!drawerOpen) setPlatformFocus(platformId, idx);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (drawerOpen) {
                          setPlatformFocus(platformId, idx);
                          return;
                        }
                        if (isFocused) {
                          setDrawerOpen(true);
                        } else {
                          setPlatformFocus(platformId, idx);
                        }
                      }}
                      onDoubleClick={() => launchGame(g.id)}
                    >
                      <div className="poster-card-art">
                        <PosterWallImage game={g} platform={platform} />
                        <div className="poster-card-gloss" />
                        {g.favorite && <span className="poster-fav-badge">★</span>}
                      </div>
                      <div className="poster-card-footer">
                        <span className="poster-card-name">{g.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Preview Card directly underneath the grid */}
            {focusedGame && (
              <div className="grid-bottom-preview-card">
                <div className="grid-preview-main">
                  <strong className="spotlight-panel-title grid-preview-title">
                    {focusedGame.title}
                  </strong>
                  <span
                    className="grid-preview-plat"
                    style={{ borderColor: platform.accent, color: platform.accent }}
                  >
                    [{focusedGame.source === "steam" ? "Steam" : platform.shortName}]
                  </span>
                  <span className="grid-preview-pipe">|</span>
                  <span className="grid-preview-meta">
                    {focusedGame.metadata?.releaseDate || platform.year}
                  </span>
                  <span className="grid-preview-pipe">|</span>
                  <span className="grid-preview-meta">
                    {focusedGame.metadata?.genre || platform.media.toUpperCase()}
                  </span>
                  <span className="grid-preview-pipe">|</span>
                  <span className="grid-preview-meta tabular-nums">
                    Playtime: {formatPlaytime(focusedGame.playtime)}
                  </span>
                  <span className="grid-preview-pipe">|</span>
                  <span className="grid-preview-meta tabular-nums">
                    File: {formatBytes(focusedGame.fileSize)}
                  </span>
                </div>

                <div className="grid-preview-actions">
                  <button
                    className="btn-play-emerald btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      launchGame(focusedGame.id);
                    }}
                  >
                    <span className="xbox-btn btn-a">A</span>
                    <span>Play</span>
                  </button>
                  <button
                    className="btn-details-showcase btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrawerOpen(true);
                    }}
                  >
                    <span className="xbox-btn btn-x">X</span>
                    <span>Quick Sheet</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════
             SCREEN 4: QUICK-DETAILS SLIDE-OVER DRAWER (width: 38%, 450ms cubic-bezier)
             ═══════════════════════════════════════════════════════════════════════ */}
          <aside className={`quick-details-drawer ${drawerOpen ? "is-open" : ""}`}>
            {focusedGame && (
              <div className="qd-drawer-inner">
                <div className="qd-drawer-header">
                  <span className="qd-drawer-eyebrow">Quick Details</span>
                  <button
                    className="qd-close-btn"
                    onClick={() => setDrawerOpen(false)}
                    title="Close Panel (B)"
                  >
                    <span className="xbox-btn btn-b">B</span>
                    <span>✕</span>
                  </button>
                </div>

                {/* 1. Title & Console Pill */}
                <div className="qd-title-block">
                  <h1 className="qd-game-title">{focusedGame.title}</h1>
                  <div className="qd-pill-row">
                    <span
                      className="qd-console-pill"
                      style={{
                        background: platform.accent,
                        color: getContrastTextColor(platform.accent),
                      }}
                    >
                      [{platform.name}]
                    </span>
                    {focusedGame.region && (
                      <span className="badge-glass">{focusedGame.region}</span>
                    )}
                    {focusedGame.favorite && (
                      <span className="badge-gold">★ Favorite</span>
                    )}
                  </div>
                </div>

                {/* 2. Action Row & 3D Box Art */}
                <div className="qd-hero-action-row">
                  <div className="qd-3d-box-preview">
                    <CollectibleCard
                      game={focusedGame}
                      platform={platform}
                      focused
                      size="compact"
                    />
                  </div>
                  <div className="qd-cta-stack">
                    <button
                      className="qd-btn-play-now"
                      onClick={() => launchGame(focusedGame.id)}
                    >
                      <span>PLAY NOW</span>
                      <span className="xbox-btn btn-a">A</span>
                    </button>
                    <button
                      className="qd-btn-full-page"
                      onClick={() => {
                        setDrawerOpen(false);
                        navigate({ kind: "game", gameId: focusedGame.id });
                      }}
                    >
                      <span>FULL DETAILS</span>
                      <span className="xbox-btn btn-x">X</span>
                    </button>
                  </div>
                </div>

                {/* 3. Compact 2-Column Spec Table */}
                <div className="qd-spec-grid">
                  <div className="qd-spec-cell">
                    <span>Developer</span>
                    <strong>{focusedGame.metadata?.developer || platform.manufacturer}</strong>
                  </div>
                  <div className="qd-spec-cell">
                    <span>Publisher</span>
                    <strong>{focusedGame.metadata?.publisher || platform.manufacturer}</strong>
                  </div>
                  <div className="qd-spec-cell">
                    <span>Year</span>
                    <strong>{focusedGame.metadata?.releaseDate || platform.year}</strong>
                  </div>
                  <div className="qd-spec-cell">
                    <span>Genre</span>
                    <strong>{focusedGame.metadata?.genre || platform.media.toUpperCase()}</strong>
                  </div>
                </div>

                {/* 4. Description Block (4-line synopsis with smooth gradient fade-out) */}
                <div className="qd-description-block">
                  <span className="qd-section-label">Description</span>
                  <div className="qd-description-scroll" ref={drawerDescRef}>
                    <p>
                      {focusedGame.metadata?.description ||
                        `Experience ${focusedGame.title} on ${platform.name} (${platform.year}). Configured with isolated per-game emulator settings, controller profile mapping, and real-time session tracking.`}
                    </p>
                  </div>
                </div>

                {/* 5. Quick Stats */}
                <div className="qd-quick-stats-footer">
                  <div>
                    <span>Playtime</span>
                    <strong className="tabular-nums">
                      {formatPlaytime(focusedGame.playtime)}
                    </strong>
                  </div>
                  <div>
                    <span>Last Played</span>
                    <strong>{formatRelativeDate(focusedGame.lastPlayed)}</strong>
                  </div>
                  <div>
                    <span>Size</span>
                    <strong className="tabular-nums">
                      {formatBytes(focusedGame.fileSize)}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Bottom Controller Legend Bar dynamically adapted to Screen 2, 3, or 4 */}
      {drawerOpen ? (
        <BottomPromptBar
          items={[
            {
              btn: "A",
              label: "Play Game",
              onClick: focusedGame ? () => launchGame(focusedGame.id) : undefined,
            },
            {
              btn: "X",
              label: "Fullscreen Page",
              onClick: focusedGame
                ? () => {
                    setDrawerOpen(false);
                    navigate({ kind: "game", gameId: focusedGame.id });
                  }
                : undefined,
            },
            {
              btn: "B",
              label: "Close Panel",
              onClick: () => setDrawerOpen(false),
            },
            {
              btn: "UP/DOWN",
              label: "Scroll Details",
            },
          ]}
        />
      ) : platformViewMode === "grid" ? (
        <BottomPromptBar
          items={[
            {
              btn: "A",
              label: "Play Game",
              onClick: focusedGame ? () => launchGame(focusedGame.id) : undefined,
            },
            {
              btn: "X",
              label: "Quick Sheet",
              onClick: focusedGame ? () => setDrawerOpen(true) : undefined,
            },
            {
              btn: "VIEW",
              label: "Coverflow",
              onClick: () => togglePlatformViewMode(),
            },
            {
              btn: "D-PAD",
              label: "Browse",
            },
            {
              btn: "LT/RT",
              label: "Page Jump",
            },
            {
              btn: "B",
              label: "Consoles",
              onClick: back,
            },
          ]}
        />
      ) : (
        <BottomPromptBar
          items={[
            {
              btn: "A",
              label: "Play Game",
              onClick: focusedGame ? () => launchGame(focusedGame.id) : undefined,
            },
            {
              btn: "X",
              label: "Game Details",
              onClick: focusedGame
                ? () => navigate({ kind: "game", gameId: focusedGame.id })
                : undefined,
            },
            {
              btn: "VIEW",
              label: "Toggle Grid",
              onClick: () => togglePlatformViewMode(),
            },
            {
              btn: "LB/RB",
              label: "Letter Jump",
              onClick: () => jumpGames(1),
            },
            {
              btn: "Y",
              label: "Filter",
              onClick: openSearch,
            },
            {
              btn: "B",
              label: "Back",
              onClick: back,
            },
          ]}
        />
      )}
    </div>
  );
};
