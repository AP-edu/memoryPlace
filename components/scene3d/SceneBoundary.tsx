"use client";
import { Component, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { supportsWebGL, webglForceOff } from "@/lib/webgl";

/**
 * Safety net for every R3F Canvas site: probe WebGL first (the common
 * failure is hardware acceleration off — the probe fails instead of THREE
 * throwing), and catch anything that still blows up at runtime.
 */

// One real probe per page load (it creates a context: walking rewrites the
// URL on every room change, so never re-probe per query string); ?webgl=off
// forces the fallback for tests.
let probed: { ok: boolean; detail: string } | null = null;
const FORCED_OFF = { ok: false, detail: "forced-off" };
const noSubscribe = () => () => {};
function probe(): { ok: boolean; detail: string } {
  if (webglForceOff(window.location.search)) return FORCED_OFF;
  return (probed ??= supportsWebGL(document, ""));
}

/**
 * WebGL support, probed once per page load in the browser. Null on the server
 * and during hydration (a pre-rendered page must not render the fallback the
 * server would pick for itself).
 */
export function useWebGLStatus(): { ok: boolean; detail: string } | null {
  return useSyncExternalStore(
    noSubscribe,
    probe,
    () => null
  );
}

export function SceneFallback({
  title = "3D couldn't start",
  backHref,
  backLabel,
}: {
  title?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="card-base w-full p-5 text-center" role="alert">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Your browser blocked the 3D view. The usual fix: use Chrome or Edge with{" "}
        <strong className="text-foreground">hardware acceleration turned on</strong> (
        <span className="whitespace-nowrap">chrome://settings → System → “Use hardware acceleration”</span>),
        then reload this page.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()} className="btn-primary">
          Reload after enabling it
        </button>
        {backHref && (
          <Link href={backHref} className="btn-outline">
            {backLabel ?? "Back"}
          </Link>
        )}
      </div>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  title?: string;
  backHref?: string;
  backLabel?: string;
}

interface BoundaryState {
  failed: boolean;
}

export class SceneErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    // Visible in devtools; the fallback UI carries the user-facing message.
    console.error("[3D scene failed]", error);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <SceneFallback title={this.props.title} backHref={this.props.backHref} backLabel={this.props.backLabel} />;
    }
    return this.props.children;
  }
}

/**
 * Gate a Canvas site behind the probe + boundary. Usage:
 *   <SceneGate title="..." backHref="..." backLabel="..."><Canvas …/></SceneGate>
 */
export function SceneGate({
  children,
  title,
  backHref,
  backLabel,
}: BoundaryProps): ReactNode {
  const status = useWebGLStatus();
  if (!status) return <div className="h-full w-full" />;
  if (!status.ok) {
    return <SceneFallback title={title} backHref={backHref} backLabel={backLabel} />;
  }
  // `isolate` keeps drei <Html> labels (z-index up to ~20) inside the canvas's
  // own stacking layer, so HUD panels, card forms and snackbars stay on top.
  return (
    <SceneErrorBoundary title={title} backHref={backHref} backLabel={backLabel}>
      <div className="isolate h-full w-full">{children}</div>
    </SceneErrorBoundary>
  );
}
