// Controller + keyboard input bus with stacked modal/screen priority.
//
// Only the topmost subscriber in the stack receives input events. Subscribers return `true`
// when they handled the event (which plays the appropriate UI sound), or `false` to let
// global bindings handle it.

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { PadButton, PadEvent } from "./api";
import { sfx } from "./sound";

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

function updateCursorVisibility() {
  const isControllerActive = lastPad.connected && lastInputType === "controller";
  if (isControllerActive) {
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
  Home: "guide",
};

export function initInputBus() {
  (window as any).__HENOSIS_DISPATCH_PAD = dispatch;
  (window as any).__NEXUS_DISPATCH_PAD = dispatch;
  if (initialized) return;
  initialized = true;

  listen<PadEvent>("pad", (ev) => {
    lastInputType = "controller";
    updateCursorVisibility();
    dispatch(ev.payload.button, ev.payload.repeat);
  }).catch(() => {});

  listen<{ connected: boolean; name: string }>("pad-connection", (ev) => {
    lastPad = ev.payload;
    if (lastPad.connected) {
      lastInputType = "controller";
    }
    updateCursorVisibility();
    padListeners.forEach((cb) => cb(lastPad));
  }).catch(() => {});

  window.addEventListener(
    "pointermove",
    (e) => {
      // Ignore simulated or zero-movement events
      if (e.movementX === 0 && e.movementY === 0) return;
      if (lastInputType !== "mouse") {
        lastInputType = "mouse";
        updateCursorVisibility();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerdown",
    () => {
      if (lastInputType !== "mouse") {
        lastInputType = "mouse";
        updateCursorVisibility();
      }
    },
    { passive: true }
  );

  window.addEventListener("keydown", (e) => {
    if (lastInputType !== "keyboard") {
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
      dispatch(mapped, e.repeat);
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
