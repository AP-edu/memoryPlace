"use client";
import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { Bold, Code, Heading2, Italic, Link2, List, ListChecks, ListOrdered, SquareCode, Strikethrough, TextQuote, type LucideIcon } from "lucide-react";
import Markdown from "./Markdown";
import {
  continueList,
  hasFormatting,
  insertLink,
  toggleCodeBlock,
  toggleLinePrefix,
  wrapSelection,
  type EditState,
} from "@/lib/markdownEdit";

type Action = (s: EditState) => EditState;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Card text field with a formatting toolbar: bold, italic, headings, lists,
 * code, links (and their usual shortcuts), stored as markdown. A live preview
 * appears under the field as soon as there is formatting to see.
 */
export default function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  minRows = 2,
  autoFocus = false,
  onSubmit,
  compact = false,
  textareaRef,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the field ("Answer", "Card front"...). */
  label: string;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  /** Smaller toolbar for narrow side panels (fewer buttons). */
  compact?: boolean;
  /** The underlying textarea (e.g. to focus it again after a submit). */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number } | null>(null);
  const previewId = useId();
  const mod = useMemo(() => (isMac() ? "⌘" : "Ctrl+"), []);

  // Grow with the content (field-sizing isn't everywhere yet), then restore a
  // selection a toolbar action asked for once the new value has landed.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
    const sel = pending.current;
    if (sel && el.value === value) {
      pending.current = null;
      el.focus();
      el.setSelectionRange(sel.start, sel.end);
    }
  }, [value]);

  function apply(action: Action) {
    const el = ta.current;
    if (!el) return;
    const before = { text: el.value, start: el.selectionStart, end: el.selectionEnd };
    const next = action(before);
    if (next.text === before.text) {
      el.focus();
      el.setSelectionRange(next.start, next.end);
      return;
    }
    // Replace only the changed middle via insertText so Ctrl+Z undoes a
    // toolbar action like typing; fall back to a plain value change.
    let p = 0;
    while (p < before.text.length && p < next.text.length && before.text[p] === next.text[p]) p++;
    let s = 0;
    while (
      s < before.text.length - p &&
      s < next.text.length - p &&
      before.text[before.text.length - 1 - s] === next.text[next.text.length - 1 - s]
    )
      s++;
    el.focus();
    el.setSelectionRange(p, before.text.length - s);
    const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, next.text.slice(p, next.text.length - s));
    if (ok && el.value === next.text) {
      el.setSelectionRange(next.start, next.end);
      return;
    }
    pending.current = { start: next.start, end: next.end };
    onChange(next.text);
  }

  const tools: Array<{ key: string; label: string; icon: LucideIcon; action: Action; shortcut?: string; full?: boolean }> = [
    { key: "bold", label: "Bold", icon: Bold, action: (s) => wrapSelection(s, "**", "**", "bold"), shortcut: `${mod}B` },
    { key: "italic", label: "Italic", icon: Italic, action: (s) => wrapSelection(s, "*", "*", "italic"), shortcut: `${mod}I` },
    { key: "strike", label: "Strikethrough", icon: Strikethrough, action: (s) => wrapSelection(s, "~~", "~~", "struck"), shortcut: `${mod}Shift+X`, full: true },
    { key: "heading", label: "Heading", icon: Heading2, action: (s) => toggleLinePrefix(s, "heading") },
    { key: "bullet", label: "Bulleted list", icon: List, action: (s) => toggleLinePrefix(s, "bullet") },
    { key: "number", label: "Numbered list", icon: ListOrdered, action: (s) => toggleLinePrefix(s, "number") },
    { key: "check", label: "Checklist", icon: ListChecks, action: (s) => toggleLinePrefix(s, "check"), full: true },
    { key: "quote", label: "Quote", icon: TextQuote, action: (s) => toggleLinePrefix(s, "quote"), full: true },
    { key: "code", label: "Inline code", icon: Code, action: (s) => wrapSelection(s, "`", "`", "code"), shortcut: `${mod}E` },
    { key: "block", label: "Code block", icon: SquareCode, action: toggleCodeBlock, full: true },
    { key: "link", label: "Link", icon: Link2, action: (s) => insertLink(s), shortcut: `${mod}K` },
  ];
  const shown = compact ? tools.filter((t) => !t.full) : tools;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const modKey = e.metaKey || e.ctrlKey;
    if (modKey && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (modKey && !e.altKey) {
      const k = e.key.toLowerCase();
      const hit =
        k === "b" && !e.shiftKey ? "bold" : k === "i" && !e.shiftKey ? "italic" : k === "k" ? "link" : k === "e" ? "code" : k === "x" && e.shiftKey ? "strike" : null;
      const tool = hit ? tools.find((t) => t.key === hit) : null;
      if (tool) {
        e.preventDefault();
        apply(tool.action);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !modKey && !e.nativeEvent.isComposing) {
      const el = e.currentTarget;
      const next = continueList({ text: el.value, start: el.selectionStart, end: el.selectionEnd });
      if (next) {
        e.preventDefault();
        apply(() => next);
      }
    }
  }

  const showPreview = value.trim() !== "" && hasFormatting(value);

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border-2 border-border bg-card transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30">
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/50 px-1 py-0.5">
          {shown.map((t, i) => (
            <span key={t.key} className="contents">
              {(t.key === "heading" || t.key === "code") && i > 0 && <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />}
              <button
                type="button"
                // Keep the textarea's selection: act on mousedown, never take focus.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(t.action)}
                aria-label={t.label}
                title={t.shortcut ? `${t.label} (${t.shortcut})` : t.label}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground pointer-coarse:h-9 pointer-coarse:w-9"
              >
                <t.icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
        <textarea
          ref={(el) => {
            ta.current = el;
            if (textareaRef) textareaRef.current = el;
          }}
          aria-label={label}
          aria-describedby={showPreview ? previewId : undefined}
          placeholder={placeholder}
          rows={minRows}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showPreview && (
        <div id={previewId} className="mt-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm" aria-live="polite">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Preview</p>
          <Markdown text={value} />
        </div>
      )}
    </div>
  );
}
