#!/usr/bin/env node

/**
 * Nexus Launcher Wayland MCP Server
 *
 * Exposes Model Context Protocol (MCP) tools for connecting to, inspecting,
 * driving, and testing the Nexus Launcher Wayland application.
 *
 * Implements JSON-RPC 2.0 over standard I/O (stdio).
 */

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const BRIDGE_PORT = 9998;
const BRIDGE_HOST = "127.0.0.1";

// Helper for making HTTP requests to the Tauri test bridge
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
      timeout: 3500,
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          resolve({ raw: body, statusCode: res.statusCode });
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Failed to connect to Nexus Launcher test bridge: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout connecting to Nexus Launcher test bridge"));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Full automated feature verification suite
async function runAllFeatureTests() {
  const results = [];

  function record(name, pass, details) {
    results.push({ name, pass, details });
  }

  try {
    // 1. Health & Connection check
    const health = await bridgeRequest("GET", "/health");
    record(
      "App Health & Wayland Connection",
      health.ok === true,
      `App: ${health.name}, Version: ${health.version}, Environment: ${health.environment}`
    );

    // 2. Test Home View State & Hero Carousel
    await bridgeRequest("POST", "/navigate", { screen: { kind: "home" } });
    await sleep(200);
    const homeState = await bridgeRequest("GET", "/state");
    const isHome = homeState.state?.screen?.kind === "home";
    record(
      "Main Menu: Hero Carousel Active",
      isHome && homeState.state?.platformsCount > 0,
      `Current screen: ${homeState.state?.screen?.kind}, Platforms: ${homeState.state?.platformsCount}, Active: ${homeState.state?.activePlatformName}`
    );

    // 3. Test Navigation through Consoles (Left / Right)
    await bridgeRequest("POST", "/eval", { script: "window.__NEXUS_STORE.getState().setHomeIndex(0);" });
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

    // 4. Test Dynamic Console Environment: Switch (Red/Scarlet Glowing Waves)
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "switch" } });
    await sleep(400);
    const switchState = await bridgeRequest("GET", "/state");
    const isSwitchEnv = switchState.state?.envClassName?.includes("env-switch");
    record(
      "Dynamic Environment: Nintendo Switch (Scarlet Neon Waves)",
      isSwitchEnv,
      `Active environment class: "${switchState.state?.envClassName}"`
    );

    // 5. Test Dynamic Console Environment: Wii U (Cyan Waving Ribbons)
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "wiiu" } });
    await sleep(400);
    const wiiuState = await bridgeRequest("GET", "/state");
    const isWiiuEnv = wiiuState.state?.envClassName?.includes("env-wiiu");
    record(
      "Dynamic Environment: Nintendo Wii U (Cyan Wavy Ribbons)",
      isWiiuEnv,
      `Active environment class: "${wiiuState.state?.envClassName}"`
    );

    // 6. Test Dynamic Console Environment: PlayStation (Indigo / Slate-Blue XMB)
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "ps3" } });
    await sleep(400);
    const ps3State = await bridgeRequest("GET", "/state");
    const isPsEnv = ps3State.state?.envClassName?.includes("env-playstation");
    record(
      "Dynamic Environment: PlayStation 3 (Indigo/Slate XMB Atmosphere)",
      isPsEnv,
      `Active environment class: "${ps3State.state?.envClassName}"`
    );

    // 7. Test Dynamic Console Environment: Xbox 360 (Radiant Emerald Curves)
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "xbox360" } });
    await sleep(400);
    const xboxState = await bridgeRequest("GET", "/state");
    const isXboxEnv = xboxState.state?.envClassName?.includes("env-xbox360");
    record(
      "Dynamic Environment: Xbox 360 (Radiant Emerald Curves)",
      isXboxEnv,
      `Active environment class: "${xboxState.state?.envClassName}"`
    );

    // 8. Test 3D Cover Flow Carousel: Sizing & Elevation
    await bridgeRequest("POST", "/navigate", { screen: { kind: "platform", platformId: "steam" } });
    await sleep(400);
    const steamState = await bridgeRequest("GET", "/state");
    const hasCenterCover = steamState.state?.hasCenterCover;
    const centerTransform = steamState.state?.centerCoverTransform || "";
    const isElevatedAndScaled = centerTransform.includes("scale(1.42)") || centerTransform.includes("translateZ(170px)");
    record(
      "3D Cover Flow Carousel: Taller Stage & Uniform Scaling",
      hasCenterCover && isElevatedAndScaled,
      `Center cover transform: "${centerTransform}", Total cards: ${steamState.state?.coverflowCount}`
    );

    // 9. Test Controller Navigation in Cover Flow (D-Pad Right / Left)
    const initialGame = steamState.state?.focusedGameTitle;
    await bridgeRequest("POST", "/input", { button: "right" });
    await sleep(250);
    const scrolledSteamState = await bridgeRequest("GET", "/state");
    const gameShifted = scrolledSteamState.state?.focusedGameTitle !== initialGame;
    record(
      "Cover Flow: D-Pad Carousel Glide",
      gameShifted || scrolledSteamState.state?.coverflowCount <= 1,
      `Focused title: "${scrolledSteamState.state?.focusedGameTitle}" (Previous: "${initialGame}")`
    );

    // 10. Test Bumper Return / B Button Back
    await bridgeRequest("POST", "/eval", { script: "window.__NEXUS_STORE.getState().goHome();" });
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

    // 11. Test Wayland Screenshot Capture via Spectacle
    const screenshotPath = "/tmp/nexus_wayland_test.png";
    const shot = await bridgeRequest("POST", "/screenshot", { path: screenshotPath });
    const shotExists = fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 1000;
    record(
      "Wayland Native Screenshot Capture",
      shot.ok && shotExists,
      `Saved ${shotExists ? fs.statSync(screenshotPath).size : 0} bytes to ${screenshotPath}`
    );

  } catch (err) {
    record("Test Suite Execution", false, `Exception during test run: ${err.message}`);
  }

  return results;
}

