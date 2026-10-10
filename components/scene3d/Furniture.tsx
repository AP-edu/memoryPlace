"use client";
import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { FURNITURE, footprint, type FurnitureItem, type FurnitureKind } from "@/lib/furniture";
import { toScene } from "@/lib/scene3d";

// Low-poly furniture built from primitives (flat colours, like the rooms).
// Each piece is modelled in its own frame: centred on the floor at the
// origin, width along x, depth along z, front facing +z (into the room).

const noRaycast = () => null;
const mix = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

type V3 = [number, number, number];

function Mat({ color, ghost, rough = 0.75, metal = 0, glow = 0 }: { color: string; ghost?: boolean; rough?: number; metal?: number; glow?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={rough}
      metalness={metal}
      emissive={glow ? color : "#000000"}
      emissiveIntensity={glow}
      transparent={ghost}
      opacity={ghost ? 0.55 : 1}
      depthWrite={!ghost}
    />
  );
}

function Box({ p, s, c, ghost, rough, metal, glow }: { p: V3; s: V3; c: string; ghost?: boolean; rough?: number; metal?: number; glow?: number }) {
  return (
    <mesh position={p} raycast={noRaycast}>
      <boxGeometry args={s} />
      <Mat color={c} ghost={ghost} rough={rough} metal={metal} glow={glow} />
    </mesh>
  );
}

function Cyl({ p, r, h, c, rTop, ghost, glow, seg = 20 }: { p: V3; r: number; h: number; c: string; rTop?: number; ghost?: boolean; glow?: number; seg?: number }) {
  return (
    <mesh position={p} raycast={noRaycast}>
      <cylinderGeometry args={[rTop ?? r, r, h, seg]} />
      <Mat color={c} ghost={ghost} glow={glow} />
    </mesh>
  );
}

const BOOK_COLORS = ["#8c3b3b", "#2f5d8c", "#c9a227", "#3f7a4a", "#6b3f8c", "#d27a3a", "#1f3b5c"];

