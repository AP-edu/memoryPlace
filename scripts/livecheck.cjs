/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Live click-through of the app on a real GPU — the PC's verdict for 3D work
 * (AGENTS.md "Machine split"). Drives the production build with Playwright.
 *
 * Usage (from the project root, after `npm run build`):
 *   npm run livecheck                      # default GPU (Vulkan picks the discrete card)
 *   npm run livecheck -- --gpu=igpu        # pin Chromium to the AMD integrated GPU (RADV)
 *   npm run livecheck -- --gpu=software    # SwiftShader smoke run (laptop); perf limits skipped
 *   npm run livecheck -- --only=walk       # setup + checks whose name matches /walk/i
 *   npm run livecheck -- --base=http://localhost:3000   # use a server you started yourself
 *   npm run livecheck -- --keep            # keep the throwaway user + data (for poking around)
 *
 * Without --base it starts `next start` on a free port and stops it afterwards.
 * Seeds throwaway users (mp-livecheck-<ts>@example.com) in the Supabase project
 * from .env.local and deletes them and everything they own at the end.
 * Artifacts (screenshots, print PDF) go to .livecheck/<run>/. Exit 1 on any failure.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

// ------------------------------------------------------------------ options
const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const GPU = argv.gpu ?? "default";
const ONLY = argv.only ? new RegExp(argv.only, "i") : null;
const KEEP = !!argv.keep;
let BASE = (argv.base ?? "").replace(/\/$/, "");
const RUN = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(root, ".livecheck", RUN);
fs.mkdirSync(OUT, { recursive: true });

const GPU_ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"];
const LAUNCH = {
  default: { channel: "chromium", args: GPU_ARGS, env: {} },
  igpu: {
    channel: "chromium",
    args: GPU_ARGS,
    env: { VK_ICD_FILENAMES: "/usr/share/vulkan/icd.d/radeon_icd.json", VK_DRIVER_FILES: "/usr/share/vulkan/icd.d/radeon_icd.json" },
  },
  software: { channel: "chromium", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"], env: {} },
}[GPU];
if (!LAUNCH) {
  console.error(`Unknown --gpu=${GPU} (default | igpu | software)`);
  process.exit(2);
}

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"')) v = v.slice(1);
    if (v.endsWith('"')) v = v.slice(0, -1);
    env[m[1]] = v.replace(/\s+#.*$/, "").trim();
  }
  return env;
}

// ------------------------------------------------------------------ check runner
const results = [];
const perf = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function check(name, fn, { always = false } = {}) {
  if (ONLY && !always && !ONLY.test(name)) return;
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? "" });
    console.log(`PASS ${name}${note ? ` — ${note}` : ""} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, note: e.message.split("\n")[0] });
    console.log(`FAIL ${name} — ${e.message.split("\n").slice(0, 3).join(" | ")}`);
    if (always) throw e; // setup failed: nothing after it can run
  }
}

// ------------------------------------------------------------------ geometry helpers
/** Plaques sit this far off their wall (components/scene3d/RoomShell.tsx PLAQUE_OFFSET). */
const PLAQUE_OFFSET = 0.05;
/** Walk camera eye height (lib/walk.ts EYE_HEIGHT). */
const EYE_HEIGHT = 1.6;
/** Room3DEditor's default camera (+ OrbitControls target), in scene coordinates. */
function editorCamera(room) {
  const camDist = Math.max(room.width, room.depth) * 1.15 + 3;
  const toScene = (p) => [p.x, p.y, -p.z];
  return {
    pos: toScene({ x: room.width / 2 + camDist * 0.35, y: camDist * 0.75, z: room.depth / 2 - camDist * 0.8 }),
    target: toScene({ x: room.width / 2, y: room.height * 0.35, z: room.depth / 2 }),
    fov: 50,
  };
}
/** World point (x east, y up, z north) -> page pixel inside `box`. */
function project(cam, box, world) {
  const p = [world.x, world.y, -world.z];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => a.map((v) => v / Math.hypot(...a));
  const f = norm(sub(cam.target, cam.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, cam.pos);
  const zc = dot(d, f);
  const t = Math.tan((cam.fov / 2) * (Math.PI / 180));
  const nx = dot(d, r) / (zc * t * (box.width / box.height));
  const ny = dot(d, u) / (zc * t);
  return { x: box.x + ((nx + 1) / 2) * box.width, y: box.y + ((1 - ny) / 2) * box.height };
}

// ------------------------------------------------------------------ pixel helpers (decoded in the page)
async function pixelStats(page, png, region = { x0: 0, y0: 0, x1: 1, y1: 1 }) {
  return page.evaluate(
    async ({ b64, region }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const X0 = Math.floor(region.x0 * c.width), Y0 = Math.floor(region.y0 * c.height);
      const W = Math.floor((region.x1 - region.x0) * c.width), H = Math.floor((region.y1 - region.y0) * c.height);
      const { data } = g.getImageData(X0, Y0, W, H);
      const lum = new Float32Array(W * H);
      const colors = new Set();
      let dark = 0;
      for (let i = 0; i < W * H; i++) {
        const r = data[i * 4], gr = data[i * 4 + 1], b = data[i * 4 + 2];
        lum[i] = (r + gr + b) / 3;
        if (lum[i] < 60) dark++;
        if (i % 97 === 0) colors.add((r >> 4) * 256 + (gr >> 4) * 16 + (b >> 4));
      }
      // Count bright blobs (stars) on a dark field: 4-connected components.
      const seen = new Uint8Array(W * H);
      let blobs = 0;
      for (let i = 0; i < W * H; i++) {
        if (seen[i] || lum[i] < 120) continue;
        blobs++;
        const stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const k = stack.pop();
          const x = k % W, y = (k - x) / W;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const n = ny * W + nx;
            if (!seen[n] && lum[n] >= 120) {
              seen[n] = 1;
              stack.push(n);
            }
          }
        }
      }
      return { colors: colors.size, darkShare: dark / (W * H), blobs, w: W, h: H };
    },
    { b64: png.toString("base64"), region }
  );
}

/** rAF frame-time distribution over `ms` (headless Chromium caps at ~60 fps). */
async function frameStats(page, ms = 4000) {
  return page.evaluate(
    (ms) =>
      new Promise((res) => {
        const d = [];
        let last = performance.now();
        const t0 = last;
        const tick = (t) => {
          d.push(t - last);
          last = t;
          if (t - t0 < ms) requestAnimationFrame(tick);
          else {
            const s = [...d].sort((a, b) => a - b);
            const total = d.reduce((a, b) => a + b, 0);
            res({
              fps: Math.round((d.length * 1000) / total),
              p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
              slow: +((100 * d.filter((x) => x > 25).length) / d.length).toFixed(1),
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms
  );
}
const PERF_FLOOR_FPS = 30;
async function recordPerf(page, label) {
  const s = await frameStats(page);
  perf.push({ label, ...s });
  if (GPU !== "software") assert(s.fps >= PERF_FLOOR_FPS, `${label}: ${s.fps} fps (< ${PERF_FLOOR_FPS})`);
  return `${s.fps} fps, p95 ${s.p95} ms, ${s.slow}% frames > 25 ms`;
}

// ------------------------------------------------------------------ server
/** True only when THIS app answers (next-auth's CSRF endpoint), not just any server on the port. */
async function isThisApp(base) {
  try {
    const r = await fetch(`${base}/api/auth/csrf`);
    return r.ok && typeof (await r.json()).csrfToken === "string";
  } catch {
    return false;
  }
}
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = require("net").createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
async function ensureServer() {
  if (BASE) {
    if (!(await isThisApp(BASE))) throw new Error(`MemoryPlace is not answering at ${BASE}`);
    return null;
  }
  if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) throw new Error("No production build: run `npm run build` first");
  const port = await freePort();
  BASE = `http://localhost:${port}`;
  const log = fs.openSync(path.join(OUT, "server.log"), "w");
  const proc = spawn(path.join(root, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, NEXTAUTH_URL: BASE },
    stdio: ["ignore", log, log],
  });
  for (let i = 0; i < 60; i++) {
    if (await isThisApp(BASE)) return proc;
    await sleep(500);
  }
  proc.kill();
  throw new Error("next start did not come up (see server.log)");
}