// Tool Definitions for MCP
const TOOLS = [
  {
    name: "nexus_status",
    description: "Check connection and health status of the running Nexus Launcher Wayland app.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "nexus_get_state",
    description: "Retrieve complete live UI and store state (current screen, active platform, theme classes, 3D transforms, focused title).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "nexus_send_input",
    description: "Simulate a controller / gamepad button press (a, b, x, y, lb, rb, left, right, up, down, start, select, guide).",
    inputSchema: {
      type: "object",
      properties: {
        button: {
          type: "string",
          description: "Gamepad button identifier (e.g. 'a', 'b', 'x', 'y', 'lb', 'rb', 'left', 'right', 'up', 'down', 'start', 'select', 'guide')",
        },
      },
      required: ["button"],
    },
  },
  {
    name: "nexus_navigate",
    description: "Navigate directly to any application screen (home, platform, game, settings).",
    inputSchema: {
      type: "object",
      properties: {
        screen: {
          type: "object",
          description: "Target screen descriptor (e.g. { \"kind\": \"home\" } or { \"kind\": \"platform\", \"platformId\": \"switch\" })",
        },
      },
      required: ["screen"],
    },
  },
  {
    name: "nexus_eval_js",
    description: "Evaluate arbitrary JavaScript inside the Nexus Launcher WebKitGTK window.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "JavaScript code string to evaluate",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "nexus_capture_screenshot",
    description: "Capture a screenshot of the running Wayland application using KDE Wayland spectacle.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional destination path for the PNG screenshot (defaults to /tmp/nexus_screenshot.png)",
        },
      },
    },
  },
  {
    name: "nexus_run_all_tests",
    description: "Execute comprehensive automated feature tests covering all requirements (dynamic environments, 3D coverflow, navigation, input handling, screenshots) and return detailed pass/fail report.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// MCP Stdio JSON-RPC Handler
let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += chunk.toString("utf8");

  while (true) {
    // Standard MCP framing can be raw JSON lines or Content-Length delimited
    let lineEnd = buffer.indexOf("\n");
    if (lineEnd === -1) break;

    const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);

    if (!line) continue;

    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch (e) {
      // Ignore or log malformed JSON
    }
  }
});

function sendResponse(resp) {
  process.stdout.write(JSON.stringify(resp) + "\n");
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    sendResponse({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "nexus-wayland-tester",
          version: "0.1.0",
        },
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    // Initialized notification
    return;
  }

  if (method === "tools/list") {
    sendResponse({
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS,
      },
    });
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      let resultText = "";

      if (toolName === "nexus_status") {
        const res = await bridgeRequest("GET", "/status");
        resultText = JSON.stringify(res, null, 2);
      } else if (toolName === "nexus_get_state") {
        const res = await bridgeRequest("GET", "/state");
        resultText = JSON.stringify(res, null, 2);
      } else if (toolName === "nexus_send_input") {
        const res = await bridgeRequest("POST", "/input", { button: args.button });
        resultText = JSON.stringify(res, null, 2);
      } else if (toolName === "nexus_navigate") {
        const res = await bridgeRequest("POST", "/navigate", { screen: args.screen });
        resultText = JSON.stringify(res, null, 2);
      } else if (toolName === "nexus_eval_js") {
        const res = await bridgeRequest("POST", "/eval", { script: args.script });
        resultText = JSON.stringify(res, null, 2);
      } else if (toolName === "nexus_capture_screenshot") {
        const res = await bridgeRequest("POST", "/screenshot", { path: args.path || "/tmp/nexus_screenshot.png" });
        resultText = JSON.stringify(res, null, 2);
      } else if (toolName === "nexus_run_all_tests") {
        const results = await runAllFeatureTests();
        const total = results.length;
        const passed = results.filter((r) => r.pass).length;
        const failed = total - passed;
        const header = `=== Nexus Launcher Wayland Test Suite ===\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}\n\n`;
        const details = results
          .map((r) => `[${r.pass ? "PASS" : "FAIL"}] ${r.name}\n  └─ ${r.details}`)
          .join("\n\n");
        resultText = header + details;
      } else {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: resultText,
            },
          ],
        },
      });
    } catch (err) {
      sendResponse({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: err.message,
        },
      });
    }
    return;
  }

  // Fallback for unhandled methods
  sendResponse({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  });
}
