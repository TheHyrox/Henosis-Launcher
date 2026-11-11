// Step 2 of the Console-First Experience: 3D Cover Flow Carousel & Console-Themed Environment.
//
// Directive implementations:
// 1. Dynamic Console-Themed Environment:
//    Adapts color palette and animated background (Wii U cyan wavy ribbons, Switch scarlet glowing waves,
//    PlayStation navy/indigo atmosphere, Xbox 360 radiant emerald curves).
// 2. 3D Physical Media Rendering:
//    Fully rendered 3D physical game cases with realistic spine thickness, plastic sheen, and glass floor reflections.
// 3. Center Showcase (3D Cover Flow Carousel):
//    Highlighted game is elevated and centered facing forward, adjacent titles angle inward with realistic perspective,
//    depth of field blur, and smooth camera transitions.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
  Game,
  Platform,
} from "../api";
import { CollectibleCard } from "../components/Collectible";
import { ConsoleEnvironment } from "../components/ConsoleEnvironment";
import { BottomPromptBar } from "../components/TopBar";
import { usePad } from "../input";
import { useStore } from "../store";

const SORTS = [
  { id: "title", label: "Title A–Z" },
  { id: "recent", label: "Recently Played" },
  { id: "playtime", label: "Most Played" },
  { id: "favorites", label: "Favorites First" },
] as const;

