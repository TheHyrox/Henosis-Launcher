// Procedural WebAudio UI sound effects (no external audio assets required).

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundsEnabled(v: boolean) {
  enabled = v;
}

function getCtx(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.045, slideTo?: number) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export const sfx = {
  move: () => tone(520, 0.038, "triangle", 0.032, 610),
  page: () => tone(420, 0.055, "sine", 0.04, 680),
  select: () => {
    tone(560, 0.07, "triangle", 0.05, 840);
  },
  back: () => tone(480, 0.07, "sine", 0.04, 300),
  launch: () => {
    tone(440, 0.14, "triangle", 0.06, 880);
    setTimeout(() => tone(880, 0.18, "sine", 0.055, 1175), 75);
  },
  error: () => {
    tone(220, 0.12, "sawtooth", 0.045, 165);
  },
};
