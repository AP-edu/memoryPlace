"use client";

// Last-resort boundary: replaces the root layout, so it brings its own <html>,
// <body> and inline styles (global CSS and the theme class don't reach here).
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>MemoryPlace — something went wrong</title>
        <style>{`
          body{margin:0;font-family:system-ui,sans-serif;background:#f3f8fd;color:#0b1b33;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px}
          @media (prefers-color-scheme:dark){body{background:#060b1f;color:#eef3ff}}
          button{margin-top:16px;padding:10px 18px;border-radius:12px;border:0;background:#1d5fc4;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
          p{opacity:.75;max-width:28rem;margin:8px auto 0}
        `}</style>
      </head>
      <body>
        <div role="alert">
          <h1 style={{ fontSize: 28, margin: 0 }}>MemoryPlace hit a snag</h1>
          <p>Something went wrong loading the app. Your palaces and cards are safe.</p>
          <button onClick={() => retry()}>Try again</button>
        </div>
      </body>
    </html>
  );
}
