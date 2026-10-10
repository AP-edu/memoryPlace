"use client";
import { chimeFrequency } from "@/lib/sound";

let ctx: AudioContext | null = null;

/** A short, soft bell for arriving at locus `index` (study order). Silently no-ops without Web Audio. */
export function playChime(index: number, volume = 0.07) {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  try {
    ctx ??= new window.AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const f = chimeFrequency(index);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    gain.connect(ctx.destination);
    // Fundamental + a quiet octave partial: bell-ish, not a beep.
    for (const [mult, level, type] of [
      [1, 1, "sine"],
      [2, 0.25, "triangle"],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f * mult;
      g.gain.value = level;
      o.connect(g).connect(gain);
      o.start(now);
      o.stop(now + 1.5);
    }
  } catch {
    // audio is a nicety; never break the walk over it
  }
}
