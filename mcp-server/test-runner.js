#!/usr/bin/env node

/**
 * Direct Test Runner for Henosis Launcher Wayland Application
 * Connects to the test bridge on 127.0.0.1:9998, executes the complete feature suite,
 * and prints detailed results with colors.
 */

const http = require("http");
const fs = require("fs");

const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 9998;

function bridgeRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : "";
    const options = {
      hostname: BRIDGE_HOST,
      port: BRIDGE_PORT,
      path: endpoint,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 4000,
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body, statusCode: res.statusCode });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("\x1b[1m\x1b[36m============================================================\x1b[0m");
  console.log("\x1b[1m\x1b[36m  Henosis Launcher: Wayland Automated Feature Test Suite    \x1b[0m");
  console.log("\x1b[1m\x1b[36m============================================================\x1b[0m\n");

  const results = [];
  function record(name, pass, details) {
    results.push({ name, pass, details });
    const tag = pass ? "\x1b[32m✔ PASS\x1b[0m" : "\x1b[31m✖ FAIL\x1b[0m";
    console.log(` ${tag} \x1b[1m${name}\x1b[0m`);
    console.log(`    \x1b[90m└─ ${details}\x1b[0m`);
  }

  try {
    // 1. Health & Connection check
    const health = await bridgeRequest("GET", "/health");
    record(
      "App Health & Wayland Connection",
      health.ok === true,
      `App: ${health.name}, Version: ${health.version}, Environment: ${health.environment}`
    );

    // 2. Home View State & Hero Carousel
    await bridgeRequest("POST", "/navigate", { screen: { kind: "home" } });
    await sleep(250);
    const homeState = await bridgeRequest("GET", "/state");
    const isHome = homeState.state?.screen?.kind === "home";
    record(
      "Main Menu: Hero Carousel Active",
      isHome && homeState.state?.platformsCount > 0,
      `Current screen: ${homeState.state?.screen?.kind}, Platforms: ${homeState.state?.platformsCount}, Active: ${homeState.state?.activePlatformName}`
    );

    // 3. Navigation through Consoles
    await bridgeRequest("POST", "/eval", { script: "(window.__HENOSIS_STORE || window.__NEXUS_STORE).getState().setHomeIndex(0);" });
    await sleep(150);
    const initialIndex = 0;
    await bridgeRequest("POST", "/input", { button: "right" });
    await sleep(350);
    const nextState = await bridgeRequest("GET", "/state");
    const moved = nextState.state?.homeIndex !== initialIndex;
    record(
      "Hero Carousel: D-Pad Left/Right Navigation",
      moved,
      `Index shifted from ${initialIndex} to ${nextState.state?.homeIndex} (${nextState.state?.activePlatformName})`
    );

    // 4. Dynamic Console Environment: Switch
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "switch" } });
    await sleep(400);
    const switchState = await bridgeRequest("GET", "/state");
    const isSwitchEnv = switchState.state?.envClassName?.includes("env-switch");
    record(
      "Dynamic Environment: Nintendo Switch (Scarlet Neon Waves)",
      isSwitchEnv,
      `Active environment class: "${switchState.state?.envClassName}"`
    );

    // 5. Dynamic Console Environment: Wii U
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "wiiu" } });
    await sleep(400);
    const wiiuState = await bridgeRequest("GET", "/state");
    const isWiiuEnv = wiiuState.state?.envClassName?.includes("env-wiiu");
    record(
      "Dynamic Environment: Nintendo Wii U (Cyan Wavy Ribbons)",
      isWiiuEnv,
      `Active environment class: "${wiiuState.state?.envClassName}"`
    );

    // 6. Dynamic Console Environment: PlayStation 3
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "ps3" } });
    await sleep(400);
    const ps3State = await bridgeRequest("GET", "/state");
    const isPsEnv = ps3State.state?.envClassName?.includes("env-playstation");
    record(
      "Dynamic Environment: PlayStation 3 (Indigo/Slate XMB Atmosphere)",
      isPsEnv,
      `Active environment class: "${ps3State.state?.envClassName}"`
    );

    // 7. Dynamic Console Environment: Xbox 360
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "xbox360" } });
    await sleep(400);
    const xboxState = await bridgeRequest("GET", "/state");
    const isXboxEnv = xboxState.state?.envClassName?.includes("env-xbox360");
    record(
      "Dynamic Environment: Xbox 360 (Radiant Emerald Curves)",
      isXboxEnv,
      `Active environment class: "${xboxState.state?.envClassName}"`
    );

    // 8. 3D Cover Flow Carousel: Sizing & Elevation
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "steam" } });
    await sleep(400);
    const steamState = await bridgeRequest("GET", "/state");
    const hasCenterCover = steamState.state?.hasCenterCover;
    const centerTransform = steamState.state?.centerCoverTransform || "";
    const isElevatedAndScaled = centerTransform.includes("scale(1.42)") || centerTransform.includes("translateZ(170px)");
    record(
      "3D Cover Flow Carousel: Taller Stage & Uniform Scaling",
      hasCenterCover && isElevatedAndScaled,
      `Center transform: "${centerTransform}", Cards rendered: ${steamState.state?.coverflowCount}`
    );

    // 9. Controller Navigation in Cover Flow
    const initialGame = steamState.state?.focusedGameTitle;
    await bridgeRequest("POST", "/input", { button: "right" });
    await sleep(300);
    const scrolledSteamState = await bridgeRequest("GET", "/state");
    const gameShifted = scrolledSteamState.state?.focusedGameTitle !== initialGame;
    record(
      "Cover Flow: D-Pad Carousel Glide",
      gameShifted || scrolledSteamState.state?.coverflowCount <= 1,
      `Focused title: "${scrolledSteamState.state?.focusedGameTitle}" (Previous: "${initialGame}")`
    );

    // 10. Navigation Flow: Return to Home
    await bridgeRequest("POST", "/eval", { script: "(window.__HENOSIS_STORE || window.__NEXUS_STORE).getState().goHome();" });
    await sleep(200);
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "steam" } });
    await sleep(300);
    await bridgeRequest("POST", "/input", { button: "b" });
    await sleep(350);
    const backState = await bridgeRequest("GET", "/state");
    const returnedHome = backState.state?.screen?.kind === "home";
    record(
      "Navigation Flow: 'B' Button Returns to Main Menu",
      returnedHome,
      `Navigated Home -> Steam, Pressed 'B' -> Returned to: ${backState.state?.screen?.kind}`
    );

    // 11. Wayland Native Screenshot Capture via Spectacle
    const screenshotPath = "/tmp/henosis_wayland_test.png";
    const shot = await bridgeRequest("POST", "/screenshot", { path: screenshotPath });
    const shotExists = fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 1000;
    record(
      "Wayland Native Screenshot Capture",
      shot.ok && shotExists,
      `Captured ${shotExists ? fs.statSync(screenshotPath).size : 0} bytes via Spectacle to ${screenshotPath}`
    );

  } catch (err) {
    console.error(`\x1b[31mError during test execution: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  const passedCount = results.filter((r) => r.pass).length;
  console.log("\n\x1b[1m\x1b[36m============================================================\x1b[0m");
  console.log(`\x1b[1m  Final Result: ${passedCount} / ${results.length} Tests Passed\x1b[0m`);
  console.log("\x1b[1m\x1b[36m============================================================\x1b[0m\n");
}

main();
