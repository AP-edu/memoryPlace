"use client";
import { useMemo } from "react";
import { ContactShadows } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { toScene } from "@/lib/scene3d";

/** WebGL2 only: older/blocked contexts keep the plain (still lit) scene. */
function useWebGL2(): boolean {
  return useMemo(() => {
    if (typeof document === "undefined") return false;
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }, []);
}

/**
 * Post effects for the walk: a soft glow on emissive things (plaques, lamp
 * shades, the fireplace, fountain water) and a faint vignette. The composer
 * takes over tone mapping, so ACES is re-applied last to keep the palette's
 * colours as designed.
 */
export function SceneFX({ lite = false }: { lite?: boolean }) {
  const ok = useWebGL2();
  if (!ok) return null;
  return (
    // Touch devices skip multisampling (the costliest part at phone pixel densities).
    <EffectComposer multisampling={lite ? 0 : 4}>
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.82} luminanceSmoothing={0.18} />
      <Vignette offset={0.32} darkness={0.32} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

/** Soft contact shadows on a room's floor, baked once (furniture is static while walking). */
export function FloorShadows({ width, depth }: { width: number; depth: number }) {
  return (
    <ContactShadows
      position={toScene({ x: width / 2, y: 0.004, z: depth / 2 })}
      scale={[width, depth]}
      resolution={512}
      far={1.8}
      blur={2.6}
      opacity={0.5}
      frames={1}
    />
  );
}
