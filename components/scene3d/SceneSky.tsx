"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { starField } from "@/lib/sky";
import type { SceneColors } from "./useSceneColors";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 topColor;
uniform vec3 bottomColor;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 1.35 + 0.12, 0.0, 1.0);
  gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.65)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Stars keep a fixed on-screen size (CSS px x device pixel ratio) wherever they
// are on the dome and however big the dome is. drei's <Stars> shrinks points
// with distance in raw framebuffer pixels, which left the zenith near-empty in
// walk mode and the whole sky empty in the 400 m editor/palace domes.
const STAR_VERT = /* glsl */ `
uniform float dpr;
attribute float size;
attribute float brightness;
attribute float phase;
varying float vBrightness;
varying float vPhase;
void main() {
  vBrightness = brightness;
  vPhase = phase;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * dpr;
}`;

const STAR_FRAG = /* glsl */ `
uniform float time;
varying float vBrightness;
varying float vPhase;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float disc = 1.0 - smoothstep(0.3, 1.0, d);
  float twinkle = 0.8 + 0.2 * sin(time * (0.8 + fract(vPhase)) + vPhase);
  gl_FragColor = vec4(1.0, 0.97, 0.9, disc * vBrightness * twinkle);
}`;

const STAR_COUNT = 1500;

function StarPoints({ radius }: { radius: number }) {
  const field = useMemo(() => starField(STAR_COUNT, radius), [radius]);
  const uniforms = useMemo(() => ({ dpr: { value: 1 }, time: { value: 0 } }), []);
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock, viewport }) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.dpr.value = viewport.dpr;
    m.uniforms.time.value = clock.elapsedTime;
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[field.positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[field.sizes, 1]} />
        <bufferAttribute attach="attributes-brightness" args={[field.brightness, 1]} />
        <bufferAttribute attach="attributes-phase" args={[field.phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={STAR_VERT}
        fragmentShader={STAR_FRAG}
      />
    </points>
  );
}

/**
 * Greek sky: a camera-following gradient dome (zenith -> horizon) with a sun
 * by day, and a moon + star field by night. Pure scene dressing: no geometry
 * or layout logic lives here. `radius` must stay inside the camera far plane.
 */
export function SceneSky({ colors, radius = 400 }: { colors: SceneColors; radius?: number }) {
  const group = useRef<THREE.Group>(null);
  const uniforms = useMemo(
    () => ({ topColor: { value: new THREE.Color() }, bottomColor: { value: new THREE.Color() } }),
    []
  );

  useFrame(({ camera }) => {
    group.current?.position.copy(camera.position);
    uniforms.topColor.value.set(colors.sky);
    uniforms.bottomColor.value.set(colors.horizon);
  });

  return (
    <group ref={group}>
      <mesh renderOrder={-10}>
        <sphereGeometry args={[radius, 32, 20]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          uniforms={uniforms}
          vertexShader={VERT}
          fragmentShader={FRAG}
        />
      </mesh>
      {colors.night && <StarPoints radius={radius * 0.8} />}
      {/* Sun by day, moon by night: one disc in the same spot. */}
      <mesh position={[radius * 0.45, radius * 0.5, -radius * 0.65]} renderOrder={-9}>
        <sphereGeometry args={[radius * (colors.night ? 0.035 : 0.05), 20, 14]} />
        <meshBasicMaterial color={colors.night ? "#f6efd2" : "#fff6d6"} fog={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
