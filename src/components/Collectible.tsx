// 3D Physical Media Rendering Engine
// Renders games as fully realized 3D physical game cases:
// - Authentic console case plastic materials (translucent Switch red, Wii U cyan, Xbox 360 emerald green, PS3 clear Blu-ray, PS2 black, PS1 acrylic jewel case)
// - Realistic 3D spine thickness with console banner & vertical title
// - Clear transparent plastic sleeve wrap with realistic specular reflections & corner bevels
// - Glass / metallic floor surface with inverted mirror reflections and ambient spotlights
// - Molded 3D retro cartridges with top finger grips, label stickers, and gold connector pins

import React, { useState, useEffect } from "react";
import { ArtStyle, Game, mediaSrc, Platform } from "../api";

export interface CollectibleProps {
  game: Game;
  platform: Platform;
  focused?: boolean;
  size?: "coverflow" | "hero" | "compact";
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export const ConsoleHardwareSvg: React.FC<{ platform: Platform; className?: string }> = ({
  platform,
  className,
}) => {
  const accent = platform.accent;
  const id = platform.id;

  // Steam / PC (Monitor chassis & gaming rig silhouette)
  if (id === "steam" || id === "pc") {
    return (
      <svg viewBox="0 0 240 140" className={className} fill="none">
        {/* Ultrawide Monitor Chassis */}
        <rect x="24" y="14" width="192" height="90" rx="10" fill="#0B0E14" stroke={accent} strokeWidth="2.5" />
        <rect x="32" y="22" width="176" height="72" rx="5" fill="#101622" stroke={accent} strokeWidth="1" opacity="0.6" />
        {/* Isometric Grid / Telemetry Lines on Screen */}
        <line x1="32" y1="78" x2="208" y2="78" stroke={accent} strokeWidth="0.8" opacity="0.25" />
        {/* Steam Piston / Rotor Vector */}
        <circle cx="132" cy="54" r="18" stroke={accent} strokeWidth="2.5" opacity="0.9" />
        <circle cx="132" cy="54" r="7" fill={accent} />
        <circle cx="102" cy="68" r="9" stroke={accent} strokeWidth="2.2" fill="#0B0E14" />
        <path d="M107 62 L127 49 M110 72 L134 60" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        {/* Monitor Neck & Base Stand */}
        <path d="M108 104 H132 L138 118 H102 Z" fill="#101622" stroke={accent} strokeWidth="1.8" />
        <path d="M78 118 H162 L170 125 H70 Z" fill="#161E2E" stroke={accent} strokeWidth="2" />
      </svg>
    );
  }

  // Nintendo DS / 3DS (Dual screens with center hinge detailing, cameras & stylus slot)
  if (id === "nds" || id === "n3ds") {
    const is3ds = id === "n3ds";
    return (
      <svg viewBox="0 0 240 140" className={className} fill="none">
        {/* Top Clamshell Lid */}
        <rect x="44" y="6" width="152" height="60" rx="10" fill="#0B0E14" stroke={accent} strokeWidth="2.3" />
        {/* Top Widescreen / 4:3 Display */}
        <rect x={is3ds ? "62" : "70"} y="13" width={is3ds ? "116" : "100"} height="46" rx="4" fill="#101622" stroke={accent} strokeWidth="1.5" />
        {/* Stereo Speaker Perforations */}
        <circle cx="53" cy="36" r="1.6" fill={accent} opacity="0.7" />
        <circle cx="57" cy="36" r="1.6" fill={accent} opacity="0.7" />
        <circle cx="183" cy="36" r="1.6" fill={accent} opacity="0.7" />
        <circle cx="187" cy="36" r="1.6" fill={accent} opacity="0.7" />
        {/* Center Cylindrical Hinge with LED Indicators */}
        <rect x="40" y="65" width="160" height="9" rx="4.5" fill="#161E2E" stroke={accent} strokeWidth="2" />
        <line x1="72" y1="65" x2="72" y2="74" stroke={accent} strokeWidth="1.5" opacity="0.6" />
        <line x1="168" y1="65" x2="168" y2="74" stroke={accent} strokeWidth="1.5" opacity="0.6" />
        <circle cx="184" cy="69.5" r="2" fill="#00E676" />
        {/* Bottom Clamshell Body */}
        <rect x="44" y="73" width="152" height="61" rx="10" fill="#0B0E14" stroke={accent} strokeWidth="2.3" />
        {/* Bottom Touch Screen */}
        <rect x="76" y="80" width="88" height="46" rx="3" fill="#101622" stroke={accent} strokeWidth="1.5" />
        {/* Circle Pad (3DS) & D-Pad */}
        {is3ds ? (
          <>
            <circle cx="59" cy="92" r="7.5" fill="#161E2E" stroke={accent} strokeWidth="2" />
            <path d="M55 113 H63 M59 109 V117" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
          </>
        ) : (
          <path d="M53 102 H65 M59 96 V108" stroke={accent} strokeWidth="2.8" strokeLinecap="round" />
        )}
        {/* ABXY Action Buttons */}
        <circle cx="181" cy="94" r="2.6" fill={accent} />
        <circle cx="181" cy="106" r="2.6" fill={accent} />
        <circle cx="175" cy="100" r="2.6" fill={accent} opacity="0.8" />
        <circle cx="187" cy="100" r="2.6" fill={accent} opacity="0.8" />
      </svg>
    );
  }

  // Nintendo Switch / Switch 2 (Tablet chassis with detached / rail-mounted Joy-Cons)
  if (id === "switch" || id === "switch2") {
    return (
      <svg viewBox="0 0 240 140" className={className} fill="none">
        {/* Left Joy-Con (slightly detached to show precision rail silhouette) */}
        <path
          d="M42 22 H56 V114 H42 C29 114 22 105 22 92 V44 C22 31 29 22 42 22 Z"
          fill="#0B0E14"
          stroke="#00D2FF"
          strokeWidth="2.4"
        />
        <rect x="56" y="30" width="3" height="76" fill="#00D2FF" opacity="0.5" />
        <circle cx="39" cy="48" r="7" stroke="#00D2FF" strokeWidth="2.2" />
        <circle cx="39" cy="78" r="2.5" fill="#00D2FF" />
        <circle cx="39" cy="90" r="2.5" fill="#00D2FF" />
        <circle cx="33" cy="84" r="2.5" fill="#00D2FF" />
        <circle cx="45" cy="84" r="2.5" fill="#00D2FF" />

        {/* Center Tablet Console Chassis */}
        <rect x="64" y="24" width="112" height="90" rx="7" fill="#0B0E14" stroke={accent} strokeWidth="2.5" />
        <rect x="72" y="31" width="96" height="76" rx="4" fill="#101622" stroke={accent} strokeWidth="1.3" opacity="0.9" />
        {/* Subtle Screen Glare Line */}
        <path d="M82 98 L142 38" stroke={accent} strokeWidth="1.2" opacity="0.25" />

        {/* Right Joy-Con (Neon Red / Coral) */}
        <rect x="181" y="30" width="3" height="76" fill="#FF3D55" opacity="0.5" />
        <path
          d="M184 22 H198 C211 22 218 31 218 44 V92 C218 105 211 114 198 114 H184 V22 Z"
          fill="#0B0E14"
          stroke="#FF3D55"
          strokeWidth="2.4"
        />
        <circle cx="201" cy="44" r="2.5" fill="#FF3D55" />
        <circle cx="201" cy="56" r="2.5" fill="#FF3D55" />
        <circle cx="195" cy="50" r="2.5" fill="#FF3D55" />
        <circle cx="207" cy="50" r="2.5" fill="#FF3D55" />
        <circle cx="201" cy="80" r="7" stroke="#FF3D55" strokeWidth="2.2" />
      </svg>
    );
  }

  // Other Handhelds (Game Boy / GBA / Vita / PSP / Game Gear / Lynx / WonderSwan / NGP)
  if (["gb", "gbc", "gba", "psvita", "psp", "gamegear", "lynx", "wonderswan", "ngp", "pokemini"].includes(id)) {
    const vertical = ["gb", "gbc", "pokemini"].includes(id);
    if (vertical) {
      return (
        <svg viewBox="0 0 240 140" className={className} fill="none">
          <rect x="74" y="8" width="92" height="124" rx="12" fill="#0B0E14" stroke={accent} strokeWidth="2.5" />
          <rect x="86" y="18" width="68" height="50" rx="5" fill="#101622" stroke={accent} strokeWidth="1.5" opacity="0.9" />
          <path d="M96 88 H108 M102 82 V94" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="138" cy="85" r="5" fill={accent} />
          <circle cx="126" cy="93" r="5" fill={accent} opacity="0.75" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 240 140" className={className} fill="none">
        <rect x="20" y="26" width="200" height="88" rx="28" fill="#0B0E14" stroke={accent} strokeWidth="2.5" />
        <rect x="58" y="36" width="124" height="68" rx="6" fill="#101622" stroke={accent} strokeWidth="1.4" opacity="0.85" />
        <circle cx="39" cy="56" r="7" stroke={accent} strokeWidth="2.2" />
        <path d="M35 78 H43 M39 74 V82" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="201" cy="54" r="4" fill={accent} />
        <circle cx="194" cy="62" r="4" fill={accent} opacity="0.7" />
        <circle cx="201" cy="78" r="7" stroke={accent} strokeWidth="2.2" />
      </svg>
    );
  }

  // Disc consoles
  if (platform.media === "disc") {
    return (
      <svg viewBox="0 0 240 140" className={className} fill="none">
        <rect x="26" y="42" width="188" height="64" rx="12" fill="#0B0E14" stroke={accent} strokeWidth="2.5" />
        <rect x="38" y="70" width="164" height="5" rx="2.5" fill="#101622" stroke={accent} strokeWidth="1" />
        <circle cx="120" cy="40" r="24" fill="#101622" stroke={accent} strokeWidth="2" opacity="0.9" />
        <circle cx="120" cy="40" r="6" fill="#0B0E14" stroke={accent} strokeWidth="1.5" />
        <circle cx="186" cy="56" r="4" fill={accent} />
        <rect x="46" y="86" width="44" height="8" rx="4" fill={accent} opacity="0.35" />
      </svg>
    );
  }

  // Classic cartridge deck (NES / SNES / N64 / Mega Drive / Atari / etc.)
  return (
    <svg viewBox="0 0 240 140" className={className} fill="none">
      <rect x="28" y="48" width="184" height="62" rx="10" fill="#0B0E14" stroke={accent} strokeWidth="2.5" />
      <rect x="68" y="34" width="104" height="24" rx="5" fill="#101622" stroke={accent} strokeWidth="2" />
      <rect x="78" y="40" width="84" height="8" rx="2" fill={accent} opacity="0.55" />
      <rect x="46" y="76" width="38" height="12" rx="3" fill="#101622" stroke={accent} strokeWidth="1.4" />
      <rect x="96" y="76" width="38" height="12" rx="3" fill="#101622" stroke={accent} strokeWidth="1.4" />
      <circle cx="182" cy="82" r="6" fill={accent} />
    </svg>
  );
};

function initials(title: string): string {
  const words = title.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Artwork printed directly onto the cover insert or cartridge label */
const CaseArtwork: React.FC<{ game: Game; platform: Platform }> = ({ game, platform }) => {
  const [stage, setStage] = useState<"cover" | "steam_cdn" | "header" | "hero" | "failed">("cover");
  const [logoBroken, setLogoBroken] = useState(false);

  const steamCdn = game.steamAppId
    ? `https://shared.steamstatic.com/store_item_assets/steam/apps/${game.steamAppId}/library_600x900.jpg`
    : null;

  useEffect(() => {
    setStage("cover");
    setLogoBroken(false);
  }, [game.id, game.cover, game.hero, game.logo]);

  const rawCover = mediaSrc(game.cover);
  let artUrl: string | null = null;
  let isCoverArt = false;

  if (stage === "cover") {
    if (rawCover) {
      artUrl = rawCover;
      isCoverArt = true;
    } else if (steamCdn) {
      artUrl = steamCdn;
      isCoverArt = true;
    } else if (game.metadata?.header) {
      artUrl = mediaSrc(game.metadata.header);
    } else if (game.hero) {
      artUrl = mediaSrc(game.hero);
    }
  } else if (stage === "steam_cdn") {
    if (steamCdn && rawCover !== steamCdn) {
      artUrl = steamCdn;
      isCoverArt = true;
    } else if (game.metadata?.header) {
      artUrl = mediaSrc(game.metadata.header);
    } else if (game.hero) {
      artUrl = mediaSrc(game.hero);
    }
  } else if (stage === "header") {
    if (game.metadata?.header) {
      artUrl = mediaSrc(game.metadata.header);
    } else if (game.hero) {
      artUrl = mediaSrc(game.hero);
    }
  } else if (stage === "hero") {
    if (game.hero) {
      artUrl = mediaSrc(game.hero);
    }
  }

  const handleImgError = () => {
    if (stage === "cover") {
      if (steamCdn && rawCover !== steamCdn) {
        setStage("steam_cdn");
      } else if (game.metadata?.header) {
        setStage("header");
      } else if (game.hero) {
        setStage("hero");
      } else {
        setStage("failed");
      }
    } else if (stage === "steam_cdn") {
      if (game.metadata?.header) {
        setStage("header");
      } else if (game.hero) {
        setStage("hero");
      } else {
        setStage("failed");
      }
    } else if (stage === "header") {
      if (game.hero) {
        setStage("hero");
      } else {
        setStage("failed");
      }
    } else {
      setStage("failed");
    }
  };

  const logoUrl = !logoBroken ? mediaSrc(game.logo) : null;

  return (
    <div
      className="case-art-surface"
      style={{
        background: `linear-gradient(150deg, ${platform.color} 0%, #080c16 65%, ${platform.accent}44 100%)`,
      }}
    >
      {artUrl && stage !== "failed" ? (
        <img
          src={artUrl}
          alt={game.title}
          className="case-art-img"
          loading="lazy"
          decoding="async"
          onError={handleImgError}
        />
      ) : (
        <div className="case-art-fallback">
          <span className="case-fallback-badge" style={{ borderColor: platform.accent, color: platform.accent }}>
            {platform.shortName}
          </span>
          <span className="case-fallback-monogram">{initials(game.title)}</span>
          <span className="case-fallback-title">{game.title}</span>
        </div>
      )}

      {/* Show floating logo ONLY when falling back to a hero/header banner without cover art */}
      {!isCoverArt && logoUrl && (
        <div className="case-logo-overlay">
          <img src={logoUrl} alt="" onError={() => setLogoBroken(true)} />
        </div>
      )}
    </div>
  );
};

const CollectibleCardComponent: React.FC<CollectibleProps> = ({
  game,
  platform,
  focused = false,
  size = "coverflow",
  onClick,
  onDoubleClick,
}) => {
  const style: ArtStyle = platform.artStyle;
  const pid = platform.id;

  // Determine physical case aesthetic class
  const getCaseTypeClass = () => {
    if (pid === "switch" || pid === "switch2") return "case-type-switch";
    if (pid === "nds") return "case-type-nds";
    if (pid === "n3ds") return "case-type-3ds";
    if (pid === "wiiu") return "case-type-wiiu";
    if (pid === "wii") return "case-type-wii";
    if (pid === "xbox360") return "case-type-xbox360";
    if (pid === "xbox") return "case-type-xbox";
    if (pid === "ps3") return "case-type-ps3";
    if (pid === "ps2") return "case-type-ps2";
    if (["ps4", "ps5", "psvita"].includes(pid)) return "case-type-ps-blue";
    if (["psx", "saturn", "segacd", "dreamcast", "pcenginecd", "3do"].includes(pid)) return "case-type-jewel";
    if (pid === "gc") return "case-type-gamecube";
    if (pid === "psp") return "case-type-psp";
    if (style.startsWith("cart-")) return "case-type-cartridge";
    return "case-type-pc";
  };

  const caseType = getCaseTypeClass();
  const isCartridge = caseType === "case-type-cartridge";

  // Banner branding text & colors
  const getBannerText = () => {
    if (pid === "switch" || pid === "switch2") return "NINTENDO SWITCH";
    if (pid === "nds") return "NINTENDO DS";
    if (pid === "n3ds") return "NINTENDO 3DS";
    if (pid === "wiiu") return "Wii U";
    if (pid === "wii") return "Wii";
    if (pid === "xbox360") return "XBOX 360";
    if (pid === "xbox") return "XBOX";
    if (pid === "ps3") return "PlayStation 3";
    if (pid === "ps2") return "PlayStation 2";
    if (pid === "psx") return "PlayStation";
    if (pid === "psp") return "PSP";
    if (pid === "psvita") return "PS VITA";
    if (pid === "gc") return "NINTENDO GAMECUBE";
    if (pid === "dreamcast") return "DREAMCAST";
    return platform.shortName.toUpperCase();
  };

  return (
    <div
      className={`physical-3d-item ${caseType} size-${size} ${focused ? "is-focused" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={
        {
          "--plat-color": platform.color,
          "--plat-accent": platform.accent,
        } as React.CSSProperties
      }
    >
      <div className="case-3d-wrapper">
        {/* Real 3D Physical Game Case Box */}
        {!isCartridge ? (
          <div className="case-3d-box">
            {/* Front Face with clear plastic sleeve, reflections & cover insert */}
            <div className="case-face-front">
              {/* Outer clear transparent plastic film reflection & edge highlights */}
              <div className="case-plastic-wrap">
                <div className="case-plastic-glare" />
                <div className="case-plastic-sheen-sweep" />
              </div>

              {/* Console Banner on top of the case */}
              <div className="case-top-banner">
                <span className="banner-logo-text">{getBannerText()}</span>
                <span className="banner-notch" />
              </div>

              {/* Cover Art Insert */}
              <div className="case-cover-insert">
                <CaseArtwork game={game} platform={platform} />
              </div>

              {/* Clear thumb-latch indent on the right edge */}
              <div className="case-latch-indent" />
            </div>

            {/* Left 3D Spine Thickness */}
            <div className="case-face-spine">
              <div className="spine-top-logo">{platform.shortName}</div>
              <div className="spine-title-vertical">{game.title}</div>
              <div className="spine-bottom-badge">{platform.manufacturer}</div>
            </div>

            {/* Top Molded Plastic Edge */}
            <div className="case-face-top">
              <div className="top-plastic-seam" />
            </div>

            {/* Right Molded Plastic Edge with Snap Clip */}
            <div className="case-face-right">
              <div className="right-snap-latch" />
            </div>

            {/* Bottom Molded Plastic Edge */}
            <div className="case-face-bottom" />
          </div>
        ) : (
          /* Molded 3D Retro Cartridge (NES / SNES / N64 / Game Boy / GBA / Sega) */
          <div className={`cartridge-3d-box ${style}`}>
            {/* Front Cartridge Face */}
            <div className="cart-face-front">
              <div className="cart-top-ridge">
                <div className="cart-finger-grooves" />
                <span className="cart-embossed-name">{platform.shortName}</span>
                <div className="cart-finger-grooves" />
              </div>

              <div className="cart-middle-body">
                <div className="cart-side-flute left" />
                <div className="cart-recessed-label">
                  <div className="cart-label-header">
                    <span>{platform.manufacturer.toUpperCase()}</span>
                    <span>{game.region || platform.shortName}</span>
                  </div>
                  <div className="cart-label-art">
                    <CaseArtwork game={game} platform={platform} />
                    <div className="cart-label-gloss" />
                  </div>
                </div>
                <div className="cart-side-flute right" />
              </div>

              <div className="cart-bottom-bevel" />
            </div>

            {/* Left 3D Cartridge Spine */}
            <div className="cart-face-spine">
              <span>{platform.shortName}</span>
            </div>

            {/* Top 3D Cartridge Edge */}
            <div className="cart-face-top" />

            {/* Bottom 3D Cartridge Pins */}
            <div className="cart-face-bottom">
              <div className="cart-gold-contacts" />
            </div>
          </div>
        )}

        {/* Realistic Glass Floor Reflection & Ambient Ground Spotlight */}
        <div className="case-floor-stage">
          <div className="case-mirror-reflection">
            <div className="case-mirror-fade" />
          </div>
          <div className="case-ground-spotlight" />
        </div>

        {game.favorite && (
          <div className="case-favorite-star" title="Favorite">
            ★
          </div>
        )}
      </div>

      {size === "coverflow" && (
        <div className="case-3d-caption">
          <div className="case-caption-title">{game.title}</div>
          <div className="case-caption-sub">
            <span className="case-caption-platform">{platform.shortName}</span>
            {game.metadata?.releaseDate && <span>{game.metadata.releaseDate}</span>}
            {game.region && <span>{game.region}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export const CollectibleCard = React.memo(CollectibleCardComponent);
