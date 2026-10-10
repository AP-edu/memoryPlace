import { describe, expect, it } from "vitest";
import { continueList, hasFormatting, insertLink, stripMarkdown, toggleCodeBlock, toggleLinePrefix, wrapSelection, type EditState } from "./markdownEdit";

/** Build a state from text with [ and ] marking the selection (| for a caret). */
function st(marked: string): EditState {
  if (marked.includes("|")) {
    const i = marked.indexOf("|");
    return { text: marked.replace("|", ""), start: i, end: i };
  }
  const a = marked.indexOf("[");
  const b = marked.indexOf("]") - 1;
  return { text: marked.replace("[", "").replace("]", ""), start: a, end: b };
}
/** Render a state back with the same markers. */
function show(s: EditState): string {
  if (s.start === s.end) return s.text.slice(0, s.start) + "|" + s.text.slice(s.start);
  return s.text.slice(0, s.start) + "[" + s.text.slice(s.start, s.end) + "]" + s.text.slice(s.end);
}

describe("wrapSelection", () => {
  it("wraps a selection and keeps it selected", () => {
    expect(show(wrapSelection(st("the [capital] of"), "**"))).toBe("the **[capital]** of");
  });

  it("toggles off when the markers are just outside or inside the selection", () => {
    expect(show(wrapSelection(st("the **[capital]** of"), "**"))).toBe("the [capital] of");
    expect(show(wrapSelection(st("the [**capital**] of"), "**"))).toBe("the [capital] of");
  });

  it("inserts a selected placeholder with no selection", () => {
    expect(show(wrapSelection(st("say |"), "*", "*", "it"))).toBe("say *[it]*");
  });

  it("keeps surrounding spaces outside the markers", () => {
    expect(show(wrapSelection(st("a[ word ]b"), "**"))).toBe("a **[word]** b");
  });
});

describe("toggleLinePrefix", () => {
  it("bullets every selected line, then removes them", () => {
    const on = toggleLinePrefix(st("[one\ntwo]"), "bullet");
    expect(on.text).toBe("- one\n- two");
    expect(toggleLinePrefix(on, "bullet").text).toBe("one\ntwo");
  });

  it("numbers lines 1..n and converts bullets instead of stacking markers", () => {
    expect(toggleLinePrefix(st("[- a\n- b\n- c]"), "number").text).toBe("1. a\n2. b\n3. c");
  });

  it("works on the caret's line and keeps the caret on its text", () => {
    expect(show(toggleLinePrefix(st("first\nsec|ond"), "heading"))).toBe("first\n## sec|ond");
    expect(show(toggleLinePrefix(st("first\n## sec|ond"), "heading"))).toBe("first\nsec|ond");
  });

  it("makes checklists and quotes", () => {
    expect(toggleLinePrefix(st("|buy milk"), "check").text).toBe("- [ ] buy milk");
    expect(toggleLinePrefix(st("|wise words"), "quote").text).toBe("> wise words");
  });

  it("leaves blank lines inside a multi-line selection alone", () => {
    expect(toggleLinePrefix(st("[a\n\nb]"), "bullet").text).toBe("- a\n\n- b");
  });
});

describe("links and code", () => {
  it("links the selection and selects the URL to type over", () => {
    expect(show(insertLink(st("see [docs] now")))).toBe("see [docs]([https://]) now");
  });

  it("fences and unfences a code block", () => {
    const on = toggleCodeBlock(st("[x = 1]"));
    expect(on.text).toBe("```\nx = 1\n```");
    expect(toggleCodeBlock({ ...on, start: 0, end: on.text.length }).text).toBe("x = 1");
  });
});

describe("continueList", () => {
  it("continues bullets, numbers and checklists", () => {
    expect(show(continueList(st("- milk|"))!)).toBe("- milk\n- |");
    expect(show(continueList(st("1. one|"))!)).toBe("1. one\n2. |");
    expect(show(continueList(st("  - [x] done|"))!)).toBe("  - [x] done\n  - [ ] |");
  });

  it("ends the list on an empty item", () => {
    expect(show(continueList(st("- milk\n- |"))!)).toBe("- milk\n|");
  });

  it("leaves ordinary lines to the textarea", () => {
    expect(continueList(st("just text|"))).toBeNull();
  });
});

describe("plain text", () => {
  it("detects formatting worth previewing", () => {
    expect(hasFormatting("plain answer")).toBe(false);
    expect(hasFormatting("**Canberra**")).toBe(true);
    expect(hasFormatting("- one\n- two")).toBe(true);
    expect(hasFormatting("a * b = c")).toBe(false);
  });

  it("strips markdown to readable text", () => {
    expect(stripMarkdown("**Canberra**, not *Sydney*")).toBe("Canberra, not Sydney");
    expect(stripMarkdown("## Title\n- one\n- [ ] two\n> quote")).toBe("Title\none\ntwo\nquote");
    expect(stripMarkdown("see [docs](https://x.y) and `code` ~~old~~")).toBe("see docs and code old");
    expect(stripMarkdown("2 * 3 = 6")).toBe("2 * 3 = 6");
  });
});
