import type { Blueprint } from "@/lib/blueprint";

/**
 * Static top-down thumbnail of a palace level (north up): rooms in their
 * theme colours, doors, and loci. Pure SVG, no interaction.
 */
export default function PlanThumb({ plan, className = "" }: { plan: Blueprint; className?: string }) {
  const stroke = Math.max(0.08, Math.max(plan.width, plan.height) / 160);
  const dot = Math.max(0.22, Math.max(plan.width, plan.height) / 70);
  return (
    <svg viewBox={`0 0 ${plan.width} ${plan.height}`} preserveAspectRatio="xMidYMid meet" className={className} aria-hidden>
      {plan.rooms.map((r) => (
        <rect
          key={r.id}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          strokeWidth={stroke}
          className="fill-card stroke-foreground/40"
          style={r.color ? { fill: r.color, fillOpacity: 0.28 } : undefined}
        />
      ))}
      {plan.furniture.map((f, i) => (
        <rect key={`f${i}`} x={f.x} y={f.y} width={f.w} height={f.h} rx={0.08} className="fill-foreground/20" />
      ))}
      {plan.openings.map((o, i) => (
        <line key={i} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} strokeWidth={stroke * 2.4} className="stroke-accent" />
      ))}
      {plan.loci.map((l) => (
        <circle key={`${l.roomId}-${l.n}`} cx={l.x} cy={l.y} r={dot} className="fill-primary" />
      ))}
    </svg>
  );
}
