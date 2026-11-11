// Dynamic Console-Themed Environments
// Dynamically adapts the color palette, ambient lighting, and animated background
// based on the selected console system:
// - Wii U: Soft cyan/sky-blue background with animated ambient wavy ribbons (Wii U / Nintendo Network style)
// - Switch / Switch 2: Deep red and scarlet gradients with subtle glowing wave patterns
// - PSP / PS1 / PS2 / PS3 / PS4 / PS5 / PS Vita: Cool navy, deep indigo, and slate-blue atmospheric themes
// - Xbox 360 / Xbox: Radiant emerald/forest-green lighting and curved flowing lines (Xbox 360 dashboard aesthetic)
// - Retro & other platforms: Tailored authentic ambient themes

import React from "react";

export interface ConsoleEnvironmentProps {
  platformId?: string | null;
  className?: string;
}

export const ConsoleEnvironment: React.FC<ConsoleEnvironmentProps> = ({
  platformId = "switch",
  className = "",
}) => {
  const pid = (platformId || "steam").toLowerCase();

  // Wii U & Wii (Soft cyan/sky-blue with animated ambient wavy ribbons)
  if (pid === "wiiu" || pid === "wii") {
    return (
      <div className={`env-container env-wiiu ${className}`}>
        <div className="env-gradient-base" />
        {/* Animated glowing wavy ribbons */}
        <svg className="wiiu-ribbons-svg" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="wiiu-grad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00b4d8" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#90e0ef" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#0077b6" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="wiiu-grad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#48cae4" stopOpacity="0.35" />
              <stop offset="60%" stopColor="#caf0f8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#03045e" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="wiiu-grad3" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0096c7" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ade8f4" stopOpacity="0.5" />
            </linearGradient>
            <filter id="wiiu-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="18" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <path
            className="wiiu-wave wave-1"
            fill="url(#wiiu-grad1)"
            d="M-100,320 C320,180 540,480 920,280 C1200,140 1380,390 1600,240 L1600,900 L-100,900 Z"
          />
          <path
            className="wiiu-wave wave-2"
            fill="url(#wiiu-grad2)"
            d="M-80,480 C260,340 680,620 1080,380 C1320,240 1480,460 1600,380 L1600,900 L-80,900 Z"
          />
          <path
            className="wiiu-wave wave-3"
            fill="url(#wiiu-grad3)"
            d="M-120,620 C220,520 620,740 1040,560 C1360,420 1480,590 1600,540 L1600,900 L-120,900 Z"
          />
        </svg>

        {/* Floating soft network orbs */}
        <div className="wiiu-orb orb-1" />
        <div className="wiiu-orb orb-2" />
        <div className="wiiu-orb orb-3" />
        <div className="env-ambient-vignette" />
      </div>
    );
  }

  // Switch / Switch 2 (Deep red and scarlet gradients with subtle glowing wave patterns)
  if (pid === "switch" || pid === "switch2") {
    return (
      <div className={`env-container env-switch ${className}`}>
        <div className="env-gradient-base" />
        {/* Glowing wave patterns and neon pulse */}
        <svg className="switch-waves-svg" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="switch-scarlet" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e60012" stopOpacity="0.45" />
              <stop offset="40%" stopColor="#ff3838" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#7a0009" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="switch-neon-blue" x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#00c3e3" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#005f73" stopOpacity="0.0" />
            </linearGradient>
            <filter id="switch-glow">
              <feGaussianBlur stdDeviation="24" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <path
            className="switch-wave switch-wave-1"
            fill="url(#switch-scarlet)"
            d="M-50,220 Q380,80 720,260 T1500,160 L1500,900 L-50,900 Z"
          />
          <path
            className="switch-wave switch-wave-2"
            fill="url(#switch-scarlet)"
            d="M-50,420 Q480,280 880,480 T1500,360 L1500,900 L-50,900 Z"
          />
          <path
            className="switch-neon-flare"
            fill="url(#switch-neon-blue)"
            d="M800,900 Q1100,550 1440,580 L1440,900 Z"
          />
        </svg>

        {/* Pulse glow orbs */}
        <div className="switch-glow-orb orb-red" />
        <div className="switch-glow-orb orb-cyan" />
        <div className="switch-diag-stripes" />
        <div className="env-ambient-vignette" />
      </div>
    );
  }

  // PSP / PS1 / PS2 / PS3 / PS4 / PS5 / PS Vita (Cool navy, deep indigo, and slate-blue atmospheric themes)
  if (
    pid === "psp" ||
    pid === "psvita" ||
    pid === "psx" ||
    pid === "ps2" ||
    pid === "ps3" ||
    pid === "ps4" ||
    pid === "ps5"
  ) {
    return (
      <div className={`env-container env-playstation ${className}`}>
        <div className="env-gradient-base" />
        {/* Atmospheric flowing XMB ribbon lines */}
        <svg className="ps-ribbon-svg" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ps-indigo" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1a2a6c" stopOpacity="0.1" />
              <stop offset="35%" stopColor="#3a5ba0" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#6488e4" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#2b32b2" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="ps-cyan-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4facfe" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#00f2fe" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#4facfe" stopOpacity="0.1" />
            </linearGradient>
            <filter id="ps-glow">
              <feGaussianBlur stdDeviation="14" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Flowing atmospheric waves reminiscent of the PS3 / PSP XMB ribbon */}
          <path
            className="ps-wave ps-wave-1"
            fill="url(#ps-indigo)"
            d="M-50,440 C320,260 620,580 980,380 C1240,240 1380,420 1500,360 L1500,900 L-50,900 Z"
          />
          <path
            className="ps-stroke-line line-1"
            stroke="url(#ps-cyan-stroke)"
            strokeWidth="3.5"
            fill="none"
            d="M-50,438 C320,258 620,578 980,378 C1240,238 1380,418 1500,358"
          />
          <path
            className="ps-wave ps-wave-2"
            fill="url(#ps-indigo)"
            d="M-50,560 C380,420 680,680 1060,500 C1300,380 1400,540 1500,480 L1500,900 L-50,900 Z"
          />
          <path
            className="ps-stroke-line line-2"
            stroke="url(#ps-cyan-stroke)"
            strokeWidth="2.2"
            strokeDasharray="12 6"
            fill="none"
            d="M-50,558 C380,418 680,678 1060,498 C1300,378 1400,538 1500,478"
          />
        </svg>

        {/* Ethereal floating light dust sparkles */}
        <div className="ps-sparkle sp-1" />
        <div className="ps-sparkle sp-2" />
        <div className="ps-sparkle sp-3" />
        <div className="ps-horizon-glow" />
        <div className="env-ambient-vignette" />
      </div>
    );
  }

  // Xbox 360 & Xbox (Radiant emerald/forest-green lighting and curved flowing lines echoing the Xbox 360 dashboard)
  if (pid === "xbox360" || pid === "xbox") {
    return (
      <div className={`env-container env-xbox360 ${className}`}>
        <div className="env-gradient-base" />
        {/* Curved flowing radiant emerald lines & 360 dashboard blades aura */}
        <svg className="xbox-blades-svg" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="xbox-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5dc21e" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#2e7d32" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0b2408" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="xbox-neon-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#5dc21e" stopOpacity="0.1" />
              <stop offset="40%" stopColor="#a6ff54" stopOpacity="0.85" />
              <stop offset="80%" stopColor="#5dc21e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#1b5e20" stopOpacity="0.0" />
            </linearGradient>
            <radialGradient id="xbox-orb-glow" cx="50%" cy="40%" r="50%">
              <stop offset="0%" stopColor="#6ef022" stopOpacity="0.35" />
              <stop offset="60%" stopColor="#1b5e20" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#051203" stopOpacity="0" />
            </radialGradient>
            <filter id="xbox-glow">
              <feGaussianBlur stdDeviation="16" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Central radiant glowing sphere / 360 orb aura */}
          <circle cx="720" cy="380" r="320" fill="url(#xbox-orb-glow)" />

          {/* Curved flowing flowing lines mirroring the classic Xbox 360 blades UI */}
          <path
            className="xbox-curve curve-1"
            stroke="url(#xbox-neon-line)"
            strokeWidth="3.2"
            fill="none"
            d="M-50,680 C360,540 680,220 1200,160 C1380,140 1460,200 1500,240"
          />
          <path
            className="xbox-curve curve-2"
            stroke="url(#xbox-neon-line)"
            strokeWidth="2.4"
            fill="none"
            d="M-50,730 C420,590 740,280 1240,220 C1400,200 1460,260 1500,300"
          />
          <path
            className="xbox-curve curve-3"
            stroke="url(#xbox-neon-line)"
            strokeWidth="1.6"
            strokeDasharray="16 8"
            fill="none"
            d="M-50,780 C480,640 800,340 1280,280 C1420,260 1480,320 1500,360"
          />

          <path
            className="xbox-aurora-sweep"
            fill="url(#xbox-emerald)"
            d="M-50,900 L-50,720 C420,580 720,300 1200,260 L1500,280 L1500,900 Z"
          />
        </svg>

        <div className="xbox-radial-bloom" />
        <div className="env-ambient-vignette" />
      </div>
    );
  }

  // Nintendo GameCube (Rich violet / indigo with pulsing purple bubbles)
  if (pid === "gc") {
    return (
      <div className={`env-container env-gamecube ${className}`}>
        <div className="env-gradient-base" />
        <div className="gc-cube-grid" />
        <div className="gc-ambient-glow" />
        <div className="env-ambient-vignette" />
      </div>
    );
  }

  // Sega Dreamcast & Saturn (Warm orange swirl / cosmic arcade)
  if (pid === "dreamcast" || pid === "saturn") {
    return (
      <div className={`env-container env-dreamcast ${className}`}>
        <div className="env-gradient-base" />
        <div className="dc-swirl-glow" />
        <div className="env-ambient-vignette" />
      </div>
    );
  }

  // Retro Nintendo (NES / SNES / N64 / GB / GBA)
  if (["nes", "snes", "n64", "gb", "gbc", "gba", "nds", "n3ds"].includes(pid)) {
    return (
      <div className={`env-container env-retro-nintendo ${className}`}>
        <div className="env-gradient-base" />
        <div className="retro-synth-grid" />
        <div className="retro-color-bloom" />
        <div className="env-ambient-vignette" />
      </div>
    );
  }

  // Default: Steam / PC / Generic Deep Space Atmospheric Void
  return (
    <div className={`env-container env-default ${className}`}>
      <div className="env-gradient-base" />
      <div className="steam-ambient-grid" />
      <div className="steam-horizon-bloom" />
      <div className="env-ambient-vignette" />
    </div>
  );
};
