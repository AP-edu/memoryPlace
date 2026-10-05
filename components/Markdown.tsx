"use client";
import ReactMarkdown from "react-markdown";

// Card text rendered as markdown (safe by default: no raw HTML).
// Falls back to plain text rendering for empty input.
export default function Markdown({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          // Keep quiz/answer typography tight inside cards.
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-link hover:underline">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="rounded bg-muted px-1 text-[0.9em]">{children}</code>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
