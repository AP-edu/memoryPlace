"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
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
      {colors.night && (
        <Stars radius={radius * 0.7} depth={radius * 0.2} count={1800} factor={4} saturation={0} fade speed={0.4} />
      )}
      {/* Sun by day, moon by night: one disc in the same spot. */}
      <mesh position={[radius * 0.45, radius * 0.5, -radius * 0.65]} renderOrder={-9}>
        <sphereGeometry args={[radius * (colors.night ? 0.035 : 0.05), 20, 14]} />
        <meshBasicMaterial color={colors.night ? "#f6efd2" : "#fff6d6"} fog={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
