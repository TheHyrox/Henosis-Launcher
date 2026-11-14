import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { api, Game, mediaSrc, Platform } from "../api";

export interface CoverFlow3DProps {
  games: Game[];
  platform: Platform;
  focusIdx: number;
  onFocusChange: (idx: number) => void;
  onSelectGame: (game: Game) => void;
  onLaunchGame: (game: Game) => void;
}

interface CaseSpec {
  w: number;
  h: number;
  d: number;
  shellColor: number;
  transmission: number;
  roughness: number;
  bannerBg: string;
  bannerTextColor: string;
  bannerLabel: string;
  styleKind: "nds" | "3ds" | "switch" | "banner" | "jewel" | "cartridge";
  spineBg: string;
  spineTextColor: string;
  claspColor: number;
}

function getCaseSpec(platform: Platform): CaseSpec {
  const pid = platform.id;
  const art = platform.artStyle;

  if (pid === "nds") {
    return {
      w: 2.46,
      h: 2.22,
      d: 0.29,
      shellColor: 0x2a313d,
      transmission: 0.32,
      roughness: 0.28,
      bannerBg: "#f8fafc",
      bannerTextColor: "#475569",
      bannerLabel: "NINTENDO DS",
      styleKind: "nds",
      spineBg: "#f8fafc",
      spineTextColor: "#0f172a",
      claspColor: 0x1e242e,
    };
  }

  if (pid === "n3ds") {
    return {
      w: 2.46,
      h: 2.22,
      d: 0.26,
      shellColor: 0xe2e8f0,
      transmission: 0.2,
      roughness: 0.24,
      bannerBg: "#f8fafc",
      bannerTextColor: "#334155",
      bannerLabel: "NINTENDO 3DS",
      styleKind: "3ds",
      spineBg: "#f8fafc",
      spineTextColor: "#0f172a",
      claspColor: 0xcbd5e1,
    };
  }

  if (pid === "switch" || pid === "switch2") {
    return {
      w: 1.72,
      h: 2.78,
      d: 0.18,
      shellColor: pid === "switch2" ? 0x7f1d1d : 0xdbeafe,
      transmission: pid === "switch2" ? 0.35 : 0.45,
      roughness: 0.18,
      bannerBg: "#e60012",
      bannerTextColor: "#ffffff",
      bannerLabel: pid === "switch2" ? "SWITCH 2" : "NINTENDO SWITCH",
      styleKind: "switch",
      spineBg: "#e60012",
      spineTextColor: "#ffffff",
      claspColor: 0x94a3b8,
    };
  }

  if (pid === "wiiu") {
    return {
      w: 2.02,
      h: 2.82,
      d: 0.24,
      shellColor: 0x009ac7,
      transmission: 0.28,
      roughness: 0.22,
      bannerBg: "#009ac7",
      bannerTextColor: "#ffffff",
      bannerLabel: "Wii U",
      styleKind: "banner",
      spineBg: "#009ac7",
      spineTextColor: "#ffffff",
      claspColor: 0x0369a1,
    };
  }

  if (pid === "wii") {
    return {
      w: 2.02,
      h: 2.82,
      d: 0.24,
      shellColor: 0xf1f5f9,
      transmission: 0.08,
      roughness: 0.22,
      bannerBg: "#f8fafc",
      bannerTextColor: "#334155",
      bannerLabel: "Wii",
      styleKind: "banner",
      spineBg: "#f8fafc",
      spineTextColor: "#0f172a",
      claspColor: 0xcbd5e1,
    };
  }

  if (pid === "gc") {
    return {
      w: 2.02,
      h: 2.82,
      d: 0.24,
      shellColor: 0x1e1b4b,
      transmission: 0.15,
      roughness: 0.25,
      bannerBg: "#1e1b4b",
      bannerTextColor: "#e0e7ff",
      bannerLabel: "NINTENDO GAMECUBE",
      styleKind: "banner",
      spineBg: "#1e1b4b",
      spineTextColor: "#ffffff",
      claspColor: 0x312e81,
    };
  }

  if (pid === "xbox360") {
    return {
      w: 2.02,
      h: 2.82,
      d: 0.24,
      shellColor: 0x16a34a,
      transmission: 0.36,
      roughness: 0.22,
      bannerBg: "#22c55e",
      bannerTextColor: "#ffffff",
      bannerLabel: "XBOX 360",
      styleKind: "banner",
      spineBg: "#f8fafc",
      spineTextColor: "#14532d",
      claspColor: 0x15803d,
    };
  }

  if (pid === "xbox") {
    return {
      w: 2.02,
      h: 2.82,
      d: 0.24,
      shellColor: 0x14532d,
      transmission: 0.32,
      roughness: 0.25,
      bannerBg: "#15803d",
      bannerTextColor: "#ffffff",
      bannerLabel: "XBOX",
      styleKind: "banner",
      spineBg: "#052e16",
      spineTextColor: "#86efac",
      claspColor: 0x14532d,
    };
  }

  if (pid === "ps3") {
    return {
      w: 2.02,
      h: 2.42,
      d: 0.22,
      shellColor: 0xcbd5e1,
      transmission: 0.45,
      roughness: 0.18,
      bannerBg: "#0f172a",
      bannerTextColor: "#f8fafc",
      bannerLabel: "PlayStation 3",
      styleKind: "banner",
      spineBg: "#0f172a",
      spineTextColor: "#f8fafc",
      claspColor: 0x64748b,
    };
  }

  if (pid === "ps4" || pid === "ps5") {
    return {
      w: 2.02,
      h: 2.52,
      d: 0.22,
      shellColor: 0x00439c,
      transmission: 0.38,
      roughness: 0.2,
      bannerBg: pid === "ps5" ? "#f8fafc" : "#00439c",
      bannerTextColor: pid === "ps5" ? "#0f172a" : "#ffffff",
      bannerLabel: pid.toUpperCase(),
      styleKind: "banner",
      spineBg: "#00439c",
      spineTextColor: "#ffffff",
      claspColor: 0x1d4ed8,
    };
  }

  if (pid === "ps2") {
    return {
      w: 2.02,
      h: 2.82,
      d: 0.24,
      shellColor: 0x111827,
      transmission: 0.05,
      roughness: 0.28,
      bannerBg: "#030712",
      bannerTextColor: "#f8fafc",
      bannerLabel: "PlayStation 2",
      styleKind: "banner",
      spineBg: "#030712",
      spineTextColor: "#f8fafc",
      claspColor: 0x1f2937,
    };
  }

  if (pid === "psvita") {
    return {
      w: 1.72,
      h: 2.26,
      d: 0.2,
      shellColor: 0x0284c7,
      transmission: 0.42,
      roughness: 0.18,
      bannerBg: "#0369a1",
      bannerTextColor: "#ffffff",
      bannerLabel: "PS VITA",
      styleKind: "banner",
      spineBg: "#0369a1",
      spineTextColor: "#ffffff",
      claspColor: 0x0284c7,
    };
  }

  if (pid === "psp") {
    return {
      w: 1.68,
      h: 2.74,
      d: 0.22,
      shellColor: 0xe2e8f0,
      transmission: 0.48,
      roughness: 0.16,
      bannerBg: "#0f172a",
      bannerTextColor: "#ffffff",
      bannerLabel: "PSP",
      styleKind: "banner",
      spineBg: "#f8fafc",
      spineTextColor: "#0f172a",
      claspColor: 0x94a3b8,
    };
  }

  if (["psx", "saturn", "segacd", "dreamcast", "pcenginecd", "3do"].includes(pid)) {
    return {
      w: 2.38,
      h: 2.18,
      d: 0.2,
      shellColor: 0xe2e8f0,
      transmission: 0.55,
      roughness: 0.14,
      bannerBg: "#0f172a",
      bannerTextColor: "#ffffff",
      bannerLabel: platform.shortName.toUpperCase(),
      styleKind: "jewel",
      spineBg: "#0f172a",
      spineTextColor: "#ffffff",
      claspColor: 0x64748b,
    };
  }

  if (art.startsWith("cart-")) {
    const cartColor =
      pid === "nes"
        ? 0x94a3b8
        : pid === "snes"
          ? 0xa1a1aa
          : pid === "n64"
            ? 0x475569
            : pid === "gb"
              ? 0x9ca3af
              : pid === "gba"
                ? 0x334155
                : 0x1e293b;
    return {
      w: 2.1,
      h: 2.35,
      d: 0.3,
      shellColor: cartColor,
      transmission: 0.0,
      roughness: 0.48,
      bannerBg: platform.color,
      bannerTextColor: "#ffffff",
      bannerLabel: platform.shortName.toUpperCase(),
      styleKind: "cartridge",
      spineBg: platform.color,
      spineTextColor: "#ffffff",
      claspColor: cartColor,
    };
  }

  // Steam / PC / Digital
  return {
    w: 1.98,
    h: 2.8,
    d: 0.24,
    shellColor: 0x1e293b,
    transmission: 0.22,
    roughness: 0.24,
    bannerBg: "#0f172a",
    bannerTextColor: "#e2e8f0",
    bannerLabel: platform.shortName.toUpperCase(),
    styleKind: "banner",
    spineBg: "#0f172a",
    spineTextColor: "#f8fafc",
    claspColor: 0x334155,
  };
}

