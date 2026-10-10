"use client";
import { useRef, useState } from "react";
import { pickMapTarget, playerToPlan, tappableDoors, viewWedge, type Blueprint } from "@/lib/blueprint";

export interface MiniMapPose {
  /** Room-local metres (x east, z north) in the CURRENT room. */
  x: number;
  z: number;
  yaw: number;
}

/**
 * Whole-level top-down minimap (north up). Pure SVG: no extra WebGL context, so
 * it is cheap on phones. Shows every room on the level, linked doors, loci
 * numbered in study order, and (in walk mode) a live you-are-here wedge.
 *
 * Tapping a locus in the current room jumps to it; tapping a locus or door
 * elsewhere opens that room. Targets are drawn larger than their dots so they
 * stay tappable at small sizes.
 */
export default function MiniMap({
  plan,
  currentRoomId,
  pose = null,
  activeLocusN = null,
  roomTitles = {},
  onGoLocus,
  onGoRoom,
  className = "",
}: {
  plan: Blueprint;
  currentRoomId: string;
  pose?: MiniMapPose | null;
  /** 1-based study-order number of the highlighted locus in the current room. */
  activeLocusN?: number | null;
  roomTitles?: Record<string, string>;
  onGoLocus?: (n: number) => void;
  onGoRoom?: (roomId: string) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const current = plan.rooms.find((r) => r.id === currentRoomId);
  const me = current && pose ? playerToPlan(current, pose) : null;
  const wedge = me && pose ? viewWedge(me.x, me.y, pose.yaw) : null;

  // ~20 px tap radius whatever the plan size / rendered size.
  const px = expanded ? 260 : 150;
  const hit = Math.max(1, (Math.max(plan.width, plan.height) / px) * 20);
  const stroke = Math.max(0.12, plan.width / 260);

  // Tap circles overlap (a locus hung beside a door), so whichever circle gets
  // the click, act on the target nearest the tap point.
  const tap = (e: React.MouseEvent, fallback: () => void) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return fallback();
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const t = pickMapTarget(plan, currentRoomId, pt, hit, { loci: !!onGoLocus, rooms: !!onGoRoom });
    if (!t) return fallback();
    if (t.kind === "locus") onGoLocus?.(t.n);
    else onGoRoom?.(t.roomId);
  };

  return (
    <div
      className={`rounded-xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur ${className}`}
      // The canvas behind uses pointer drags to look around; keep map taps out of it.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Map</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "Shrink map" : "Enlarge map"}
          aria-pressed={expanded}
        >
          {expanded ? "−" : "+"}
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        style={{ width: px, maxWidth: "70vw", height: "auto" }}
        role="group"
        aria-label="Level map, north at top"
      >
        {plan.rooms.map((r) => {
          const isCurrent = r.id === currentRoomId;
          return (
            <g key={r.id}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                strokeWidth={stroke * (isCurrent ? 2 : 1)}
                className={isCurrent ? "fill-primary/20 stroke-primary" : "fill-muted stroke-border"}
                // Rooms keep their theme colour on the map, as in 3D and on the palace cards.
                style={{
                  ...(r.color ? { fill: r.color, fillOpacity: isCurrent ? 0.35 : 0.22 } : {}),
                  ...(!isCurrent && onGoRoom ? { cursor: "pointer" } : {}),
                }}
                onClick={!isCurrent && onGoRoom ? () => onGoRoom(r.id) : undefined}
              >
                <title>{roomTitles[r.id] ?? r.title}</title>
              </rect>
              {expanded && (
                <text
                  x={r.x + r.w / 2}
                  y={r.y + r.h / 2}
                  fontSize={Math.min(1.4, r.w / 7)}
                  textAnchor="middle"
                  className="pointer-events-none fill-muted-foreground"
                >
                  {r.number}
                </text>
              )}
            </g>
          );
        })}

        {plan.furniture.map((f, i) => (
          <rect key={`f${i}`} x={f.x} y={f.y} width={f.w} height={f.h} rx={0.08} className="pointer-events-none fill-foreground/20" />
        ))}
        {plan.openings.map((o, i) => (
          <line
            key={i}
            x1={o.x1}
            y1={o.y1}
            x2={o.x2}
            y2={o.y2}
            strokeWidth={stroke * 3}
            strokeDasharray={o.kind === "archway" ? `${stroke * 3} ${stroke * 2}` : undefined}
            className="pointer-events-none stroke-accent"
          />
        ))}
        {onGoRoom &&
          tappableDoors(plan.openings, currentRoomId).map((o, i) => (
            <circle
              key={`tap-${i}`}
              cx={(o.x1 + o.x2) / 2}
              cy={(o.y1 + o.y2) / 2}
              r={hit}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={(e) => tap(e, () => onGoRoom(o.targetRoomId as string))}
            >
              <title>{`Go to ${roomTitles[o.targetRoomId as string] ?? "next room"}`}</title>
            </circle>
          ))}

        {plan.loci.map((l) => {
          const inCurrent = l.roomId === currentRoomId;
          const active = inCurrent && l.n === activeLocusN;
          const r = inCurrent ? Math.max(0.45, plan.width / 90) : Math.max(0.3, plan.width / 140);
          const go = inCurrent ? (onGoLocus ? () => onGoLocus(l.n) : undefined) : onGoRoom ? () => onGoRoom(l.roomId) : undefined;
          return (
            <g key={`${l.roomId}-${l.n}`}>
              {active && <circle cx={l.x} cy={l.y} r={r * 2} className="fill-accent/40" />}
              <circle cx={l.x} cy={l.y} r={r} className={inCurrent ? "fill-primary" : "fill-primary/50"} />
              {inCurrent && expanded && (
                <text x={l.x} y={l.y + r * 0.45} fontSize={r * 1.3} textAnchor="middle" className="pointer-events-none fill-primary-foreground">
                  {l.n}
                </text>
              )}
              {go && (
                <circle cx={l.x} cy={l.y} r={hit} fill="transparent" style={{ cursor: "pointer" }} onClick={(e) => tap(e, go)}>
                  <title>{inCurrent ? `Go to locus ${l.n}` : "Open this room"}</title>
                </circle>
              )}
            </g>
          );
        })}

        {me && wedge && (
          <g className="pointer-events-none">
            <polygon points={wedge.map((p) => p.join(",")).join(" ")} className="fill-accent/45 stroke-accent" strokeWidth={stroke} />
            <circle cx={me.x} cy={me.y} r={Math.max(0.5, plan.width / 80)} className="fill-accent stroke-card" strokeWidth={stroke * 1.5} />
          </g>
        )}
      </svg>
    </div>
  );
}
