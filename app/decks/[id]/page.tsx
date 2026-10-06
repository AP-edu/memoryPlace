"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import Markdown from "@/components/Markdown";
import PortToPalace from "@/components/decks/PortToPalace";
import { parseTagInput } from "@/lib/deckLink";
import type { Deck, Flashcard, Palace } from "@/types/database";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface LinkInfo {
  linked: boolean;
  card?: { id: string; room_id?: string; room_title?: string; locus_label?: string };
}

function FlashcardRow({
  f,
  onChanged,
  onPort,
}: {
  f: Flashcard;
  onChanged: () => void;
  onPort: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(f.question);
  const [a, setA] = useState(f.answer);
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const res = await fetch(`/api/flashcards/${f.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, answer: a }),
    });
    if (!res.ok) return setMsg((await res.json().catch(() => ({}))).error ?? "Save failed");
    setEditing(false);
    setMsg(null);
    onChanged();
  }
  async function remove() {
    if (!confirm("Delete this flashcard? Its linked palace card (if any) is kept.")) return;
    const res = await fetch(`/api/flashcards/${f.id}`, { method: "DELETE" });
    if (!res.ok) return setMsg("Delete failed");
    onChanged();
  }
  async function toggleInfo() {
    if (info) return setInfo(null);
    const res = await fetch(`/api/links?flashcard_id=${f.id}`);
    setInfo(res.ok ? await res.json() : { linked: false });
  }
  async function unlink() {
    const res = await fetch(`/api/links?flashcard_id=${f.id}`, { method: "DELETE" });
    if (!res.ok) return setMsg("Unlink failed");
    setInfo(null);
    onChanged();
  }
  async function push() {
    if (!f.source_card_id) return;
    const res = await fetch("/api/links", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flashcard_id: f.id, card_id: f.source_card_id, direction: "to-card" }),
    });
    setMsg(res.ok ? "Pushed to the palace card." : ((await res.json().catch(() => ({}))).error ?? "Push failed"));
  }

  return (
    <li className="card-base p-4">
      {editing ? (
        <div className="space-y-2">
          <textarea className="input-base" rows={2} value={q} onChange={(e) => setQ(e.target.value)} />
          <textarea className="input-base" rows={2} value={a} onChange={(e) => setA(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary !px-3 !py-1.5">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="font-medium">
            <Markdown text={f.question} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            <Markdown text={f.answer} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {f.source_card_id ? (
              <button onClick={toggleInfo} className="rounded-full border border-success/50 px-2 py-0.5 text-success">
                ⚓ Anchored
              </button>
            ) : (
              <span className="rounded-full border border-accent/50 px-2 py-0.5 text-highlight">Not anchored</span>
            )}
            <button onClick={() => setEditing(true)} className="btn-ghost">
              Edit
            </button>
            {!f.source_card_id && (
              <button onClick={onPort} className="btn-ghost">
                Port to palace
              </button>
            )}
            <button onClick={remove} className="btn-ghost text-destructive">
              Delete
            </button>
          </div>
          {info?.linked && info.card && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Lives in{" "}
                {info.card.room_id ? (
                  <Link href={`/rooms/${info.card.room_id}`} className="text-link underline">
                    {info.card.room_title}
                  </Link>
                ) : (
                  "a palace"
                )}
                {info.card.locus_label ? ` · ${info.card.locus_label}` : ""}
              </span>
              <button onClick={push} className="btn-ghost">
                Push text to palace
              </button>
              <button onClick={unlink} className="btn-ghost text-destructive">
                Unlink
              </button>
            </div>
          )}
        </>
      )}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </li>
  );
}

function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { data: deck, loading, error, refetch: refetchDeck } = useFetch<Deck>(id ? `/api/decks/${id}` : null);
  const { data: cards, refetch } = useFetch<Flashcard[]>(id ? `/api/flashcards?deck=${id}` : null);
  const { data: palaces } = useFetch<Palace[]>("/api/palaces");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [portAll, setPortAll] = useState(sp.get("port") === "1");
  const [portOne, setPortOne] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState<string | null>(null);

  if (loading) return <PageSkeleton label="Loading deck" cards={2} />;
  if (error || !deck) {
    return (
      <div className="p-6">
        <p className="text-destructive">Could not load this deck{error ? `: ${error}` : ""}.</p>
        <Link href="/decks" className="btn-ghost mt-3">
          ← Decks
        </Link>
      </div>
    );
  }

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/decks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return setFormError((await res.json().catch(() => ({}))).error ?? "Update failed");
    setFormError(null);
    refetchDeck();
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return setFormError("Question and answer required");
    const res = await fetch("/api/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deck_id: id, question: question.trim(), answer: answer.trim() }),
    });
    if (!res.ok) return setFormError((await res.json().catch(() => ({}))).error ?? "Could not add card");
    setFormError(null);
    setQuestion("");
    setAnswer("");
    refetch();
  }

  const list = cards ?? [];
  const unanchored = list.filter((c) => !c.source_card_id).length;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/decks" className="btn-ghost">
        ← Decks
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">{deck.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {list.length} card{list.length === 1 ? "" : "s"}
        {list.length > 0 ? ` · ${list.length - unanchored} anchored in a palace` : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {list.length > 0 && (
          // While cards are still unanchored, porting is the main call to action.
          <Link href={`/quiz/${id}`} className={unanchored > 0 ? "btn-outline" : "btn-primary"}>
            Quiz this deck →
          </Link>
        )}
        {list.length > 0 && (
          <button onClick={() => setPortAll((v) => !v)} className={unanchored > 0 ? "btn-primary" : "btn-outline"}>
            {unanchored > 0 ? `Port ${unanchored} to palace` : "Port all to palace"}
          </button>
        )}
        <select
          className="input-base !w-auto"
          value={deck.palace_id ?? ""}
          onChange={(e) => patch({ palace_id: e.target.value || null })}
          aria-label="Linked palace"
        >
          <option value="">No palace</option>
          {(palaces ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <input
          className="input-base !w-auto"
          placeholder="tags" aria-label="tags"
          value={tagsText ?? (deck.tags ?? []).join(", ")}
          onChange={(e) => setTagsText(e.target.value)}
          onBlur={() => {
            if (tagsText !== null) patch({ tags: parseTagInput(tagsText) });
            setTagsText(null);
          }}
        />
      </div>

      {portAll && list.length > 0 && (
        <div className="mt-4">
          <PortToPalace
            deckId={id}
            count={list.length}
            defaultPalaceId={deck.palace_id ?? ""}
            onClose={() => setPortAll(false)}
            onDone={refetch}
          />
        </div>
      )}
      {portOne && (
        <div className="mt-4">
          <PortToPalace
            deckId={id}
            flashcardIds={[portOne]}
            count={1}
            defaultPalaceId={deck.palace_id ?? ""}
            onClose={() => setPortOne(null)}
            onDone={refetch}
          />
        </div>
      )}

      <form onSubmit={addCard} className="mt-6 space-y-2">
        <textarea className="input-base" rows={2} placeholder="Question (markdown ok)" aria-label="Question (markdown ok)" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <textarea className="input-base" rows={2} placeholder="Answer" aria-label="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <button className="btn-primary">Add flashcard</button>
      </form>
      {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}

      <ul className="mt-6 space-y-3">
        {list.map((f) => (
          <FlashcardRow key={f.id} f={f} onChanged={refetch} onPort={() => setPortOne(f.id)} />
        ))}
      </ul>
    </div>
  );
}

export default function DeckPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading deck" cards={2} />}>
      <DeckDetail />
    </Suspense>
  );
}
