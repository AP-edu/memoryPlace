// Arrival chime pitches (pure). Loci climb a major pentatonic scale in study
// order, so the route has a melody: locus 1 is always the same note, and the
// order you walk is something you can hear.

const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_HZ = 523.25; // C5

/** Frequency for the n-th locus (0-based) in study order; two octaves, then it wraps. */
export function chimeFrequency(index: number): number {
  const i = Math.max(0, Math.floor(index)) % (PENTATONIC.length * 2);
  const semitones = PENTATONIC[i % PENTATONIC.length] + 12 * Math.floor(i / PENTATONIC.length);
  return BASE_HZ * 2 ** (semitones / 12);
}

export const SOUND_KEY = "mp-sound";

const SOUND_EVENT = "mp-sound-change";

/** Arrival chimes are on unless the user muted them (persisted). */
export function readSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // storage blocked: the toggle still works for this page via the event
  }
  window.dispatchEvent(new Event(SOUND_EVENT));
}

export function subscribeSound(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === SOUND_KEY && cb();
  window.addEventListener(SOUND_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SOUND_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
