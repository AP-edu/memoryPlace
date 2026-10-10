"use client";
import { useId, useMemo } from "react";
import { demoPlan, walkRoute } from "@/lib/demoPalace";

/**
 * Landing-page hero: the demo palace as a top-down blueprint, with a gold
 * walker tracing the study route locus by locus through the doors.
 */
export default function DemoBlueprint({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const plan = useMemo(() => demoPlan(), []);
  const route = useMemo(() => walkRoute(plan), [plan]);
  const d = route.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      className={className}
      role="img"
      aria-label="A three-room memory palace seen from above, with numbered loci on the walls and a walker following the study route"
    >
      {plan.rooms.map((r) => (
        <g key={r.id}>
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            strokeWidth={0.12}
            className="fill-card stroke-foreground/70"
            style={r.color ? { fill: r.color, fillOpacity: 0.18 } : undefined}
          />
          <text x={r.x + r.w / 2} y={r.y + r.h / 2} textAnchor="middle" fontSize={0.62} className="fill-muted-foreground font-display">
            {r.number}. {r.title}
          </text>
        </g>
      ))}
      {plan.furniture.map((f, i) => (
        <rect key={`f${i}`} x={f.x} y={f.y} width={f.w} height={f.h} rx={0.1} className="fill-foreground/15" />
      ))}
      {plan.openings.map((o, i) => (
        <line key={i} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} strokeWidth={0.3} className="stroke-accent" />
      ))}
      <path id={`route-${id}`} d={d} fill="none" strokeWidth={0.07} strokeDasharray="0.25 0.18" className="stroke-primary/50" />
      {plan.loci.map((l) => (
        <g key={`${l.roomId}-${l.n}`}>
          <circle cx={l.x} cy={l.y} r={0.36} className="fill-primary" />
          <text x={l.x} y={l.y + 0.15} textAnchor="middle" fontSize={0.42} fontWeight={700} className="fill-primary-foreground">
            {l.n}
          </text>
        </g>
      ))}
      <g className="motion-reduce:hidden">
        <circle r={0.32} className="fill-accent stroke-card" strokeWidth={0.1}>
          <animateMotion dur="16s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href={`#route-${id}`} />
          </animateMotion>
        </circle>
      </g>
    </svg>
  );
}
