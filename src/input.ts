// Controller + keyboard input bus with stacked modal/screen priority.
//
// Only the topmost subscriber in the stack receives input events. Subscribers return `true`
// when they handled the event (which plays the appropriate UI sound), or `false` to let
// global bindings handle it.

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PadButton, PadEvent } from "./api";
import { sfx } from "./sound";
import { useStore } from "./store";

export type PadHandler = (button: PadButton, repeat: boolean) => boolean | void;

interface Sub {
  id: number;
  priority: number;
  handler: PadHandler;
}

let nextId = 1;
const subs: Sub[] = [];
let initialized = false;
const padListeners = new Set<(info: { connected: boolean; name: string }) => void>();
let lastPad: { connected: boolean; name: string } = { connected: false, name: "" };
let lastInputType: "controller" | "mouse" | "keyboard" = "keyboard";
let lastMousePos: { x: number; y: number } | null = null;
let idleCursorTimer: number | null = null;

function clearIdleCursorTimer() {
  if (idleCursorTimer !== null) {
    window.clearTimeout(idleCursorTimer);
    idleCursorTimer = null;
  }
}

function scheduleIdleCursorHide() {
  clearIdleCursorTimer();
  if (!lastPad.connected || lastInputType !== "mouse") return;
  idleCursorTimer = window.setTimeout(() => {
    idleCursorTimer = null;
    if (lastPad.connected) {
      lastInputType = "controller";
      updateCursorVisibility();
    }
  }, 2500);
}

function updateCursorVisibility() {
  const isControllerActive = lastPad.connected && lastInputType === "controller";
  if (isControllerActive) {
    clearIdleCursorTimer();
    document.documentElement.classList.add("controller-mode");
  } else {
    document.documentElement.classList.remove("controller-mode");
  }
}

export function onPadStatus(cb: (info: { connected: boolean; name: string }) => void): () => void {
  padListeners.add(cb);
  cb(lastPad);
  return () => {
    padListeners.delete(cb);
  };
}

function dispatch(button: PadButton, repeat: boolean) {
  const ordered = [...subs].sort((a, b) => b.priority - a.priority || b.id - a.id);
  for (const s of ordered) {
    const handled = s.handler(button, repeat);
    if (handled !== false) {
      if (button === "up" || button === "down" || button === "left" || button === "right") {
        sfx.move();
      } else if (button === "lb" || button === "rb") {
        sfx.page();
      } else if (button === "a") {
        sfx.select();
      } else if (button === "b") {
        sfx.back();
      }
      return;
    }
  }
}

const KEY_MAP: Record<string, PadButton> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "a",
  " ": "a",
  Escape: "b",
  Backspace: "b",
  x: "x",
  X: "x",
  y: "y",
  Y: "y",
  q: "lb",
  Q: "lb",
  PageUp: "lb",
  e: "rb",
  E: "rb",
  PageDown: "rb",
  "[": "lt",
  "]": "rt",
  Tab: "select",
  F1: "start",
  F2: "rs",
  Home: "guide",
};

interface HoldState {
  button: "x" | "b";
  startedAt: number;
  duration: number;
  rafId: number;
  completed: boolean;
}

let activeHold: HoldState | null = null;

function cancelHold(shouldTapFallback: boolean) {
  if (!activeHold) return;
  const { button, startedAt, rafId, completed } = activeHold;
  cancelAnimationFrame(rafId);
  activeHold = null;
  const store = useStore.getState();
  if (button === "x") store.setHoldXProgress(0);
  if (button === "b") store.setHoldBProgress(0);

  if (shouldTapFallback && !completed && performance.now() - startedAt < 350) {
    dispatch(button, false);
  }
}