/** One piece of furniture in its local frame. */
export function FurniturePiece({ kind, color, ghost, roomHeight = 3 }: { kind: FurnitureKind; color: string; ghost?: boolean; roomHeight?: number }) {
  const { w, d, h } = FURNITURE[kind];
  const dark = mix(color, "#000000", 0.35);
  const light = mix(color, "#ffffff", 0.3);
  const g = ghost;
  switch (kind) {
    case "sofa":
    case "armchair": {
      const arm = kind === "sofa" ? 0.2 : 0.17;
      const seats = kind === "sofa" ? 2 : 1;
      const seatW = (w - arm * 2) / seats;
      return (
        <group>
          <Box p={[0, 0.2, 0.02]} s={[w, 0.32, d - 0.04]} c={color} ghost={g} />
          <Box p={[0, 0.55, -d / 2 + 0.11]} s={[w, 0.6, 0.22]} c={color} ghost={g} />
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * (w / 2 - arm / 2), 0.36, 0.02]} s={[arm, 0.42, d - 0.04]} c={dark} ghost={g} />
          ))}
          {Array.from({ length: seats }, (_, i) => (
            <Box key={i} p={[-w / 2 + arm + seatW * (i + 0.5), 0.42, 0.08]} s={[seatW - 0.04, 0.12, d - 0.3]} c={light} ghost={g} />
          ))}
        </group>
      );
    }
    case "table":
      return (
        <group>
          <Box p={[0, h - 0.03, 0]} s={[w, 0.06, d]} c={color} ghost={g} rough={0.55} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} p={[sx * (w / 2 - 0.08), (h - 0.06) / 2, sz * (d / 2 - 0.08)]} r={0.035} h={h - 0.06} c={dark} ghost={g} seg={10} />))}
        </group>
      );
    case "chair":
      return (
        <group>
          <Box p={[0, 0.45, 0]} s={[w, 0.05, d]} c={color} ghost={g} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} p={[sx * (w / 2 - 0.03), 0.22, sz * (d / 2 - 0.03)]} s={[0.04, 0.45, 0.04]} c={dark} ghost={g} />))}
          <Box p={[0, 0.69, -d / 2 + 0.025]} s={[w, 0.45, 0.05]} c={color} ghost={g} />
        </group>
      );
    case "desk":
      return (
        <group>
          <Box p={[0, h - 0.025, 0]} s={[w, 0.05, d]} c={color} ghost={g} rough={0.55} />
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * (w / 2 - 0.025), (h - 0.05) / 2, 0]} s={[0.05, h - 0.05, d]} c={dark} ghost={g} />
          ))}
          <Box p={[w / 2 - 0.27, h - 0.17, 0.02]} s={[0.4, 0.2, d - 0.06]} c={light} ghost={g} />
        </group>
      );
    case "bed":
      return (
        <group>
          <Box p={[0, 0.15, 0]} s={[w, 0.3, d]} c={mix(color, "#6b4a2b", 0.7)} ghost={g} />
          <Box p={[0, 0.4, 0.03]} s={[w - 0.08, 0.2, d - 0.12]} c="#f3efe6" ghost={g} />
          <Box p={[0, 0.53, d * 0.18]} s={[w - 0.04, 0.08, d * 0.62]} c={color} ghost={g} />
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * w * 0.22, 0.56, -d / 2 + 0.3]} s={[w * 0.36, 0.1, 0.32]} c="#ffffff" ghost={g} />
          ))}
          <Box p={[0, 0.55, -d / 2 + 0.04]} s={[w, 1.1, 0.08]} c={mix(color, "#6b4a2b", 0.75)} ghost={g} />
        </group>
      );
    case "bookshelf": {
      const shelves = 5;
      return (
        <group>
          <Box p={[0, h / 2, -d / 2 + 0.02]} s={[w, h, 0.04]} c={dark} ghost={g} />
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * (w / 2 - 0.02), h / 2, 0]} s={[0.04, h, d]} c={color} ghost={g} />
          ))}
          {Array.from({ length: shelves + 1 }, (_, i) => (
            <Box key={`s${i}`} p={[0, 0.02 + (i * (h - 0.04)) / shelves, 0]} s={[w, 0.04, d]} c={color} ghost={g} />
          ))}
          {Array.from({ length: shelves }, (_, row) =>
            Array.from({ length: 6 }, (_, k) => {
              const bw = (w - 0.12) / 6;
              const bh = 0.22 + ((row * 7 + k * 3) % 5) * 0.025;
              return (
                <Box
                  key={`b${row}-${k}`}
                  p={[-w / 2 + 0.06 + bw * (k + 0.5), 0.04 + (row * (h - 0.04)) / shelves + bh / 2, 0.02]}
                  s={[bw - 0.015, bh, d - 0.1]}
                  c={BOOK_COLORS[(row * 3 + k) % BOOK_COLORS.length]}
                  ghost={g}
                />
              );
            })
          )}
        </group>
      );
    }
    case "cabinet":
      return (
        <group>
          <Box p={[0, h / 2, 0]} s={[w, h, d]} c={color} ghost={g} />
          <Box p={[0, h / 2, d / 2 + 0.002]} s={[0.01, h - 0.1, 0.01]} c={dark} ghost={g} />
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 0.06, h * 0.52, d / 2 + 0.02]} raycast={noRaycast}>
              <sphereGeometry args={[0.025, 10, 10]} />
              <Mat color="#d6b25e" metal={0.6} rough={0.3} ghost={g} />
            </mesh>
          ))}
        </group>
      );
    case "piano":
      return (
        <group>
          <Box p={[0, h / 2, -d * 0.2]} s={[w, h, d * 0.6]} c={color} ghost={g} rough={0.25} />
          <Box p={[0, 0.72, d * 0.22]} s={[w, 0.08, d * 0.42]} c={color} ghost={g} rough={0.25} />
          <Box p={[0, 0.77, d * 0.24]} s={[w - 0.12, 0.025, d * 0.3]} c="#f6f3ea" ghost={g} />
          {Array.from({ length: 14 }, (_, k) => (k % 7 === 2 || k % 7 === 6 ? null : (
            <Box key={k} p={[-w / 2 + 0.12 + k * ((w - 0.24) / 14), 0.795, d * 0.2]} s={[0.035, 0.02, d * 0.18]} c="#111111" ghost={g} />
          )))}
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * (w / 2 - 0.05), 0.36, d * 0.25]} s={[0.06, 0.72, 0.06]} c={color} ghost={g} />
          ))}
        </group>
      );
    case "fireplace":
      return (
        <group>
          <Box p={[0, h / 2, 0]} s={[w, h, d]} c={color} ghost={g} />
          <Box p={[0, h * 0.32, d / 2 - 0.08]} s={[w * 0.56, h * 0.52, 0.18]} c="#1a1410" ghost={g} />
          <Box p={[0, h * 0.14, d / 2 - 0.1]} s={[w * 0.4, 0.12, 0.12]} c="#ff8a3d" ghost={g} glow={1.4} />
          <Box p={[0, h + 0.03, 0.02]} s={[w + 0.12, 0.06, d + 0.08]} c={dark} ghost={g} />
        </group>
      );
    case "tv":
      return (
        <group>
          <Box p={[0, 0.25, 0]} s={[w, 0.5, d]} c={mix(color, "#8a6a4a", 0.5)} ghost={g} />
          <Box p={[0, 0.88, -0.05]} s={[w * 0.95, 0.62, 0.05]} c={color} ghost={g} rough={0.2} />
          <Box p={[0, 0.88, -0.02]} s={[w * 0.9, 0.56, 0.01]} c="#203048" ghost={g} glow={0.25} rough={0.1} />
        </group>
      );
    case "lamp":
      return (
        <group>
          <Cyl p={[0, 0.02, 0]} r={0.16} h={0.04} c={dark} ghost={g} />
          <Cyl p={[0, 0.74, 0]} r={0.018} h={1.4} c={dark} ghost={g} seg={8} />
          <Cyl p={[0, 1.45, 0]} r={0.2} rTop={0.12} h={0.3} c={color} ghost={g} glow={0.8} />
        </group>
      );
    case "plant":
      return (
        <group>
          <Cyl p={[0, 0.17, 0]} r={0.15} rTop={0.2} h={0.34} c="#b8643e" ghost={g} />
          {[
            [0, 0.62, 0, 0.26],
            [0.1, 0.86, 0.06, 0.22],
            [-0.09, 0.95, -0.05, 0.2],
            [0.02, 1.08, 0.02, 0.15],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} raycast={noRaycast}>
              <icosahedronGeometry args={[r, 0]} />
              <Mat color={i % 2 ? mix(color, "#ffffff", 0.12) : color} ghost={g} />
            </mesh>
          ))}
        </group>
      );
    case "rug":
      return (
        <group>
          <Box p={[0, 0.008, 0]} s={[w, 0.012, d]} c={color} ghost={g} rough={0.95} />
          <Box p={[0, 0.015, 0]} s={[w - 0.24, 0.004, d - 0.24]} c={light} ghost={g} rough={0.95} />
          <Box p={[0, 0.017, 0]} s={[w - 0.5, 0.004, d - 0.5]} c={color} ghost={g} rough={0.95} />
        </group>
      );
    case "column": {
      const ch = Math.max(1, roomHeight);
      return (
        <group>
          <Box p={[0, 0.06, 0]} s={[w, 0.12, d]} c={dark} ghost={g} />
          <Cyl p={[0, 0.12 + (ch - 0.3) / 2, 0]} r={w * 0.36} rTop={w * 0.32} h={ch - 0.3} c={color} ghost={g} seg={16} />
          <Box p={[0, ch - 0.09, 0]} s={[w, 0.18, d]} c={light} ghost={g} />
        </group>
      );
    }
    case "statue":
      return (
        <group>
          <Box p={[0, 0.45, 0]} s={[w, 0.9, d]} c={dark} ghost={g} />
          <mesh position={[0, 1.33, 0]} raycast={noRaycast}>
            <capsuleGeometry args={[0.15, 0.5, 6, 12]} />
            <Mat color={color} ghost={g} rough={0.5} />
          </mesh>
          <mesh position={[0, 1.83, 0]} raycast={noRaycast}>
            <sphereGeometry args={[0.12, 14, 14]} />
            <Mat color={color} ghost={g} rough={0.5} />
          </mesh>
        </group>
      );
    case "fountain":
      return (
        <group>
          <Cyl p={[0, 0.2, 0]} r={w / 2} h={0.4} c={color} ghost={g} seg={28} />
          <Cyl p={[0, 0.39, 0]} r={w / 2 - 0.08} h={0.03} c="#4f9fd8" ghost={g} glow={0.25} seg={28} />
          <Cyl p={[0, 0.58, 0]} r={0.07} h={0.4} c={light} ghost={g} seg={12} />
          <Cyl p={[0, 0.8, 0]} r={0.28} rTop={0.3} h={0.08} c={light} ghost={g} seg={20} />
          <Cyl p={[0, 0.85, 0]} r={0.24} h={0.02} c="#6db4e6" ghost={g} glow={0.3} seg={20} />
        </group>
      );
  }
}