// ------------------------------------------------------------------ cleanup
async function cleanup(userIds) {
  const env = { ...loadEnv(path.join(root, ".env.local")), ...process.env };
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  if (!url || !key) return console.log("cleanup skipped: no Supabase service key in env/.env.local");
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(url, key);
  const { data: rows, error } = await db.from("users").select("id, email").in("id", userIds);
  if (error) return console.log("cleanup failed:", error.message);
  // Guard: only ever delete the throwaway accounts this script made.
  const mine = rows.filter((r) => /^mp-livecheck-\d+(-b)?@example\.com$/.test(r.email));
  for (const { id } of mine) {
    for (const [table, col] of [
      ["study_sessions", "user_id"],
      ["card_reviews", "user_id"],
      ["flashcards", "owner"],
      ["decks", "owner"],
      ["palaces", "user_id"], // cascades levels, rooms, openings, loci, cards
      ["rooms", "user_id"],
      ["cards", "user_id"],
      ["users", "id"],
    ]) {
      const { error: e } = await db.from(table).delete().eq(col, id);
      if (e) console.log(`cleanup ${table}: ${e.message}`);
    }
  }
  const { count } = await db.from("users").select("id", { count: "exact", head: true }).in("id", userIds);
  console.log(`cleanup: removed ${mine.length} throwaway user(s); ${count ?? "?"} left`);
}