function handlePressWithArbitration(button: PadButton, repeat: boolean) {
  const store = useStore.getState();
  const running = store.running;
  const status = running?.status || (running ? "RUNNING" : "IDLE");

  // R3 toggles the Quick Session Overlay Modal from any screen when a session is active
  if (button === "rs" && !repeat && running) {
    store.setSessionOverlayOpen(!store.sessionOverlayOpen);
    sfx.select();
    return;
  }

  // Hold X (800ms) terminates a RUNNING session without colliding with single-tap X
  if (button === "x" && status === "RUNNING") {
    if (repeat || activeHold?.button === "x") return;
    cancelHold(false);
    const startedAt = performance.now();
    const duration = 800;
    const tick = () => {
      if (!activeHold || activeHold.button !== "x") return;
      const elapsed = performance.now() - startedAt;
      const pct = Math.min(100, (elapsed / duration) * 100);
      useStore.getState().setHoldXProgress(pct);
      if (pct >= 100) {
        activeHold.completed = true;
        cancelHold(false);
        useStore.getState().setSessionOverlayOpen(false);
        useStore.getState().stopRunning();
        return;
      }
      activeHold.rafId = requestAnimationFrame(tick);
    };
    activeHold = {
      button: "x",
      startedAt,
      duration,
      rafId: requestAnimationFrame(tick),
      completed: false,
    };
    return;
  }

  // Hold B (600ms) cancels a STARTING launch without colliding with single-tap B
  if (button === "b" && status === "STARTING") {
    if (repeat || activeHold?.button === "b") return;
    cancelHold(false);
    const startedAt = performance.now();
    const duration = 600;
    const tick = () => {
      if (!activeHold || activeHold.button !== "b") return;
      const elapsed = performance.now() - startedAt;
      const pct = Math.min(100, (elapsed / duration) * 100);
      useStore.getState().setHoldBProgress(pct);
      if (pct >= 100) {
        activeHold.completed = true;
        cancelHold(false);
        useStore.getState().stopRunning();
        return;
      }
      activeHold.rafId = requestAnimationFrame(tick);
    };
    activeHold = {
      button: "b",
      startedAt,
      duration,
      rafId: requestAnimationFrame(tick),
      completed: false,
    };
    return;
  }

  dispatch(button, repeat);
}

function handleReleaseWithArbitration(button: PadButton) {
  if (activeHold && activeHold.button === button) {
    cancelHold(true);
  }
}

export function initInputBus() {
  (window as any).__HENOSIS_DISPATCH_PAD = dispatch;
  (window as any).__NEXUS_DISPATCH_PAD = dispatch;
  if (initialized) return;
  initialized = true;

  invoke<{ connected: boolean; name: string }>("get_pad_status")
    .then((info) => {
      if (info && info.connected) {
        lastPad = info;
        lastInputType = "controller";
        updateCursorVisibility();
        padListeners.forEach((cb) => cb(lastPad));
      }
    })
    .catch(() => {});

  listen<PadEvent>("pad", (ev) => {
    lastPad.connected = true;
    lastInputType = "controller";
    updateCursorVisibility();
    handlePressWithArbitration(ev.payload.button, ev.payload.repeat);
  }).catch(() => {});

  listen<{ button: PadButton }>("pad-release", (ev) => {
    handleReleaseWithArbitration(ev.payload.button);
  }).catch(() => {});

  listen<{ connected: boolean; name: string }>("pad-connection", (ev) => {
    lastPad = ev.payload;
    if (lastPad.connected) {
      lastInputType = "controller";
    }
    updateCursorVisibility();
    padListeners.forEach((cb) => cb(lastPad));
  }).catch(() => {});

  listen("launcher-shown", () => {
    lastMousePos = null;
    if (lastPad.connected) {
      lastInputType = "controller";
      updateCursorVisibility();
    }
  }).catch(() => {});

  window.addEventListener(
    "pointermove",
    (e) => {
      if (lastMousePos === null) {
        lastMousePos = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      if (dx * dx + dy * dy <= 36) return;
      lastMousePos = { x: e.clientX, y: e.clientY };
      if (lastInputType !== "mouse") {
        lastInputType = "mouse";
        updateCursorVisibility();
      }
      scheduleIdleCursorHide();
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerdown",
    (e) => {
      lastMousePos = { x: e.clientX, y: e.clientY };
      if (lastInputType !== "mouse") {
        lastInputType = "mouse";
        updateCursorVisibility();
      }
      scheduleIdleCursorHide();
    },
    { passive: true }
  );

  window.addEventListener("keydown", (e) => {
    if (!lastPad.connected && lastInputType !== "keyboard") {
      lastInputType = "keyboard";
      updateCursorVisibility();
    }
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") {
        (e.target as HTMLElement).blur();
      }
      return;
    }
    const mapped = KEY_MAP[e.key];
    if (mapped) {
      e.preventDefault();
      handlePressWithArbitration(mapped, e.repeat);
    }
  });

  window.addEventListener("keyup", (e) => {
    const mapped = KEY_MAP[e.key];
    if (mapped) {
      handleReleaseWithArbitration(mapped);
    }
  });
}

/** Subscribe to controller/keyboard events. Higher `priority` wins (0 = screen, 10 = modal, 20 = top overlay). */
export function usePad(handler: PadHandler, priority = 0, active = true) {
  const ref = useRef<PadHandler>(handler);
  ref.current = handler;

  useEffect(() => {
    if (!active) return;
    const id = nextId++;
    const sub: Sub = {
      id,
      priority,
      handler: (b, r) => ref.current(b, r),
    };
    subs.push(sub);
    return () => {
      const idx = subs.findIndex((s) => s.id === id);
      if (idx !== -1) subs.splice(idx, 1);
    };
  }, [priority, active]);
}
