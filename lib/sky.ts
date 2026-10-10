// Night-sky star field (pure data, no three.js). Seeded, so every visit shows
// the same sky; rendered by components/scene3d/SceneSky.tsx.

export interface StarField {
  /** xyz per star on a sphere of `radius` (scene y-up), around the camera. */
  positions: Float32Array;
  /** On-screen diameter in CSS pixels (the shader multiplies by device pixel ratio). */
  sizes: Float32Array;
  /** Peak opacity, 0..1. */
  brightness: Float32Array;
  /** Twinkle phase in radians. */
  phases: Float32Array;
}

/** mulberry32: a tiny seeded PRNG, plenty for scattering stars. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` stars spread evenly over the sky above `minY` (sine of the lowest
 * elevation; slightly negative so the field meets the horizon haze). Uniform
 * in y is uniform per solid angle, so the zenith is as starry as the horizon.
 * Magnitudes follow a rough power law: most stars small and faint, a few bright.
 */
export function starField(count: number, radius: number, seed = 1, minY = -0.05): StarField {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const y = minY + (1 - minY) * rand();
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = rand() * Math.PI * 2;
    positions[i * 3] = ring * Math.cos(theta) * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = ring * Math.sin(theta) * radius;
    const magnitude = rand() ** 3; // 0 = faintest, 1 = brightest
    sizes[i] = 1.5 + 2.5 * magnitude;
    brightness[i] = 0.35 + 0.65 * magnitude;
    phases[i] = rand() * Math.PI * 2;
  }
  return { positions, sizes, brightness, phases };
}
