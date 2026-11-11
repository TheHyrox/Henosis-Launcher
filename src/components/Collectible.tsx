// 3D Physical Media Rendering Engine
// Renders games as fully realized 3D physical game cases:
// - Authentic console case plastic materials (translucent Switch red, Wii U cyan, Xbox 360 emerald green, PS3 clear Blu-ray, PS2 black, PS1 acrylic jewel case)
// - Realistic 3D spine thickness with console banner & vertical title
// - Clear transparent plastic sleeve wrap with realistic specular reflections & corner bevels
// - Glass / metallic floor surface with inverted mirror reflections and ambient spotlights
// - Molded 3D retro cartridges with top finger grips, label stickers, and gold connector pins

import React, { useState } from "react";
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

  // Steam / PC
  if (id === "steam" || id === "pc") {
    return (
      <svg viewBox="0 0 240 140" className={className} fill="none">
        <rect x="28" y="18" width="184" height="86" rx="10" fill="#101522" stroke={accent} strokeWidth="2.5" />
        <rect x="38" y="28" width="164" height="66" rx="5" fill="#090d16" />
        <circle cx="120" cy="61" r="18" stroke={accent} strokeWidth="3" opacity="0.85" />
        <circle cx="120" cy="61" r="7" fill={accent} />
        <path d="M90 116 H150 L162 124 H78 Z" fill="#1b2336" stroke={accent} strokeWidth="1.5" />
      </svg>
    );
  }

  // Handhelds (Game Boy / GBA / DS / 3DS / Switch / Vita / PSP / Game Gear / Lynx / WonderSwan / NGP)
  if (["gb", "gbc", "gba", "nds", "n3ds", "switch", "switch2", "psvita", "psp", "gamegear", "lynx", "wonderswan", "ngp", "pokemini"].includes(id)) {
    const vertical = ["gb", "gbc", "pokemini"].includes(id);
    if (vertical) {
      return (
        <svg viewBox="0 0 240 140" className={className} fill="none">
          <rect x="74" y="8" width="92" height="124" rx="12" fill="#171b26" stroke={accent} strokeWidth="2.5" />
          <rect x="86" y="18" width="68" height="50" rx="5" fill="#0b0f18" stroke={accent} strokeWidth="1.5" opacity="0.9" />
          <path d="M96 88 H108 M102 82 V94" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="138" cy="85" r="5" fill={accent} />
          <circle cx="126" cy="93" r="5" fill={accent} opacity="0.75" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 240 140" className={className} fill="none">
        <rect x="20" y="26" width="200" height="88" rx="28" fill="#151925" stroke={accent} strokeWidth="2.5" />
        <rect x="58" y="36" width="124" height="68" rx="6" fill="#090c14" stroke={accent} strokeWidth="1.4" opacity="0.85" />
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
        <rect x="26" y="42" width="188" height="64" rx="12" fill="#131722" stroke={accent} strokeWidth="2.5" />
        <rect x="38" y="70" width="164" height="5" rx="2.5" fill="#080a10" />
        <circle cx="120" cy="40" r="24" fill="#1a2030" stroke={accent} strokeWidth="2" opacity="0.9" />
        <circle cx="120" cy="40" r="6" fill="#090c14" stroke={accent} strokeWidth="1.5" />
        <circle cx="186" cy="56" r="4" fill={accent} />
        <rect x="46" y="86" width="44" height="8" rx="4" fill={accent} opacity="0.35" />
      </svg>
    );
  }

  // Classic cartridge deck (NES / SNES / N64 / Mega Drive / Atari / etc.)
  return (
    <svg viewBox="0 0 240 140" className={className} fill="none">
      <rect x="28" y="48" width="184" height="62" rx="10" fill="#151925" stroke={accent} strokeWidth="2.5" />
      <rect x="68" y="34" width="104" height="24" rx="5" fill="#1d2334" stroke={accent} strokeWidth="2" />
      <rect x="78" y="40" width="84" height="8" rx="2" fill={accent} opacity="0.55" />
      <rect x="46" y="76" width="38" height="12" rx="3" fill="#0b0e17" stroke={accent} strokeWidth="1.4" />
      <rect x="96" y="76" width="38" height="12" rx="3" fill="#0b0e17" stroke={accent} strokeWidth="1.4" />
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
  const [broken, setBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

  const artUrl = !broken
    ? mediaSrc(game.cover) || mediaSrc(game.metadata?.header) || mediaSrc(game.hero)
    : null;
  const logoUrl = !logoBroken ? mediaSrc(game.logo) : null;

  return (
    <div
      className="case-art-surface"
      style={{
        background: `linear-gradient(150deg, ${platform.color} 0%, #080c16 65%, ${platform.accent}44 100%)`,
      }}
    >
      {artUrl ? (
        <img
          src={artUrl}
          alt={game.title}
          className="case-art-img"
          loading="lazy"
          onError={() => setBroken(true)}
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

      {logoUrl && (
        <div className="case-logo-overlay">
          <img src={logoUrl} alt="" onError={() => setLogoBroken(true)} />
        </div>
      )}
    </div>
  );
};

export const CollectibleCard: React.FC<CollectibleProps> = ({
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
