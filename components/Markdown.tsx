"use client";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Card text rendered as markdown (safe by default: no raw HTML), with GitHub
// extras: ~~strike~~, - [ ] checklists, tables, bare links. Typography is
// sized for cards: it inherits the surrounding font size and colour.
const BLOCK: Components = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  del: ({ children }) => <del className="opacity-70">{children}</del>,
  h1: ({ children }) => <p className="mb-1.5 text-[1.35em] font-bold leading-snug">{children}</p>,
  h2: ({ children }) => <p className="mb-1.5 text-[1.2em] font-bold leading-snug">{children}</p>,
  h3: ({ children }) => <p className="mb-1 text-[1.08em] font-semibold leading-snug">{children}</p>,
  h4: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={`mb-1.5 space-y-0.5 text-left last:mb-0 ${className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc pl-5"}`}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-5 text-left last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="marker:text-muted-foreground">{children}</li>,
  input: ({ checked }) => <input type="checkbox" checked={!!checked} readOnly disabled className="mr-1.5 translate-y-px accent-[var(--color-primary)]" />,
  blockquote: ({ children }) => <blockquote className="mb-1.5 border-l-4 border-primary/40 pl-3 text-left italic opacity-90 last:mb-0">{children}</blockquote>,
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.88em]">{children}</code>
    ),
  pre: ({ children }) => <pre className="mb-1.5 overflow-x-auto rounded-lg bg-muted p-3 text-left font-mono text-[0.85em] leading-relaxed last:mb-0">{children}</pre>,
  hr: () => <hr className="my-2 border-border" />,
  table: ({ children }) => (
    <div className="mb-1.5 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-[0.92em]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/60 px-2 py-1">{children}</td>,
  img: ({ alt }) => <span className="italic opacity-70">[{alt || "image"}]</span>,
};

// Inline: for one-line spots (answer choices, list rows) — blocks flatten to spans.
const INLINE: Components = {
  ...BLOCK,
  p: ({ children }) => <span>{children} </span>,
  h1: ({ children }) => <span className="font-bold">{children} </span>,
  h2: ({ children }) => <span className="font-bold">{children} </span>,
  h3: ({ children }) => <span className="font-semibold">{children} </span>,
  h4: ({ children }) => <span className="font-semibold">{children} </span>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span>{children} </span>,
  blockquote: ({ children }) => <span className="italic">{children}</span>,
  pre: ({ children }) => <span className="font-mono">{children}</span>,
  table: () => null,
  hr: () => null,
};

export default function Markdown({ text, className, inline = false }: { text: string; className?: string; inline?: boolean }) {
  if (!text) return null;
  const body = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={inline ? INLINE : BLOCK}>
      {text}
    </ReactMarkdown>
  );
  return inline ? <span className={className}>{body}</span> : <div className={className}>{body}</div>;
}
