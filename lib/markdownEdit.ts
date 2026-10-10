// Markdown formatting for a plain textarea (pure: text + selection in, text +
// selection out). The card editor's toolbar and shortcuts call these, so
// cards stay portable markdown while writing feels like a rich-text field.

export interface EditState {
  text: string;
  /** Selection start/end (textarea selectionStart/selectionEnd). */
  start: number;
  end: number;
}

/**
 * Wrap the selection in `before`/`after` (bold, italic, code...). Toggles:
 * an already-wrapped selection (markers inside or just outside it) is
 * unwrapped. With nothing selected, inserts the markers around `placeholder`
 * and selects it so typing replaces it.
 */
export function wrapSelection(s: EditState, before: string, after = before, placeholder = "text"): EditState {
  const { text, start, end } = s;
  const sel = text.slice(start, end);
  // Markers just outside the selection: **|bold|**
  if (text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
    return {
      text: text.slice(0, start - before.length) + sel + text.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    };
  }
  // Markers inside the selection: |**bold**|
  if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) {
    const inner = sel.slice(before.length, sel.length - after.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  // Keep surrounding spaces outside the markers ("**word** " not "**word **").
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const core = sel.trim() || placeholder;
  const inserted = sel.slice(0, lead) + before + core + after + (sel.trim() ? sel.slice(sel.length - trail) : "");
  const coreStart = start + lead + before.length;
  return { text: text.slice(0, start) + inserted + text.slice(end), start: coreStart, end: coreStart + core.length };
}

/** Start/end of the full lines the selection touches. */
function lineRange(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  // A selection ending right after a newline doesn't include the next line.
  const stop = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const nl = text.indexOf("\n", stop);
  return { from, to: nl === -1 ? text.length : nl };
}

const LINE_PREFIX = /^(\s*)(#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;

/**
 * Toggle a block prefix on every line of the selection: "- " bullets, "1. "
 * numbered (renumbered 1..n), "> " quote, "## " heading, "- [ ] " checklist.
 * If every line already has this prefix it is removed; any other block
 * prefix is replaced (a bullet list becomes numbered, not "1. - item").
 */
export function toggleLinePrefix(s: EditState, kind: "bullet" | "number" | "quote" | "heading" | "check"): EditState {
  const { text } = s;
  const { from, to } = lineRange(text, s.start, s.end);
  const lines = text.slice(from, to).split("\n");
  const want = (i: number) =>
    kind === "bullet" ? "- " : kind === "number" ? `${i + 1}. ` : kind === "quote" ? "> " : kind === "heading" ? "## " : "- [ ] ";
  const has = (line: string) => {
    const m = line.match(LINE_PREFIX);
    if (!m) return false;
    const p = m[2];
    if (kind === "bullet") return /^[-*+] $/.test(p);
    if (kind === "number") return /^\d+[.)] $/.test(p);
    if (kind === "quote") return p === "> ";
    if (kind === "heading") return /^#{1,6} $/.test(p);
    return /^[-*+] \[[ xX]\] $/.test(p);
  };
  const content = lines.filter((l) => l.trim() !== "");
  const remove = content.length > 0 && content.every(has);
  let n = 0;
  const out = lines.map((line) => {
    if (line.trim() === "" && lines.length > 1) return line;
    const m = line.match(LINE_PREFIX);
    const indent = m ? m[1] : (line.match(/^\s*/)?.[0] ?? "");
    const body = m ? line.slice(m[0].length) : line.slice(indent.length);
    return remove ? indent + body : indent + want(n++) + body;
  });
  const replaced = out.join("\n");
  const next = text.slice(0, from) + replaced + text.slice(to);
  // Keep the caret on the same text: put it at the end of the changed block
  // when there was a selection, else shift it by the first line's change.
  if (s.start === s.end) {
    const delta = out[0].length - lines[0].length;
    const caret = Math.max(from, s.start + delta);
    return { text: next, start: caret, end: caret };
  }
  return { text: next, start: from, end: from + replaced.length };
}

/** Wrap the selection as a link and select the URL placeholder. */
export function insertLink(s: EditState, url = "https://"): EditState {
  const label = s.text.slice(s.start, s.end) || "link text";
  const inserted = `[${label}](${url})`;
  const urlStart = s.start + label.length + 3;
  return { text: s.text.slice(0, s.start) + inserted + s.text.slice(s.end), start: urlStart, end: urlStart + url.length };
}

/** Fenced code block around the selected lines (or an empty one). */
export function toggleCodeBlock(s: EditState): EditState {
  const { from, to } = lineRange(s.text, s.start, s.end);
  const block = s.text.slice(from, to);
  const fenced = block.match(/^```[^\n]*\n([\s\S]*)\n```$/);
  if (fenced) {
    const inner = fenced[1];
    return { text: s.text.slice(0, from) + inner + s.text.slice(to), start: from, end: from + inner.length };
  }
  const inner = block || "code";
  const out = "```\n" + inner + "\n```";
  return { text: s.text.slice(0, from) + out + s.text.slice(to), start: from + 4, end: from + 4 + inner.length };
}

/**
 * Enter inside a list item: continue the list ("- ", "2. ", "- [ ] ", "> ").
 * Enter on an empty item ends the list (removes the bare marker). Returns
 * null when the caret isn't in a list line (let the textarea handle it).
 */
export function continueList(s: EditState): EditState | null {
  if (s.start !== s.end) return null;
  const { text, start } = s;
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const line = text.slice(from, start);
  const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/);
  if (!m) return null;
  const [marker, indent] = [m[0], m[1]];
  if (line.trim() === marker.trim()) {
    // Empty item: end the list.
    return { text: text.slice(0, from) + text.slice(start), start: from, end: from };
  }
  let next = marker.slice(indent.length);
  if (m[3]) next = `${Number(m[3]) + 1}${m[4]} `;
  else if (/\[[xX]\]/.test(next)) next = next.replace(/\[[xX]\]/, "[ ]");
  const insert = "\n" + indent + next;
  return { text: text.slice(0, start) + insert + text.slice(start), start: start + insert.length, end: start + insert.length };
}

/** True when the text uses any markdown worth previewing. */
export function hasFormatting(text: string): boolean {
  return /(\*\*|__|\*[^\s*]|_[^\s_]|~~|`|^#{1,6} |^\s*[-*+] |^\s*\d+[.)] |^> |\[[^\]]+\]\([^)]+\)|^\|.*\|$)/m.test(text);
}

/**
 * Plain text from markdown, for places that can't render it (print sheets,
 * session labels, choice buttons built from other cards). Not a full parser:
 * strips the common inline and block markers.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, "$1")
    .replace(/^(\s*)[-*+]\s+/gm, "$1")
    .replace(/^(\s*)\d+[.)]\s+/gm, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}