function getGameArtCandidates(game: Game): string[] {
  const candidates: string[] = [];
  if (game.cover) {
    const url = mediaSrc(game.cover);
    if (url) candidates.push(url);
  }
  if (game.steamAppId && (!game.cover || game.cover.includes("steamstatic"))) {
    const cdn = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.steamAppId}/library_600x900_2x.jpg`;
    if (!candidates.includes(cdn)) candidates.push(cdn);
  }
  if (game.metadata?.header) {
    const url = mediaSrc(game.metadata.header);
    if (url && !candidates.includes(url)) candidates.push(url);
  }
  if (game.hero) {
    const url = mediaSrc(game.hero);
    if (url && !candidates.includes(url)) candidates.push(url);
  }
  return candidates;
}

function initials(title: string): string {
  return title
    .split(/[\s:–-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function drawWraparoundCanvas(
  canvas: HTMLCanvasElement,
  game: Game,
  platform: Platform,
  spec: CaseSpec,
  coverImg: HTMLImageElement | null
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width; // 1024
  const H = canvas.height; // 512
  const spineW = 56;
  const panelW = (W - spineW) / 2; // 484
  const fx = panelW + spineW; // 540

  ctx.clearRect(0, 0, W, H);

  // --------------------------------------------------------------------------
  // 1. BACK COVER (0 .. panelW)
  // --------------------------------------------------------------------------
  const backGrad = ctx.createLinearGradient(0, 0, panelW, H);
  backGrad.addColorStop(0, "#090d16");
  backGrad.addColorStop(1, platform.color || "#1e293b");
  ctx.fillStyle = backGrad;
  ctx.fillRect(0, 0, panelW, H);

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(panelW * 0.5, H * 0.45, 160, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(game.title.slice(0, 32), panelW * 0.5, H * 0.42);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  const metaParts = [platform.name, game.region, game.metadata?.genre].filter(Boolean);
  ctx.fillText(metaParts.join("  •  ").slice(0, 48), panelW * 0.5, H * 0.52);

  // --------------------------------------------------------------------------
  // 2. SPINE (panelW .. panelW + spineW)
  // --------------------------------------------------------------------------
  ctx.fillStyle = spec.spineBg;
  ctx.fillRect(panelW, 0, spineW, H);

  // Top console label on spine
  ctx.save();
  ctx.translate(panelW + spineW / 2, 68);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '900 11px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = spec.spineTextColor;
  ctx.globalAlpha = 0.78;
  ctx.textAlign = "center";
  ctx.fillText(platform.shortName.toUpperCase(), 0, 4);
  ctx.restore();

  // Vertical game title on spine
  ctx.save();
  ctx.translate(panelW + spineW / 2, 275);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '800 16px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = spec.spineTextColor;
  ctx.textAlign = "center";
  ctx.fillText(game.title.slice(0, 28), 0, 5);
  ctx.restore();

  // Bottom accent triangle on spine (classic Nintendo DS / Pal style)
  ctx.fillStyle = platform.accent || "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(panelW + 12, H - 18);
  ctx.lineTo(panelW + spineW - 12, H - 18);
  ctx.lineTo(panelW + spineW / 2, H - 40);
  ctx.closePath();
  ctx.fill();

  // --------------------------------------------------------------------------
  // 3. FRONT COVER (fx .. W) — full-bleed cover art, no console banner
  // --------------------------------------------------------------------------
  const artX = fx;
  const artY = 0;
  const artW = panelW;
  const artH = H;

  // Fallback gradient behind art
  const frontGrad = ctx.createLinearGradient(artX, artY, artX + artW, artY + artH);
  frontGrad.addColorStop(0, platform.color || "#0f172a");
  frontGrad.addColorStop(1, "#090d16");
  ctx.fillStyle = frontGrad;
  ctx.fillRect(artX, artY, artW, artH);

  if (coverImg && coverImg.naturalWidth > 0 && coverImg.naturalHeight > 0) {
    // Draw cover art with zero cropping and zero stretching in 3D world space
    ctx.save();
    ctx.beginPath();
    ctx.rect(artX, artY, artW, artH);
    ctx.clip();

    const frontW = spec.styleKind === "cartridge" ? spec.w * 0.74 : spec.w - 0.05;
    const frontH = spec.styleKind === "cartridge" ? spec.h * 0.62 : spec.h - 0.06;
    const physicalRatio = frontW / frontH;
    const imgRatio = coverImg.naturalWidth / coverImg.naturalHeight;

    // 1. Blurred ambient-fill backdrop so any aspect-ratio margin blends seamlessly
    let bgW = artW;
    let bgH = artH;
    let bgX = artX;
    let bgY = artY;
    if (imgRatio > physicalRatio) {
      bgH = artH;
      bgW = ((frontH * imgRatio) / frontW) * artW;
      bgX = artX - (bgW - artW) / 2;
    } else {
      bgW = artW;
      bgH = ((frontW / imgRatio) / frontH) * artH;
      bgY = artY - (bgH - artH) / 2;
    }
    ctx.filter = "blur(18px) brightness(0.42)";
    ctx.drawImage(coverImg, bgX, bgY, bgW, bgH);
    ctx.filter = "none";

    // 2. Sharp foreground cover fitted with exact 3D physical aspect ratio (contain: no crop, no stretch)
    let physDrawW: number;
    let physDrawH: number;
    if (imgRatio > physicalRatio) {
      physDrawW = frontW;
      physDrawH = frontW / imgRatio;
    } else {
      physDrawH = frontH;
      physDrawW = frontH * imgRatio;
    }

    const drawW = (physDrawW / frontW) * artW;
    const drawH = (physDrawH / frontH) * artH;
    const drawX = artX + (artW - drawW) / 2;
    const drawY = artY + (artH - drawH) / 2;

    ctx.drawImage(coverImg, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    // Rich studio fallback cover
    ctx.save();
    ctx.beginPath();
    ctx.rect(artX, artY, artW, artH);
    ctx.clip();

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(artX + artW * 0.55, artY + artH * 0.44, 150, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 8;
    ctx.strokeStyle = platform.accent || "rgba(255,255,255,0.2)";
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(artX + artW * 0.55, artY + artH * 0.44, 185, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = '900 96px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 18;
    ctx.fillText(initials(game.title) || "G", artX + artW * 0.5, artY + artH * 0.4);

    ctx.font = '800 28px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(game.title.slice(0, 24).toUpperCase(), artX + artW * 0.5, artY + artH * 0.72);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export const CoverFlow3D: React.FC<CoverFlow3DProps> = ({
  games,
  platform,
  focusIdx,
  onFocusChange,
  onSelectGame,
  onLaunchGame,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs so animation loop and event handlers always read latest props without recreating WebGL context
  const gamesRef = useRef(games);
  const focusIdxRef = useRef(focusIdx);
  const onFocusChangeRef = useRef(onFocusChange);
  const onSelectGameRef = useRef(onSelectGame);
  const onLaunchGameRef = useRef(onLaunchGame);

  gamesRef.current = games;
  focusIdxRef.current = focusIdx;
  onFocusChangeRef.current = onFocusChange;
  onSelectGameRef.current = onSelectGame;
  onLaunchGameRef.current = onLaunchGame;

  // Map of gameId -> { group, targetX, ... } managed inside effect
  const syncSceneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const spec = getCaseSpec(platform);
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || 520;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0.55, 8.1);
    camera.lookAt(0, -0.05, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    // 2. Soft Matte Studio Lighting (no harsh specular hotspots)
    const ambientLight = new THREE.AmbientLight(0xf1f5f9, 1.15);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(0, 6.5, 6.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    const d = 8;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // Transparent shadow-catching studio floor
    const floorY = -spec.h / 2 - 0.18;
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.42 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    scene.add(floor);

    // 3. Shared Geometries & Materials
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const shellGeo = new RoundedBoxGeometry(spec.w, spec.h, spec.d, 5, 0.045);
    const plasticShellMat = new THREE.MeshStandardMaterial({
      color: spec.shellColor,
      roughness: 0.78,
      metalness: 0.0,
    });

    const paperGeo =
      spec.styleKind === "cartridge"
        ? new THREE.BoxGeometry(spec.w * 0.74, spec.h * 0.62, spec.d + 0.015)
        : new THREE.BoxGeometry(spec.w - 0.05, spec.h - 0.06, spec.d + 0.004);

    const claspGeo = new THREE.BoxGeometry(0.025, 0.42, 0.14);
    const claspMat = new THREE.MeshStandardMaterial({ color: spec.claspColor, roughness: 0.75 });
    const paperEdgeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 });
    const goldPinsGeo = spec.styleKind === "cartridge" ? new THREE.BoxGeometry(spec.w * 0.65, 0.12, 0.06) : null;
    const goldPinsMat =
      spec.styleKind === "cartridge"
        ? new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.22 })
        : null;

    // Pool of active 3D case meshes keyed by game.id
    interface CaseEntry {
      game: Game;
      group: THREE.Group;
      wrapTex: THREE.CanvasTexture;
      frontTex: THREE.CanvasTexture;
      spineTex: THREE.CanvasTexture;
      backTex: THREE.CanvasTexture;
      materials: THREE.Material[];
      disposed: boolean;
    }

    const activeCases = new Map<number, CaseEntry>();

    function createCaseEntry(game: Game): CaseEntry {
      const group = new THREE.Group();
      group.userData = { gameId: game.id };

      const shellMesh = new THREE.Mesh(shellGeo, plasticShellMat);
      shellMesh.castShadow = true;
      shellMesh.receiveShadow = true;
      group.add(shellMesh);

      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 512;
      drawWraparoundCanvas(canvas, game, platform, spec, null);

      const wrapTex = new THREE.CanvasTexture(canvas);
      wrapTex.colorSpace = THREE.SRGBColorSpace;
      wrapTex.anisotropy = maxAnisotropy;

      const frontTex = wrapTex.clone();
      frontTex.needsUpdate = true;
      frontTex.offset.set(540 / 1024, 0);
      frontTex.repeat.set(484 / 1024, 1);

      const spineTex = wrapTex.clone();
      spineTex.needsUpdate = true;
      spineTex.offset.set(484 / 1024, 0);
      spineTex.repeat.set(56 / 1024, 1);

      const backTex = wrapTex.clone();
      backTex.needsUpdate = true;
      backTex.offset.set(0, 0);
      backTex.repeat.set(484 / 1024, 1);

      const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.88, metalness: 0.0 });
      const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.88, metalness: 0.0 });
      const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.88, metalness: 0.0 });

      const paperMesh = new THREE.Mesh(paperGeo, [
        paperEdgeMat,
        spineMat,
        paperEdgeMat,
        paperEdgeMat,
        frontMat,
        backMat,
      ]);
      if (spec.styleKind === "cartridge") {
        paperMesh.position.y = -0.08;
      } else {
        // Shift slightly left so the printed spine wraps the left edge while the right plastic rim & clasps stay visible
        paperMesh.position.x = -0.027;
      }
      group.add(paperMesh);

      if (spec.styleKind !== "cartridge") {
        const topClasp = new THREE.Mesh(claspGeo, claspMat);
        topClasp.position.set(spec.w / 2 + 0.002, spec.h * 0.24, 0);
        group.add(topClasp);

        const botClasp = new THREE.Mesh(claspGeo, claspMat);
        botClasp.position.set(spec.w / 2 + 0.002, -spec.h * 0.24, 0);
        group.add(botClasp);
      } else if (goldPinsGeo && goldPinsMat) {
        const pins = new THREE.Mesh(goldPinsGeo, goldPinsMat);
        pins.position.set(0, -spec.h / 2 - 0.02, 0);
        group.add(pins);
      }

      const entry: CaseEntry = {
        game,
        group,
        wrapTex,
        frontTex,
        spineTex,
        backTex,
        materials: [spineMat, frontMat, backMat],
        disposed: false,
      };

      // Asynchronously load cover art into canvas (using Tauri proxy for non-CORS hosts like thumbnails.libretro.com)
      const candidates = getGameArtCandidates(game);
      let candIdx = 0;
      let triedProxy = false;
      const drawLoadedImg = (img: HTMLImageElement) => {
        if (entry.disposed) return;
        drawWraparoundCanvas(canvas, game, platform, spec, img);
        wrapTex.needsUpdate = true;
        frontTex.needsUpdate = true;
        spineTex.needsUpdate = true;
        backTex.needsUpdate = true;
      };
      const tryNextImage = () => {
        if (entry.disposed || candIdx >= candidates.length) return;
        const url = candidates[candIdx];
        const advance = () => {
          candIdx += 1;
          triedProxy = false;
          tryNextImage();
        };

        if (!triedProxy && url.startsWith("https://thumbnails.libretro.com/")) {
          triedProxy = true;
          api
            .fetchImageDataUrl(url)
            .then((dataUrl) => {
              if (entry.disposed) return;
              const img = new Image();
              img.onload = () => drawLoadedImg(img);
              img.onerror = advance;
              img.src = dataUrl;
            })
            .catch(advance);
          return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => drawLoadedImg(img);
        img.onerror = () => {
          if (!triedProxy && (url.startsWith("https://") || url.startsWith("http://"))) {
            triedProxy = true;
            api
              .fetchImageDataUrl(url)
              .then((dataUrl) => {
                if (entry.disposed) return;
                const proxyImg = new Image();
                proxyImg.onload = () => drawLoadedImg(proxyImg);
                proxyImg.onerror = advance;
                proxyImg.src = dataUrl;
              })
              .catch(advance);
          } else {
            advance();
          }
        };
        img.src = url;
      };
      tryNextImage();

      return entry;
    }

    function disposeCaseEntry(entry: CaseEntry) {
      entry.disposed = true;
      scene.remove(entry.group);
      entry.wrapTex.dispose();
      entry.frontTex.dispose();
      entry.spineTex.dispose();
      entry.backTex.dispose();
      entry.materials.forEach((m) => m.dispose());
    }

    function syncVisibleCases() {
      const list = gamesRef.current;
      const curIdx = focusIdxRef.current;
      const neededIds = new Set<number>();

      for (let i = Math.max(0, curIdx - 6); i <= Math.min(list.length - 1, curIdx + 6); i++) {
        neededIds.add(list[i].id);
      }

      // Remove out-of-window cases
      for (const [id, entry] of activeCases.entries()) {
        if (!neededIds.has(id)) {
          disposeCaseEntry(entry);
          activeCases.delete(id);
        }
      }

      // Add newly visible cases at their target position so they don't fly in from origin
      for (let i = Math.max(0, curIdx - 6); i <= Math.min(list.length - 1, curIdx + 6); i++) {
        const g = list[i];
        if (!activeCases.has(g.id)) {
          const entry = createCaseEntry(g);
          const offset = i - curIdx;
          const absOffset = Math.abs(offset);
          if (offset === 0) {
            entry.group.position.set(0, 0.05, 1.65);
            entry.group.rotation.y = 0;
            entry.group.scale.setScalar(1.05);
          } else {
            const sign = Math.sign(offset);
            entry.group.position.set(
              sign * (2.25 + (absOffset - 1) * 1.15),
              -0.12,
              -0.35 - absOffset * 0.45
            );
            entry.group.rotation.y = -sign * Math.min(0.68 + (absOffset - 1) * 0.18, 1.32);
            entry.group.scale.setScalar(0.94);
          }
          scene.add(entry.group);
          activeCases.set(g.id, entry);
        }
      }
    }

    syncSceneRef.current = syncVisibleCases;
    syncVisibleCases();

    // 4. Raycasting for Click / Double-Click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const pickGameIndex = (clientX: number, clientY: number): number => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const groups = Array.from(activeCases.values()).map((e) => e.group);
      const hits = raycaster.intersectObjects(groups, true);
      if (hits.length === 0) return -1;

      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && obj.userData?.gameId === undefined) {
        obj = obj.parent;
      }
      if (!obj || obj.userData?.gameId === undefined) return -1;
      return gamesRef.current.findIndex((g) => g.id === obj!.userData.gameId);
    };

    const handleClick = (e: MouseEvent) => {
      const clickedIdx = pickGameIndex(e.clientX, e.clientY);
      if (clickedIdx === -1) return;
      if (clickedIdx === focusIdxRef.current) {
        onSelectGameRef.current(gamesRef.current[clickedIdx]);
      } else {
        onFocusChangeRef.current(clickedIdx);
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      const clickedIdx = pickGameIndex(e.clientX, e.clientY);
      if (clickedIdx !== -1 && clickedIdx === focusIdxRef.current) {
        onLaunchGameRef.current(gamesRef.current[clickedIdx]);
      }
    };

    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("dblclick", handleDblClick);

    // 5. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // 6. Animation Loop
    let rafId = 0;
    const lerpSpeed = 0.14;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const list = gamesRef.current;
      const curIdx = focusIdxRef.current;

      for (let i = Math.max(0, curIdx - 6); i <= Math.min(list.length - 1, curIdx + 6); i++) {
        const g = list[i];
        const entry = activeCases.get(g.id);
        if (!entry) continue;

        const offset = i - curIdx;
        const absOffset = Math.abs(offset);

        let targetX: number;
        let targetY: number;
        let targetZ: number;
        let targetRotY: number;
        let targetScale: number;

        if (offset === 0) {
          targetX = 0;
          targetY = 0.05;
          targetZ = 1.65;
          targetRotY = 0;
          targetScale = 1.05;
        } else {
          const sign = Math.sign(offset);
          targetX = sign * (2.25 + (absOffset - 1) * 1.15);
          targetY = -0.12;
          targetZ = -0.35 - absOffset * 0.45;
          targetRotY = -sign * Math.min(0.68 + (absOffset - 1) * 0.18, 1.32);
          targetScale = 0.94;
        }

        const m = entry.group;
        m.position.x = THREE.MathUtils.lerp(m.position.x, targetX, lerpSpeed);
        m.position.y = THREE.MathUtils.lerp(m.position.y, targetY, lerpSpeed);
        m.position.z = THREE.MathUtils.lerp(m.position.z, targetZ, lerpSpeed);
        m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, targetRotY, lerpSpeed);

        const s = THREE.MathUtils.lerp(m.scale.x, targetScale, lerpSpeed);
        m.scale.setScalar(s);
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("dblclick", handleDblClick);

      for (const entry of activeCases.values()) {
        disposeCaseEntry(entry);
      }
      activeCases.clear();

      shellGeo.dispose();
      plasticShellMat.dispose();
      paperGeo.dispose();
      claspGeo.dispose();
      claspMat.dispose();
      paperEdgeMat.dispose();
      goldPinsGeo?.dispose();
      goldPinsMat?.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [platform.id]);

  // Sync visible cases whenever games list or focusIdx changes
  useEffect(() => {
    syncSceneRef.current?.();
  }, [games, focusIdx]);

  return (
    <div
      ref={containerRef}
      className="coverflow-3d-canvas-host"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "460px",
        zIndex: 2,
        cursor: "pointer",
      }}
    />
  );
};