/** Gold outline on the floor around a selected piece. */
function SelectionRing({ w, d, color }: { w: number; d: number; color: string }) {
  const t = 0.05;
  const parts: Array<[V3, V3]> = [
    [[0, 0.02, -d / 2 - t], [w + 3 * t, 0.02, t]],
    [[0, 0.02, d / 2 + t], [w + 3 * t, 0.02, t]],
    [[-w / 2 - t, 0.02, 0], [t, 0.02, d + t]],
    [[w / 2 + t, 0.02, 0], [t, 0.02, d + t]],
  ];
  return (
    <>
      {parts.map(([p, s], i) => (
        <mesh key={i} position={p} raycast={noRaycast}>
          <boxGeometry args={s} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </>
  );
}

/**
 * A room's furniture, in room-local coordinates (place inside the room's
 * group). Each piece gets an invisible footprint hit box for clicks/drags.
 */
export function RoomFurniture({
  items,
  roomHeight,
  selectedId,
  draggingId,
  ghost = false,
  highlight = "#e0a100",
  onItemDown,
  onItemClick,
}: {
  items: FurnitureItem[];
  roomHeight: number;
  selectedId?: string | null;
  draggingId?: string | null;
  ghost?: boolean;
  highlight?: string;
  onItemDown?: (item: FurnitureItem, e: ThreeEvent<PointerEvent>) => void;
  onItemClick?: (item: FurnitureItem, e: ThreeEvent<MouseEvent>) => void;
}) {
  const interactive = !!(onItemDown || onItemClick);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), []);
  return (
    <group>
      {items.map((item) => {
        const fp = footprint(item);
        const spec = FURNITURE[item.kind];
        const hitH = Math.max(0.1, item.kind === "column" ? roomHeight : spec.h);
        return (
          <group key={item.id} position={toScene({ x: item.x, y: 0, z: item.z })}>
            <group rotation={[0, (-item.rot * Math.PI) / 180, 0]}>
              <FurniturePiece kind={item.kind} color={item.color ?? spec.color} ghost={ghost} roomHeight={roomHeight} />
            </group>
            {item.id === selectedId && !ghost && <SelectionRing w={fp.w} d={fp.d} color={highlight} />}
            {interactive && (
              <mesh
                position={[0, hitH / 2, 0]}
                material={hit}
                // Restore explicitly: R3F ignores `undefined` props (see LocusMarkers).
                raycast={draggingId === item.id ? noRaycast : THREE.Mesh.prototype.raycast}
                onPointerDown={onItemDown ? (e) => onItemDown(item, e) : undefined}
                onClick={onItemClick ? (e) => onItemClick(item, e) : undefined}
                onPointerOver={() => (document.body.style.cursor = "grab")}
                onPointerOut={() => (document.body.style.cursor = "")}
              >
                <boxGeometry args={[fp.w, hitH, fp.d]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