export const PlatformView: React.FC<{ platformId: string }> = ({ platformId }) => {
  const {
    platforms,
    platformDefs,
    platformFocus,
    setPlatformFocus,
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
  const stageRef = useRef<HTMLDivElement | null>(null);

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

  const toggleFavorite = async (g: Game) => {
    await api.setGameFlag(g.id, "favorite", !g.favorite);
    await loadGames();
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
      title: `Search ${platform?.name || "Library"} by Name`,
      initial: search,
      placeholder: "Type game name…",
      onSubmit: (v) => {
        setSearch(v);
        setPlatformFocus(platformId, 0);
      },
    });
  };

  usePad((btn) => {
    if (btn === "b") {
      if (search) {
        setSearch("");
        return true;
      }
      back();
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
    if (btn === "lt") {
      setSortIdx((i) => (i - 1 + SORTS.length) % SORTS.length);
      return true;
    }
    if (btn === "rt") {
      setSortIdx((i) => (i + 1) % SORTS.length);
      return true;
    }
    if (btn === "left") {
      setPlatformFocus(platformId, Math.max(0, focusIdx - 1));
      return true;
    }
    if (btn === "right") {
      setPlatformFocus(platformId, Math.min(visibleGames.length - 1, focusIdx + 1));
      return true;
    }
    if (btn === "a" && focusedGame) {
      navigate({ kind: "game", gameId: focusedGame.id });
      return true;
    }
    if (btn === "x" && focusedGame) {
      launchGame(focusedGame.id);
      return true;
    }
    if (btn === "y") {
      openSearch();
      return true;
    }
    if (btn === "select" && focusedGame) {
      toggleFavorite(focusedGame);
      return true;
    }
    if (btn === "start") {
      setQuickMenu(true);
      return true;
    }
    return false;
  }, 0);

  if (!platform) return null;

  return (
    <div
      className="platform-coverflow-view"
      style={
        {
          "--theme-color": platform.color,
          "--theme-accent": platform.accent,
        } as React.CSSProperties
      }
    >
      {/* Dynamic Console-Themed Environment Background */}
      <ConsoleEnvironment platformId={platform.id} />

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
              <span>3D PHYSICAL MEDIA COLLECTION</span>
            </div>
            <h1>
              {platform.name}{" "}
              <span className="platform-count-pill">{visibleGames.length}</span>
            </h1>
          </div>
        </div>

        <div className="platform-controls">
          <button className="btn-search-prominent" onClick={openSearch}>
            <span className="xbox-btn btn-y">Y</span>
            <span>{search ? `Search: "${search}"` : "Search by Name"}</span>
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
            ⇅ {SORTS[sortIdx].label} (RT)
          </button>
          <button
            className="btn-control"
            onClick={handleScrapeAll}
            disabled={scraping}
          >
            {scraping ? "Fetching Metadata…" : "✦ Fetch Metadata"}
          </button>
          <button className="btn-control" onClick={promptAddGame}>
            + Add Game
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
      ) : (
        <div className="coverflow-layout">
          {/* Center Showcase: 3D Cover Flow Carousel */}
          <section className="coverflow-stage-section">
            <div className="coverflow-stage" ref={stageRef}>
              {/* Floor glass sheen & reflection surface */}
              <div className="coverflow-glass-floor" />

              {visibleGames.map((g, idx) => {
                const offset = idx - focusIdx;
                // Only render items within visual range for 60+ FPS performance
                if (Math.abs(offset) > 10) return null;

                const isCenter = offset === 0;
                const absOffset = Math.abs(offset);

                // Cover Flow 3D Transform computation:
                // Center item: elevated (-26px), translated forward (+150px), facing directly front (rotateY(0deg))
                // Adjacent items: angled inward (52deg / -52deg), stepped along X and Z with depth of field blur
                let transform = "";
                let zIndex = 50 - absOffset;
                let blurAmount = 0;
                let brightness = 1;

                if (isCenter) {
                  transform = `translateX(0px) translateY(-36px) translateZ(170px) rotateY(0deg) scale(1.42)`;
                  zIndex = 100;
                  blurAmount = 0;
                  brightness = 1.08;
                } else if (offset < 0) {
                  // Left side items angled inward
                  const spacing = 240 + (absOffset - 1) * 115;
                  const depth = -80 - (absOffset - 1) * 55;
                  transform = `translateX(-${spacing}px) translateY(0px) translateZ(${depth}px) rotateY(52deg) scale(1.08)`;
                  blurAmount = Math.min(5.5, absOffset * 1.4);
                  brightness = Math.max(0.38, 1 - absOffset * 0.14);
                } else {
                  // Right side items angled inward
                  const spacing = 240 + (absOffset - 1) * 115;
                  const depth = -80 - (absOffset - 1) * 55;
                  transform = `translateX(${spacing}px) translateY(0px) translateZ(${depth}px) rotateY(-52deg) scale(1.08)`;
                  blurAmount = Math.min(5.5, absOffset * 1.4);
                  brightness = Math.max(0.38, 1 - absOffset * 0.14);
                }

                return (
                  <div
                    key={g.id}
                    className={`coverflow-item ${isCenter ? "is-center" : "is-side"}`}
                    style={{
                      transform,
                      zIndex,
                      filter: `blur(${blurAmount}px) brightness(${brightness})`,
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
              <span className="nav-arrow" onClick={() => setPlatformFocus(platformId, Math.max(0, focusIdx - 1))}>
                ◀
              </span>
              <span className="nav-counter">
                {focusIdx + 1} / {visibleGames.length}
              </span>
              <span className="nav-arrow" onClick={() => setPlatformFocus(platformId, Math.min(visibleGames.length - 1, focusIdx + 1))}>
                ▶
              </span>
            </div>
          </section>

          {/* Focused Game Spotlight Information Panel - Sleek HUD Profile */}
          {focusedGame && (
            <aside className="coverflow-spotlight-panel">
              <div className="spotlight-panel-inner">
                <div className="spotlight-panel-left">
                  <div className="spotlight-panel-badges">
                    <span className="badge-accent" style={{ background: platform.accent }}>
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
                      className="btn-play-showcase"
                      style={{ background: platform.accent }}
                      onClick={() => launchGame(focusedGame.id)}
                    >
                      <span className="xbox-btn btn-x">X</span>
                      <span>Play Now</span>
                    </button>
                    <button
                      className="btn-details-showcase"
                      onClick={() => navigate({ kind: "game", gameId: focusedGame.id })}
                    >
                      <span className="xbox-btn btn-a">A</span>
                      <span>Details</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Bottom Controller Legend Bar */}
      <BottomPromptBar
        items={[
          {
            btn: "X",
            label: "Play Game",
            onClick: focusedGame ? () => launchGame(focusedGame.id) : undefined,
          },
          {
            btn: "A",
            label: "Game Page & Settings",
            onClick: focusedGame
              ? () => navigate({ kind: "game", gameId: focusedGame.id })
              : undefined,
          },
          {
            btn: "Y",
            label: "Search by Name",
            onClick: openSearch,
          },
          {
            btn: "SELECT",
            label: focusedGame?.favorite ? "Unfavorite" : "Favorite",
            onClick: focusedGame ? () => toggleFavorite(focusedGame) : undefined,
          },
          { btn: "LB", label: "Prev Console", onClick: () => cyclePlatform(-1) },
          { btn: "RB", label: "Next Console", onClick: () => cyclePlatform(1) },
          {
            btn: "RT",
            label: `Sort: ${SORTS[sortIdx].label}`,
            onClick: () => setSortIdx((i) => (i + 1) % SORTS.length),
          },
          { btn: "B", label: "Back to Consoles", onClick: back },
        ]}
      />
    </div>
  );
};