// ------------------------------------------------------------------ main
(async () => {
  const server = await ensureServer();
  const browser = await chromium.launch({ headless: !argv.headed, channel: LAUNCH.channel, args: LAUNCH.args, env: { ...process.env, ...LAUNCH.env } });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const api = page.request;
  const json = async (res, want) => {
    const body = await res.json().catch(() => ({}));
    if (want && res.status() !== want) throw new Error(`${res.url()} -> ${res.status()} ${JSON.stringify(body)}`);
    return body;
  };
  const shot = (p, name, opts = {}) => p.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  const MAP = "svg[aria-label='Level map, north at top']";

  const stamp = Date.now();
  const EMAIL = `mp-livecheck-${stamp}@example.com`;
  const EMAIL2 = `mp-livecheck-${stamp}-b@example.com`;
  const PW1 = "livecheck-pass-1";
  const PW2 = "livecheck-pass-2";
  const userIds = [];
  const ids = {};
  let exitCode = 0;

  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  console.log(`renderer: ${renderer}\nbase: ${BASE}\nartifacts: ${path.relative(root, OUT)}\n`);

  try {
    await check(
      "gpu: running on the requested renderer",
      async () => {
        if (GPU === "software") return "software (perf limits skipped)";
        assert(!/swiftshader|llvmpipe/i.test(renderer), `fell back to software GL: ${renderer}`);
        if (GPU === "igpu") assert(/radv|amd|radeon/i.test(renderer), `not the integrated GPU: ${renderer}`);
      },
      { always: true }
    );

    // -------------------------------------------------------------- setup
    await check(
      "auth: signup + credentials login lands on /home",
      async () => {
        const u = await json(await api.post(`${BASE}/api/auth/signup`, { data: { name: "Live Check", email: EMAIL, password: PW1 } }), 201);
        userIds.push(u.id);
        await page.goto(`${BASE}/login`);
        await page.fill("input[type=email]", EMAIL);
        await page.fill("input[type=password]", PW1);
        await page.getByRole("button", { name: "Log In" }).click();
        await page.waitForURL(/\/home/, { timeout: 15000 });
      },
      { always: true }
    );

    await check("onboarding: overlay shows for a fresh user", async () => {
      await page.waitForLoadState("networkidle");
      await page.getByText("Raise your palace").first().waitFor({ timeout: 10000 });
    });

    await check(
      "seed: palace, two rooms joined by a door, loci, cards, decks",
      async () => {
        const palace = await json(await api.post(`${BASE}/api/palaces`, { data: { title: "Live Check Palace" } }), 201);
        ids.palace = palace.id;
        const A = await json(await api.post(`${BASE}/api/rooms`, { data: { title: "Atrium", palace_id: palace.id, width: 8, depth: 6, height: 3, pos_x: 0, pos_z: 0 } }), 201);
        const B = await json(
          await api.post(`${BASE}/api/rooms`, { data: { title: "Library", palace_id: palace.id, width: 8, depth: 5, height: 3, pos_x: 0, pos_z: 6, level_id: A.level_id } }),
          201
        );
        ids.A = A;
        ids.B = B;
        // Door mid north wall of A (visible from the editor camera) <-> mid south wall of B.
        await json(await api.post(`${BASE}/api/openings`, { data: { room_id: A.id, wall: "north", wall_offset: 0.5, width_m: 1.2, kind: "door", target_room_id: B.id } }), 201);
        await json(await api.post(`${BASE}/api/openings`, { data: { room_id: B.id, wall: "south", wall_offset: 0.5, width_m: 1.2, kind: "door", target_room_id: A.id } }), 201);
        const spots = [
          ["north", 0.08],
          ["north", 0.18],
          ["west", 0.3],
          ["west", 0.7],
        ];
        const qa = [
          ["Capital of France?", "Paris", ["Rome", "Madrid", "Berlin"]],
          ["2 + 2?", "4", ["3", "5", "22"]],
          ["H2O is?", "Water", ["Salt", "Air", "Fire"]],
          ["Largest planet?", "Jupiter", ["Mars", "Venus", "Mercury"]],
        ];
        ids.lociA = [];
        for (let i = 0; i < spots.length; i++) {
          const l = await json(
            await api.post(`${BASE}/api/loci`, { data: { room_id: A.id, label: `Spot ${i + 1}`, wall: spots[i][0], wall_offset: spots[i][1], height: 1.5, position: i } }),
            201
          );
          ids.lociA.push(l.id);
          await json(await api.post(`${BASE}/api/cards`, { data: { locus_id: l.id, front: qa[i][0], back: qa[i][1], options: qa[i][2] } }), 201);
        }
        const shelf = await json(await api.post(`${BASE}/api/loci`, { data: { room_id: B.id, label: "Shelf", wall: "east", wall_offset: 0.5, height: 1.5, position: 0 } }), 201);
        ids.shelf = shelf;
        await json(await api.post(`${BASE}/api/cards`, { data: { locus_id: shelf.id, front: "Author of Hamlet?", back: "Shakespeare" } }), 201);
        for (const [title, cards] of [
          ["Import Me", [["Red + blue?", "Purple"], ["Sun is a?", "Star"], ["Ice is?", "Frozen water"]]],
          ["Panel Deck", [["Deck Q1", "Deck A1"], ["Deck Q2", "Deck A2"]]],
        ]) {
          const deck = await json(await api.post(`${BASE}/api/decks`, { data: { title } }), 201);
          ids[title] = deck.id;
          for (const [question, answer] of cards) {
            await json(await api.post(`${BASE}/api/flashcards`, { data: { deck_id: deck.id, question, answer } }), 201);
          }
        }
      },
      { always: true }
    );
    const A = ids.A;
    const lociOf = async (roomId) => json(await api.get(`${BASE}/api/loci?room=${roomId}`), 200);

    // -------------------------------------------------------------- API hardening
    await check("api: malformed ids 404, non-string Q/A 400, onboarding step cap", async () => {
      for (const p of ["cards", "flashcards", "rooms", "palaces", "loci", "study-sessions"]) {
        const r = await api.get(`${BASE}/api/${p}/not-a-uuid`);
        assert(r.status() === 404, `${p} bogus id -> ${r.status()}`);
      }
      const missing = await api.get(`${BASE}/api/cards/00000000-0000-0000-0000-000000000000`);
      assert(missing.status() === 404, `missing card -> ${missing.status()}`);
      const fc = await json(await api.get(`${BASE}/api/flashcards?deck=${ids["Import Me"]}`), 200);
      const fid = (Array.isArray(fc) ? fc : fc.flashcards)[0].id;
      for (const [method, url, data] of [
        ["put", `${BASE}/api/flashcards/${fid}`, { question: { evil: 1 } }],
        ["put", `${BASE}/api/flashcards/${fid}`, { answer: 42 }],
        ["post", `${BASE}/api/flashcards`, { deck_id: ids["Import Me"], question: ["x"], answer: "y" }],
        ["put", `${BASE}/api/profile`, { onboarding_step: 5 }],
      ]) {
        const r = await api[method](url, { data });
        assert(r.status() === 400, `${method.toUpperCase()} ${url.replace(BASE, "")} ${JSON.stringify(data)} -> ${r.status()}`);
      }
      assert((await api.put(`${BASE}/api/profile`, { data: { onboarding_step: 0 } })).status() === 200, "onboarding_step 0 rejected");
      const link = await api.get(`${BASE}/api/links?card_id=not-a-uuid`);
      assert(link.status() < 500, `links bogus card -> ${link.status()}`);
    });

    // -------------------------------------------------------------- palaces
    await check("palaces: tab lists the palace", async () => {
      await page.goto(`${BASE}/home`);
      await page.getByRole("link", { name: "Palaces", exact: true }).first().click();
      await page.waitForURL(/\/palaces$/);
      await page.getByText("Live Check Palace").first().waitFor({ timeout: 10000 });
    });

    await check("home: palace card shows its floor plan; palace hub shows due + learned per room", async () => {
      await page.goto(`${BASE}/home`);
      await page.waitForLoadState("networkidle");
      const card = page.locator("li").filter({ hasText: "Live Check Palace" }).first();
      const rects = await card.locator("svg rect").count();
      assert(rects === 2, `thumbnail shows ${rects} rooms (want 2)`);
      await page.goto(`${BASE}/palaces/${ids.palace}`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("heading", { level: 1, name: "Live Check Palace" }).waitFor({ timeout: 10000 });
      await page.getByText(/\d+ cards · \d+ due/).first().waitFor({ timeout: 10000 });
      await page.getByText(/1\.\s*Atrium/).first().waitFor({ timeout: 10000 });
      await page.getByText(/\d+\/\d+ learned/).first().waitFor({ timeout: 10000 });
    });

    await check("studio: renders; clicking a room floor opens it in the studio -> Place loci -> place mode", async () => {
      await page.goto(`${BASE}/palaces/${ids.palace}`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("tab", { name: "3D Studio" }).click();
      const canvas = page.locator("canvas").first();
      await canvas.waitFor({ timeout: 20000 });
      await sleep(2500); // dynamic import + shader compile
      const st = await pixelStats(page, await canvas.screenshot());
      assert(st.colors > 6, `canvas looks blank (${st.colors} colours)`);
      const box = await canvas.boundingBox();
      let selected = false;
      for (const [fx, fy] of [[0.5, 0.6], [0.5, 0.7], [0.45, 0.65], [0.55, 0.55]]) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await sleep(300);
        if (await page.locator("#studio-title").isVisible().catch(() => false)) {
          selected = true;
          break;
        }
      }
      await shot(page, "studio");
      assert(selected, "clicking a room floor did not open it in the studio");
      const link = page.getByRole("link", { name: "Place loci" });
      assert(/\/rooms\/.+\?tool=place/.test(await link.getAttribute("href")), "bad Place loci href");
      await link.click();
      await page.waitForURL(/\/rooms\/.+\?tool=place/);
      const place = page.getByRole("button", { name: "+ Locus & cards (P)" });
      await place.waitFor();
      assert((await place.getAttribute("aria-pressed")) === "true", "not in place mode");
    });

    await check("studio: furnish a room — place, rotate (R), remove (Del), all saved", async () => {
      const roomFurniture = async () => {
        const rs = await json(await api.get(`${BASE}/api/rooms?palace=${ids.palace}`), 200);
        return rs.find((r) => r.id === A.id).metadata?.furniture ?? [];
      };
      await page.goto(`${BASE}/palaces/${ids.palace}`);
      await page.waitForLoadState("networkidle");
      // Select Atrium from its room card, then open the studio (it keeps the selection).
      await page.getByText(/1\.\s*Atrium/).first().click();
      await page.getByRole("tab", { name: "3D Studio" }).click();
      const canvas = page.locator("canvas").first();
      await canvas.waitFor({ timeout: 20000 });
      await page.locator("#studio-title").waitFor({ timeout: 10000 });
      assert((await page.locator("#studio-title").inputValue()) === "Atrium", "studio did not open on Atrium");
      await sleep(2500); // camera glides to the room
      const box = await canvas.boundingBox();
      await page.getByRole("group", { name: "Furniture palette" }).getByRole("button", { name: "Sofa", exact: true }).click();
      const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(c.x, c.y);
      await page.mouse.move(c.x + 2, c.y);
      await page.mouse.click(c.x + 2, c.y);
      await page.keyboard.press("Escape");
      await page.getByText("All changes saved").waitFor({ timeout: 8000 });
      let saved = await roomFurniture();
      const sofa = saved.find((f) => f.kind === "sofa");
      assert(sofa, `no sofa saved (${JSON.stringify(saved)})`);
      assert(sofa.x > 0 && sofa.x < 8 && sofa.z > 0 && sofa.z < 6, `sofa outside the room: ${sofa.x}, ${sofa.z}`);
      await page.getByRole("button", { name: "Select sofa" }).click();
      await page.keyboard.press("r");
      await sleep(1200);
      saved = await roomFurniture();
      assert(saved.find((f) => f.id === sofa.id)?.rot === 90, "R did not rotate the sofa");
      await page.keyboard.press("Delete");
      await sleep(1200);
      saved = await roomFurniture();
      assert(!saved.some((f) => f.id === sofa.id), "Delete did not remove the sofa");
      await shot(page, "studio-furnished");
      return `sofa at (${sofa.x}, ${sofa.z}), rotated, removed`;
    });

    await check("walk: furniture blocks walking (an armchair in the way stops you)", async () => {
      // Put an armchair in the middle of the Atrium through the API, then walk into it.
      const rs = await json(await api.get(`${BASE}/api/rooms?palace=${ids.palace}`), 200);
      const atrium = rs.find((r) => r.id === A.id);
      await json(
        await api.put(`${BASE}/api/rooms/${A.id}`, { data: { metadata: { ...atrium.metadata, furniture: [{ id: "chair1", kind: "armchair", x: 4, z: 3, rot: 0 }] } } }),
        200
      );
      await openWalk(page, A.id);
      await page.evaluate(() => window.__walk.teleport(4, 1, 0, 0)); // south of the chair, facing north
      await page.keyboard.down("w");
      await sleep(1500);
      await page.keyboard.up("w");
      const pose = await page.evaluate(() => ({ ...window.__walk.pose() }));
      // Chair front edge is at z = 3 - 0.425; the walker (r 0.35) must stop short of it.
      assert(pose.z < 3 - 0.425 - 0.3, `walked into the armchair (z ${pose.z.toFixed(2)})`);
      await json(await api.put(`${BASE}/api/rooms/${A.id}`, { data: { metadata: { ...atrium.metadata, furniture: [] } } }), 200);
      return `stopped at z ${pose.z.toFixed(2)}`;
    });

    // -------------------------------------------------------------- room editor
    let box, cam;
    const placeBtn = () => page.getByRole("button", { name: "+ Locus & cards (P)" });
    const selectBtn = () => page.getByRole("button", { name: "Select / drag (V)" });
    const cardForm = () => page.getByRole("dialog", { name: "Add flashcards to this locus" });
    async function openEditor(query = "") {
      await page.goto(`${BASE}/rooms/${A.id}${query}`);
      await page.locator("canvas").first().waitFor();
      await page.waitForLoadState("networkidle");
      await sleep(1200);
      box = await page.locator("canvas").first().boundingBox();
      cam = editorCamera(A);
    }
    async function ensureEditor() {
      if (!box || !page.url().includes(`/rooms/${A.id}`)) await openEditor();
    }
    async function drag(from, to, steps = 12) {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await page.mouse.up();
    }

    await check("editor: hover readout, click a wall to place, Undo", async () => {
      await openEditor("?tool=place");
      const before = (await lociOf(A.id)).length;
      const pt = project(cam, box, { x: 6.5, y: 1.6, z: 5.99 });
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.move(pt.x + 1, pt.y);
      const readout = page.getByText(/North wall · .* m along · .* m high/);
      await readout.waitFor({ timeout: 5000 });
      const txt = (await readout.textContent()).trim();
      await page.mouse.click(pt.x + 1, pt.y);
      await cardForm().waitFor({ timeout: 8000 });
      await page.getByText(/Placed locus \d+/).waitFor({ timeout: 5000 });
      const after = await lociOf(A.id);
      assert(after.length === before + 1, `loci ${before} -> ${after.length}`);
      const placed = after.find((l) => !ids.lociA.includes(l.id));
      assert(placed.wall === "north" && Math.abs(placed.wall_offset * 8 - 6.5) < 0.35, `placed at ${placed.wall} ${placed.wall_offset}`);
      await shot(page, "editor-placed");
      await page.getByRole("button", { name: "Undo" }).click();
      await sleep(1200);
      assert((await lociOf(A.id)).length === before, "Undo did not remove the locus");
      return txt;
    });

    await check("editor: Esc closes the card form (stays placing), Ctrl+Z undoes", async () => {
      await ensureEditor();
      if ((await placeBtn().getAttribute("aria-pressed")) !== "true") await placeBtn().click();
      const before = (await lociOf(A.id)).length;
      const pt = project(cam, box, { x: 7.2, y: 2.0, z: 5.99 });
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.click(pt.x, pt.y);
      await cardForm().waitFor({ timeout: 8000 });
      await page.keyboard.press("Escape");
      await cardForm().waitFor({ state: "detached", timeout: 5000 });
      assert((await placeBtn().getAttribute("aria-pressed")) === "true", "Esc in the card form also left place mode");
      assert((await lociOf(A.id)).length === before + 1, "placement didn't land");
      await page.keyboard.press("Control+z");
      await sleep(1200);
      assert((await lociOf(A.id)).length === before, "Ctrl+Z did not undo");
    });

    await check("editor: clicking the doorway refuses and places nothing", async () => {
      await ensureEditor();
      if ((await placeBtn().getAttribute("aria-pressed")) !== "true") await placeBtn().click();
      const before = (await lociOf(A.id)).length;
      const pt = project(cam, box, { x: 4.0, y: 1.0, z: 5.99 });
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.click(pt.x, pt.y);
      await page.getByText("That's a doorway. Click a solid stretch of wall instead.").waitFor({ timeout: 5000 });
      await sleep(600);
      assert((await lociOf(A.id)).length === before, "a locus landed in the doorway");
    });

    await check("editor: P / V / Esc switch tools", async () => {
      await ensureEditor();
      await page.mouse.move(box.x + 5, box.y + box.height - 5);
      await page.keyboard.press("v");
      assert((await selectBtn().getAttribute("aria-pressed")) === "true", "V did not select");
      await page.keyboard.press("p");
      assert((await placeBtn().getAttribute("aria-pressed")) === "true", "P did not enter place mode");
      await page.keyboard.press("Escape");
      assert((await selectBtn().getAttribute("aria-pressed")) === "true", "Esc did not leave place mode");
    });

    await check("editor: drag keeps height, Shift-drag lifts, the same marker drags twice", async () => {
      await ensureEditor();
      if ((await selectBtn().getAttribute("aria-pressed")) !== "true") await selectBtn().click();
      const l = (await lociOf(A.id)).find((x) => x.id === ids.lociA[0]);
      await drag(project(cam, box, { x: l.wall_offset * 8, y: 1.5, z: 6 - PLAQUE_OFFSET }), project(cam, box, { x: 2.6, y: 1.5, z: 5.99 }));
      await sleep(1500);
      const moved = (await lociOf(A.id)).find((x) => x.id === l.id);
      assert(Math.abs(moved.wall_offset * 8 - 2.6) < 0.4, `drag landed at ${(moved.wall_offset * 8).toFixed(2)} m`);
      assert(Math.abs(moved.height - 1.5) < 0.01, `plain drag changed height to ${moved.height}`);
      await page.getByText(/Moved Spot 1/).waitFor({ timeout: 3000 });
      // Second drag of the same marker, with the undo snackbar still up.
      const from = project(cam, box, { x: moved.wall_offset * 8, y: 1.5, z: 6 - PLAQUE_OFFSET });
      const to = project(cam, box, { x: moved.wall_offset * 8, y: 2.3, z: 5.99 });
      await page.keyboard.down("Shift");
      await drag(from, to, 10);
      await page.keyboard.up("Shift");
      await sleep(1500);
      const lifted = (await lociOf(A.id)).find((x) => x.id === l.id);
      assert(lifted.height > 1.9, `Shift-drag height ${lifted.height}`);
      return `${(moved.wall_offset * 8).toFixed(2)} m along, then ${lifted.height} m high`;
    });

    await check("editor: Spread evenly on the west wall", async () => {
      await ensureEditor();
      await page.getByRole("button", { name: /^Spot 3/ }).click();
      const btn = page.getByRole("button", { name: /Spread 2 loci evenly on the west wall/ });
      await btn.waitFor({ timeout: 5000 });
      const west = async () => (await lociOf(A.id)).filter((x) => x.wall === "west").map((x) => x.wall_offset).sort();
      const before = await west();
      await btn.click();
      await sleep(1500);
      const after = await west();
      assert(JSON.stringify(before) !== JSON.stringify(after), "nothing moved");
      return `${before.join(", ")} -> ${after.join(", ")}`;
    });

    await check("editor: header Import deck leaves place mode, no locus in the doorway", async () => {
      await ensureEditor();
      await page.keyboard.press("p");
      const before = (await lociOf(A.id)).length;
      await page.getByRole("button", { name: "Import deck", exact: true }).click();
      await page.locator("select").filter({ hasText: "Pick a deck" }).first().selectOption({ label: "Import Me" });
      await page.getByRole("button", { name: /Select all 3/ }).click();
      await page.getByRole("button", { name: "Import", exact: true }).click();
      await page.getByText(/Imported 3 cards/).waitFor({ timeout: 10000 });
      await sleep(1200);
      const all = await lociOf(A.id);
      assert(all.length === before + 3, "import did not add 3 loci");
      assert((await selectBtn().getAttribute("aria-pressed")) === "true", "still in place mode after a bulk import");
      // Door: centre 0.5, half-width 0.6 m + 0.15 m clearance, on an 8 m wall.
      const inDoor = all.filter((l) => l.wall === "north" && Math.abs(l.wall_offset - 0.5) <= 0.75 / 8);
      assert(inDoor.length === 0, `locus in the doorway: ${inDoor.map((l) => `${l.label}@${l.wall_offset}`).join(", ")}`);
    });

    await check("editor: minimap room tap opens the other room", async () => {
      await ensureEditor();
      await page.locator(`${MAP} rect`).filter({ has: page.locator("title", { hasText: "Library" }) }).first().click({ force: true });
      await page.waitForURL(new RegExp(`/rooms/${ids.B.id}`), { timeout: 10000 });
    });

    // -------------------------------------------------------------- locus panel <-> decks
    await check("decks: per-locus Import from deck, Send to deck, Push, Unlink", async () => {
      const panel = page.locator("aside");
      await page.goto(`${BASE}/rooms/${ids.B.id}`);
      await page.locator("canvas").first().waitFor();
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: /^Shelf/ }).click();
      await panel.getByRole("button", { name: "Import from deck" }).click();
      await panel.locator("select").filter({ hasText: "Pick a deck" }).selectOption({ label: "Panel Deck" });
      await panel.getByRole("button", { name: /Select all 2/ }).click();
      await panel.getByRole("button", { name: "Import", exact: true }).click();
      await panel.getByText(/Imported 2 cards/).waitFor({ timeout: 10000 });
      await sleep(800);
      assert((await panel.getByText("↔ Linked to deck").count()) === 2, "imported cards not shown as linked");
      await panel.getByRole("button", { name: "Send to deck" }).first().click();
      await panel.getByPlaceholder("Deck title").fill("Sent From Shelf");
      await panel.locator(".card-base").getByRole("button", { name: "Send to deck" }).click();
      await panel.getByText(/1 card added to the deck \(2 already linked, skipped\)/).waitFor({ timeout: 10000 });
      await panel.getByRole("button", { name: "Close" }).click();
      await sleep(1200);
      assert((await panel.getByText("↔ Linked to deck").count()) === 3, "sent card not shown as linked");
      // Push: edit the card, push, the flashcard follows.
      const cards = await json(await api.get(`${BASE}/api/cards?locus=${ids.shelf.id}`), 200);
      const c = cards.find((x) => x.front?.text === "Author of Hamlet?");
      await json(await api.put(`${BASE}/api/cards/${c.id}`, { data: { front: "Who wrote Hamlet?" } }), 200);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: /^Shelf/ }).click();
      const row = panel.locator("div.group").filter({ hasText: "Who wrote Hamlet?" });
      await row.getByRole("button", { name: "Push to deck" }).click();
      await panel.getByText("Pushed to the deck card.").waitFor({ timeout: 8000 });
      const f = await json(await api.get(`${BASE}/api/flashcards/${c.source_flashcard_id}`), 200);
      assert(f.question === "Who wrote Hamlet?", `flashcard still "${f.question}"`);
      await row.getByRole("button", { name: "Unlink" }).click();
      await panel.getByText("Unlinked.").waitFor({ timeout: 8000 });
      await sleep(1000);
      const after = (await json(await api.get(`${BASE}/api/cards?locus=${ids.shelf.id}`), 200)).find((x) => x.id === c.id);
      const f2 = await json(await api.get(`${BASE}/api/flashcards/${c.source_flashcard_id}`), 200);
      assert(!after.source_flashcard_id && !f2.source_card_id, "link not cleared on both sides");
    });

    // -------------------------------------------------------------- walk
    async function openWalk(p, roomId, query = "?debug=1") {
      await p.goto(`${BASE}/walk/${roomId}${query}`);
      await p.locator("canvas").first().waitFor({ timeout: 15000 });
      if (query.includes("debug")) await p.waitForFunction(() => !!window.__walk, null, { timeout: 15000 });
      await sleep(1500);
    }

    await check("walk: renders, minimap wedge follows the player", async () => {
      await openWalk(page, A.id);
      const st = await pixelStats(page, await page.locator("canvas").first().screenshot());
      assert(st.colors > 20, "walk canvas looks blank");
      const wedge = page.locator(`${MAP} polygon`);
      await page.evaluate(() => window.__walk.teleport(2, 2, 0, 0));
      await sleep(500);
      const p1 = await wedge.getAttribute("points");
      await page.evaluate(() => window.__walk.teleport(6, 4, Math.PI / 2, 0));
      await sleep(500);
      const p2 = await wedge.getAttribute("points");
      assert(p1 && p2 && p1 !== p2, "wedge did not move");
      await shot(page, "walk");
    });

    await check("perf: walk, desktop 1440x900", async () => {
      if (!page.url().includes(`/walk/${A.id}`)) await openWalk(page, A.id);
      return recordPerf(page, "walk 1440x900");
    });

    await check("walk: minimap locus tap glides there", async () => {
      if (!page.url().includes(`/walk/${A.id}`)) await openWalk(page, A.id);
      await page.evaluate(() => window.__walk.teleport(1, 1, 0, 0));
      await sleep(300);
      const p0 = await page.evaluate(() => ({ ...window.__walk.pose() }));
      await page.locator(`${MAP} circle`).filter({ has: page.locator("title", { hasText: "Go to locus 3" }) }).click({ force: true });
      await sleep(1800);
      const p1 = await page.evaluate(() => ({ ...window.__walk.pose() }));
      const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      assert(moved > 0.5, `moved only ${moved.toFixed(2)} m`);
      return `moved ${moved.toFixed(2)} m`;
    });

    await check("walk: clicking a plaque walks you to it", async () => {
      if (!page.url().includes(`/walk/${A.id}`)) await openWalk(page, A.id);
      await page.evaluate(() => window.__walk.teleport(4, 1.2, 0, 0)); // south of centre, facing the north wall
      await sleep(400);
      const pose = await page.evaluate(() => ({ ...window.__walk.pose() }));
      const target = (await lociOf(A.id)).find((l) => l.wall === "north" && Math.abs(l.height - 1.5) < 0.01);
      assert(target, "no north-wall locus at 1.5 m");
      // Project the plaque centre through the walk camera (fov 62, eye height from lib/walk.ts).
      const box = await page.locator("canvas").first().boundingBox();
      const cam = { pos: [pose.x, EYE_HEIGHT, -pose.z], fov: 62 };
      const fwd = [Math.sin(pose.yaw) * Math.cos(pose.pitch), Math.sin(pose.pitch), -Math.cos(pose.yaw) * Math.cos(pose.pitch)];
      cam.target = [cam.pos[0] + fwd[0], cam.pos[1] + fwd[1], cam.pos[2] + fwd[2]];
      const pt = project(cam, box, { x: target.wall_offset * 8, y: target.height, z: 6 - PLAQUE_OFFSET - 0.02 });
      await page.mouse.click(pt.x, pt.y);
      await sleep(1800);
      const after = await page.evaluate(() => ({ ...window.__walk.pose() }));
      const d0 = Math.hypot(pose.x - target.wall_offset * 8, pose.z - 6);
      const d1 = Math.hypot(after.x - target.wall_offset * 8, after.z - 6);
      assert(d1 < d0 - 0.5, `did not approach ${target.label}: ${d0.toFixed(2)} m -> ${d1.toFixed(2)} m`);
      return `${target.label}: ${d0.toFixed(1)} m -> ${d1.toFixed(1)} m`;
    });

    await check("walk: minimap door tap opens the next room", async () => {
      await page.locator(`${MAP} circle`).filter({ has: page.locator("title", { hasText: "Go to Library" }) }).click({ force: true });
      await page.waitForURL(new RegExp(`/walk/${ids.B.id}`), { timeout: 10000 });
    });

    await check("walk: door prompt near the linked door walks through", async () => {
      await openWalk(page, A.id);
      await page.evaluate(() => window.__walk.teleport(4, 5.2, 0, 0));
      const go = page.getByRole("button", { name: /Go to Library/ });
      await go.waitFor({ timeout: 6000 });
      await go.click();
      await page.waitForURL(new RegExp(`/walk/${ids.B.id}`), { timeout: 10000 });
    });

    await check("study: each card shows its locus and room on the level map", async () => {
      await page.goto(`${BASE}/study/${A.id}`);
      await page.getByText(/Locus \d+ · Atrium/).waitFor({ timeout: 15000 });
      assert((await page.locator(`${MAP}`).count()) === 1, "no level map beside the card");
      await page.getByRole("button", { name: "Show Answer" }).click();
      // The question stays visible under the revealed answer.
      const q = (await json(await api.get(`${BASE}/api/reviews?room=${A.id}`), 200)).items.length;
      assert(q > 0, "no cards to study");
    });

    await check("tour: an auto tour waits for the due order and faces the first due locus", async () => {
      // Make Spot 1's card not due, so due-first starts somewhere else than walk order.
      const cards = await json(await api.get(`${BASE}/api/cards?room=${A.id}`), 200);
      const spot1 = cards.find((c) => c.locus_id === ids.lociA[0]);
      await json(await api.post(`${BASE}/api/reviews`, { data: { card_id: spot1.id, correct: true } }), 200);
      await openWalk(page, A.id, "?tour=1&debug=1");
      const tourCard = page.getByRole("dialog", { name: "Tour card" });
      await tourCard.waitFor({ timeout: 15000 });
      await sleep(1800); // glide
      const label = (await tourCard.locator("p.text-lg").first().textContent()).trim();
      assert(label !== "Spot 1", "tour started at the not-due Spot 1 (walk order)");
      const pose = await page.evaluate(() => ({ ...window.__walk.pose() }));
      const loci = await lociOf(A.id);
      // Which locus does the camera face? (smallest angle between gaze and locus direction)
      const wallPoint = (l) => {
        const t = l.wall_offset;
        return { north: [t * 8, 6], south: [t * 8, 0], east: [8, t * 6], west: [0, t * 6] }[l.wall];
      };
      const fwd = [Math.sin(pose.yaw), Math.cos(pose.yaw)];
      const faced = loci
        .map((l) => {
          const [x, z] = wallPoint(l);
          const v = [x - pose.x, z - pose.z];
          const n = Math.hypot(...v);
          return { label: l.label, angle: Math.acos((v[0] * fwd[0] + v[1] * fwd[1]) / n) };
        })
        .sort((a, b) => a.angle - b.angle)[0];
      assert(faced.label === label, `camera faces "${faced.label}" but the card is for "${label}"`);
      return `first stop ${label}, camera facing it`;
    });

    await check("tour: Due first / Walkthrough, MCQ grading, Full summary", async () => {
      await openWalk(page, A.id, "");
      await page.getByRole("button", { name: "Walkthrough" }).click();
      assert((await page.getByRole("button", { name: "Walkthrough" }).getAttribute("aria-pressed")) === "true", "toggle failed");
      await page.getByRole("button", { name: "Due first" }).click();
      await page.getByRole("button", { name: /Start tour/ }).click();
      const card = page.getByRole("dialog", { name: "Tour card" });
      await card.waitFor();
      let graded = 0;
      for (let step = 0; step < 20 && !(await page.getByText("Tour complete").isVisible().catch(() => false)); step++) {
        const choices = card.getByRole("group", { name: "Answer choices" });
        if (await choices.isVisible().catch(() => false)) {
          await choices.getByRole("button").first().click();
          graded++;
        } else if (await card.getByRole("button", { name: /^Reveal/ }).isVisible().catch(() => false)) {
          await card.getByRole("button", { name: /^Reveal/ }).click();
          await card.getByRole("button", { name: /Got it/ }).click();
          graded++;
        } else if (await card.getByRole("button", { name: /Next/ }).isVisible().catch(() => false)) {
          await card.getByRole("button", { name: /Next/ }).click();
        }
        await sleep(450);
      }
      await page.getByText("Tour complete").waitFor({ timeout: 8000 });
      const summary = page.getByRole("link", { name: "Full summary" });
      await summary.waitFor({ timeout: 10000 });
      const recalled = await page.getByText(/You recalled \d+ of \d+ cards/).textContent();
      await summary.click();
      await page.waitForURL(/\/results/, { timeout: 10000 });
      return `${graded} graded; ${recalled}`;
    });

    await check("tour: palace tour room stepper", async () => {
      await page.goto(`${BASE}/walk/palace/${ids.palace}?tour=1`);
      await page.getByText(/Palace tour · room 1 of 2 · Atrium/).waitFor({ timeout: 15000 });
      await page.getByRole("dialog", { name: "Tour card" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Library →" }).click();
      await page.getByText(/Palace tour · room 2 of 2 · Library/).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "← Atrium" }).waitFor({ timeout: 5000 });
    });

    // -------------------------------------------------------------- phone
    await check("phone: card hides joystick, Keep walking restores minimap + joystick, HUD above labels", async () => {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, storageState: await ctx.storageState() });
      const p = await phone.newPage();
      try {
        await openWalk(p, A.id);
        const st = await pixelStats(p, await p.locator("canvas").first().screenshot());
        assert(st.colors > 20, "phone canvas looks blank");
        const dismiss = p.getByRole("button", { name: "Dismiss locus" });
        if (await dismiss.isVisible().catch(() => false)) {
          assert((await p.getByLabel("Move joystick").count()) === 0, "joystick drawn over the locus card");
          await dismiss.click();
        }
        await p.locator(MAP).waitFor({ timeout: 5000 });
        await p.getByLabel("Move joystick").waitFor({ timeout: 5000 });
        for (const name of ["Start tour", "Edit room"]) {
          const b = p.getByRole("button", { name: new RegExp(name) }).or(p.getByRole("link", { name: new RegExp(name) })).first();
          if (!(await b.isVisible().catch(() => false))) continue;
          const bb = await b.boundingBox();
          const onTop = await p.evaluate(({ x, y, name }) => (document.elementFromPoint(x, y)?.textContent ?? "").includes(name), { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, name });
          assert(onTop, `a 3D label covers "${name}"`);
        }
        await shot(p, "phone-walk");
        perf.push({ label: "walk 390x844 @3x (phone)", ...(await frameStats(p)) });
        const ph = perf[perf.length - 1];
        if (GPU !== "software") assert(ph.fps >= PERF_FLOOR_FPS, `phone walk ${ph.fps} fps`);
        // Phone tour: MCQ choices tappable (no joystick on top of the card).
        await p.goto(`${BASE}/walk/${A.id}?tour=1`);
        const tc = p.getByRole("dialog", { name: "Tour card" });
        await tc.waitFor({ timeout: 15000 });
        assert((await p.getByLabel("Move joystick").count()) === 0, "joystick drawn over the tour card");
        const choice = tc.getByRole("group", { name: "Answer choices" }).getByRole("button").first();
        if (await choice.isVisible().catch(() => false)) await choice.tap();
        return `phone walk ${ph.fps} fps, p95 ${ph.p95} ms`;
      } finally {
        await phone.close();
      }
    });

    await check("phone: a card opening mid-push leaves the joystick under the thumb until release", async () => {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, storageState: await ctx.storageState() });
      const p = await phone.newPage();
      try {
        await openWalk(p, ids.B.id);
        // Facing west with Shelf (east wall) behind: no gaze focus, 2.4 m away.
        await p.evaluate(() => window.__walk.teleport(5.6, 2.5, -Math.PI / 2, 0));
        await sleep(600);
        const dismiss = p.getByRole("button", { name: "Dismiss locus" });
        assert(!(await dismiss.isVisible().catch(() => false)), "a locus card is already open at the start");
        const joy = p.getByLabel("Move joystick");
        await joy.waitFor({ timeout: 5000 });
        const jb = await joy.boundingBox();
        const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2;
        const cdp = await phone.newCDPSession(p);
        const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: cx, y, id: 1 }] });
        // Pull back: walk backwards into Shelf's 1.4 m reach.
        await touch("touchStart", cy);
        await touch("touchMove", cy + 35);
        await dismiss.waitFor({ timeout: 6000 }).catch(() => {});
        const cardUp = await dismiss.isVisible().catch(() => false);
        const heldVisible = (await joy.count()) === 1;
        await touch("touchEnd", cy + 35);
        await sleep(400);
        const hiddenAfter = (await joy.count()) === 0;
        const a = await p.evaluate(() => ({ ...window.__walk.pose() }));
        await sleep(600);
        const b = await p.evaluate(() => ({ ...window.__walk.pose() }));
        assert(cardUp, "walking backwards into reach did not open Shelf's card");
        assert(heldVisible, "joystick vanished from under the thumb when the card opened");
        assert(hiddenAfter, "joystick still covering the card after release");
        assert(Math.hypot(b.x - a.x, b.z - a.z) < 0.02, "player keeps moving after release");
        await shot(p, "phone-card-after-release");
      } finally {
        await phone.close();
      }
    });

    // -------------------------------------------------------------- night sky
    await check("sky: stars visible overhead and near the horizon at night (walk + palace overview)", async () => {
      await page.evaluate(() => localStorage.setItem("mp-theme", "dark"));
      try {
        await openWalk(page, A.id);
        const notes = [];
        for (const [label, pitch, minBlobs] of [
          ["walk zenith", 1.25, 25],
          ["walk horizon", 0.35, 15],
        ]) {
          await page.evaluate((pitch) => window.__walk.teleport(4, -8, 0, pitch), pitch); // outside, looking north over the palace
          await sleep(1200);
          const png = await page.locator("canvas").first().screenshot({ path: path.join(OUT, `sky-${label.replace(" ", "-")}.png`) });
          const s = await pixelStats(page, png, { x0: 0.2, y0: 0.05, x1: 0.8, y1: 0.45 });
          notes.push(`${label} ${s.blobs}`);
          assert(s.darkShare > 0.5, `${label}: sky not dark (${Math.round(s.darkShare * 100)}%)`);
          assert(s.blobs >= minBlobs, `${label}: only ${s.blobs} stars in the centre band`);
        }
        await page.goto(`${BASE}/palaces/${ids.palace}`);
        await page.waitForLoadState("networkidle");
        await page.getByRole("tab", { name: "3D Studio" }).click();
        const canvas = page.locator("canvas").first();
        await canvas.waitFor({ timeout: 20000 });
        await sleep(2000);
        // Orbit down to eye level so the sky fills the top of the view.
        const b = await canvas.boundingBox();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.8);
        await page.mouse.down();
        for (let i = 1; i <= 15; i++) await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.8 - i * 25);
        await page.mouse.up();
        await sleep(800);
        const png = await canvas.screenshot({ path: path.join(OUT, "sky-palace-overview.png") });
        const s = await pixelStats(page, png, { x0: 0.05, y0: 0.03, x1: 0.95, y1: 0.3 });
        notes.push(`palace ${s.blobs}`);
        assert(s.blobs >= 10, `palace overview: only ${s.blobs} stars`);
        return notes.join(", ");
      } finally {
        await page.evaluate(() => localStorage.removeItem("mp-theme"));
      }
    });

    // -------------------------------------------------------------- print, shell
    await check("print: print media hides chrome, PDF renders the blueprint", async () => {
      await page.goto(`${BASE}/palaces/${ids.palace}/print`);
      await page.locator("svg").first().waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: /Copy text blueprint/ }).waitFor();
      await page.emulateMedia({ media: "print" });
      try {
        const hidden = await page.evaluate(() => ({
          // checkVisibility() accounts for hidden ancestors (print:hidden sits on the wrappers).
          nav: document.querySelector("nav").checkVisibility() ? "visible" : "none",
          button: [...document.querySelectorAll("button")].find((b) => /Print \/ Save as PDF/.test(b.textContent)).checkVisibility() ? "visible" : "none",
          svg: Math.max(0, ...[...document.querySelectorAll("svg")].map((el) => el.getBoundingClientRect().height)),
        }));
        assert(hidden.nav === "none", "navbar prints");
        assert(hidden.button === "none", "Print button prints");
        assert(hidden.svg > 100, `blueprint SVG ${hidden.svg}px tall in print`);
        const pdf = path.join(OUT, "print.pdf");
        await page.pdf({ path: pdf, format: "A4", margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" } });
        let pages = (fs.readFileSync(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        try {
          pages = Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/^Pages:\s+(\d+)/m)[1]);
          execFileSync("pdftoppm", ["-png", "-r", "60", "-f", "1", "-l", "2", pdf, path.join(OUT, "print-page")]);
        } catch {
          // poppler-utils not installed: keep the regex count, skip the preview
        }
        assert(pages >= 1 && pages <= 4, `${pages} pages`);
        return `${pages} page(s) -> ${path.relative(root, pdf)}`;
      } finally {
        await page.emulateMedia({ media: null });
      }
    });

    await check("landing: logged-out visitors see the demo palace walk", async () => {
      const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const p = await anon.newPage();
        await p.goto(`${BASE}/`);
        const demo = p.getByRole("img", { name: /memory palace seen from above/ });
        await demo.waitFor({ timeout: 10000 });
        assert((await demo.locator("animateMotion").count()) === 1, "no walker on the demo route");
        assert((await demo.locator("circle").count()) >= 12, "demo loci missing");
        await p.getByRole("link", { name: /Build your first palace/ }).waitFor();
        assert((await p.getByRole("button", { name: /Continue with/ }).count()) === 0 || !!process.env.GOOGLE_CLIENT_ID, "unconfigured OAuth button shown");
      } finally {
        await anon.close();
      }
    });

    await check("shell: unknown route renders the 404 page", async () => {
      const r = await page.goto(`${BASE}/definitely-not-here`);
      assert(r.status() === 404, `status ${r.status()}`);
    });

    // -------------------------------------------------------------- profile (last: changes the login)
    await check("profile: rename, change email + password, sign in with the new ones", async () => {
      await page.goto(`${BASE}/profile`);
      await page.locator("#profile-name").waitFor({ timeout: 10000 });
      await page.fill("#profile-name", "Live Check Renamed");
      await page.fill("#profile-email", EMAIL2);
      await page.locator("form").filter({ has: page.locator("#profile-name") }).getByRole("button").first().click();
      await sleep(1500);
      const prof = await json(await api.get(`${BASE}/api/profile`), 200);
      assert(prof.name === "Live Check Renamed" && prof.email === EMAIL2, `profile is ${prof.name} <${prof.email}>`);
      await page.fill("#pw-current", PW1);
      await page.fill("#pw-new", PW2);
      await page.fill("#pw-confirm", PW2);
      await page.locator("form").filter({ has: page.locator("#pw-current") }).getByRole("button").first().click();
      await sleep(1500);
      const login = async (password) => {
        const c = await browser.newContext();
        const p = await c.newPage();
        await p.goto(`${BASE}/login`);
        await p.fill("input[type=email]", EMAIL2);
        await p.fill("input[type=password]", password);
        await p.getByRole("button", { name: "Log In" }).click();
        const ok = await p.waitForURL(/\/home/, { timeout: 8000 }).then(() => true, () => false);
        await c.close();
        return ok;
      };
      assert(await login(PW2), "new password does not sign in");
      assert(!(await login(PW1)), "old password still signs in");
    });
  } catch {
    // An `always` setup step failed; it is already reported.
  } finally {
    await browser.close();
    if (!KEEP && userIds.length) await cleanup(userIds).catch((e) => console.log("cleanup error:", e.message));
    else if (KEEP) console.log(`--keep: left ${EMAIL2} / ${PW2} (or ${EMAIL} / ${PW1}) in place`);
    if (server) server.kill();

    const failed = results.filter((r) => !r.ok);
    if (perf.length) {
      console.log("\nframe times (rAF; headless caps near 60 fps):");
      for (const p of perf) console.log(`  ${p.label.padEnd(28)} ${String(p.fps).padStart(3)} fps   p95 ${p.p95} ms   ${p.slow}% > 25 ms`);
    }
    if (pageErrors.length) console.log(`\npage errors (${pageErrors.length}):\n  ${[...new Set(pageErrors)].slice(0, 10).join("\n  ")}`);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed on ${GPU} GPU (${renderer})`);
    if (failed.length) {
      console.log(failed.map((f) => `  ✗ ${f.name}: ${f.note}`).join("\n"));
      exitCode = 1;
    }
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ renderer, gpu: GPU, results, perf, pageErrors }, null, 2));
    process.exit(exitCode);
  }
})();
