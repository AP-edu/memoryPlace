/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Supabase diagnostics for MemoryPlace.
 *
 * Usage (from the project root):
 *   node scripts/quiz-diagnostic.cjs            # report users/courses/decks/cards/results + flags
 *   node scripts/quiz-diagnostic.cjs --cleanup  # also delete all test accounts (e2e_* / repro_* / univ_*) and their data
 *
 * Reads credentials from .env.local (handles inline "# ..." comments).
 */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"')) v = v.slice(1);
    if (v.endsWith('"')) v = v.slice(0, -1);
    v = v.replace(/\s+#.*$/, "").trim();
    env[m[1]] = v;
  }
  return env;
}

const root = path.resolve(__dirname, "..");
const env = loadEnv(path.join(root, ".env.local"));
const { createClient } = require(path.join(root, "node_modules", "@supabase", "supabase-js"));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const CLEANUP = process.argv.includes("--cleanup");
const pad = (s, n = 36) => String(s ?? "NULL").padEnd(n).slice(0, n);

async function main() {
  const [users, courses, decks, cards, results] = await Promise.all([
    supabase.from("users").select("*").order("created_at", { ascending: true }),
    supabase.from("courses").select("*").order("created_at", { ascending: true }),
    supabase.from("decks").select("*").order("created_at", { ascending: true }),
    supabase.from("flashcards").select("*").order("created_at", { ascending: true }),
    supabase.from("quiz_results").select("*").order("created_at", { ascending: true }),
  ]);
  const errs = ["users", "courses", "decks", "flashcards", "quiz_results"].map((n, i) => [
    n,
    [users, courses, decks, cards, results][i].error,
  ]);
  for (const [n, e] of errs) if (e) console.log(`!! ${n} query failed: ${e.message}`);

  const userById = new Map((users.data ?? []).map((u) => [u.id, u.email]));
  const name = (id) => userById.get(id) ?? id;

  console.log("=== USERS (" + (users.data?.length ?? 0) + ") ===");
  for (const u of users.data ?? []) console.log(`${pad(u.id)}${pad(u.email, 30)}${pad(u.role, 6)}${u.created_at}`);

  console.log("\n=== COURSES (" + (courses.data?.length ?? 0) + ") ===");
  for (const c of courses.data ?? []) console.log(`${pad(c.id)}${pad(c.title, 26)}owner=${pad(name(c.owner), 30)}created=${c.created_at}`);

  console.log("\n=== DECKS (" + (decks.data?.length ?? 0) + ") ===");
  for (const d of decks.data ?? []) console.log(`${pad(d.id)}${pad(d.title, 24)}owner=${pad(name(d.owner), 30)}course=${pad(d.course_id, 36)}${d.created_at}`);

  console.log("\n=== FLASHCARDS (" + (cards.data?.length ?? 0) + ") ===");
  for (const c of cards.data ?? []) console.log(`${pad(c.id)}owner=${pad(name(c.owner), 30)}deck=${pad(c.deck_id, 36)}Q=${c.question}`);

  console.log("\n=== QUIZ RESULTS (" + (results.data?.length ?? 0) + ") ===");
  for (const r of results.data ?? []) console.log(`${pad(r.id)}user=${pad(name(r.user_id), 30)}deck=${pad(r.deck_id, 36)}${r.score}/${r.total} created=${r.created_at}`);

  const deckById = new Map((decks.data ?? []).map((d) => [d.id, d]));
  console.log("\n=== FLAGS ===");
  const nullOwnedCards = (cards.data ?? []).filter((c) => !c.owner);
  const danglingCards = (cards.data ?? []).filter((c) => !deckById.has(c.deck_id));
  const mismatched = (cards.data ?? []).filter(
    (c) => c.owner && deckById.has(c.deck_id) && deckById.get(c.deck_id).owner !== c.owner
  );
  console.log(`cards with NULL owner: ${nullOwnedCards.length}`);
  console.log(`cards whose deck_id matches no deck: ${danglingCards.length}`);
  console.log(`cards whose owner != deck owner: ${mismatched.length}`);
  for (const c of mismatched) console.log(`  card ${pad(c.id, 12)} Q=${c.question} owner=${name(c.owner)} deckOwner=${name(deckById.get(c.deck_id).owner)}`);
  console.log(`decks for each user (may explain empty quizzes):`);
  for (const d of decks.data ?? []) {
    const owned = (cards.data ?? []).filter((c) => c.deck_id === d.id);
    console.log(`  ${d.title} (${d.id}) owner=${name(d.owner)} cards=${owned.length}`);
  }
  const checklist = (cards.data ?? []).length === 0 || nullOwnedCards.length > 0;
  console.log(checklist ? ">>> ACTION: no cards or NULL-owner cards present - quiz will show 'no flashcards' to everyone but admins." : ">>> data consistent - quiz empties are account/ownership driven.");

  if (!CLEANUP) {
    console.log("\n(no cleanup) - run with --cleanup to delete e2e_* test accounts.");
    return;
  }

  const testUsers = (users.data ?? []).filter((u) => /^(e2e_|repro_|univ_)/.test(String(u.email)));
  console.log(`\n=== CLEANUP: deleting ${testUsers.length} test accounts ===`);
  for (const u of testUsers) {
    await supabase.from("flashcards").delete().eq("owner", u.id);
    await supabase.from("decks").delete().eq("owner", u.id);
    await supabase.from("courses").delete().eq("owner", u.id);
    await supabase.from("quiz_results").delete().eq("user_id", u.id);
    const { error } = await supabase.from("users").delete().eq("id", u.id);
    console.log(`  removed ${u.email} ${error ? "ERROR: " + error.message : "ok"}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});