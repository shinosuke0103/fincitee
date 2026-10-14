/**
 * Protocol-level check of `src/lib/api.ts` (RealTransport) against the stub
 * server in ./stub_api.py. Bundles the real adapter with esbuild, then walks
 * the full lifecycle: health → list → upload → create → stream → re-hydrate
 * → delete, asserting the behaviours the UI relies on.
 *
 *   cd backend && uv run python ../frontend/scripts/adapter-check/stub_api.py
 *   cd frontend && npm run check:adapter          # STUB_URL to override
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const API = process.env.STUB_URL ?? "http://127.0.0.1:8011";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = await mkdtemp(join(tmpdir(), "fincite-adapter-"));

await build({
  entryPoints: [join(root, "src/lib/api.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: join(out, "api.mjs"),
  logLevel: "error",
  define: {
    "import.meta.env.VITE_USE_MOCK": '"false"',
    "import.meta.env.VITE_API_URL": JSON.stringify(API),
  },
});
const { api } = await import(pathToFileURL(join(out, "api.mjs")).href);

const step = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? `  ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
};

try {
  // health
  const { data } = await api.health();
  step("health maps alive → healthy", data.status === "healthy");

  // documents
  const docs = await api.listDocuments();
  step("documents listed and mapped", docs.length >= 2, `${docs.length} docs`);
  step("timestamps normalised to UTC", docs.every((d) => d.uploaded_at.endsWith("Z")));
  step("fiscal year formatted", docs.some((d) => d.metadata.fiscal_year === "FY2024-25"));
  step("page_count / file_size surfaced", docs.some((d) => d.metadata.pages > 0 && d.metadata.file_size > 0));

  // upload contract (server side) — the browser path uses XHR, the shape is identical
  const pdf = new Blob(["%PDF-1.4\n%adapter-check\n"], { type: "application/pdf" });
  const form = new FormData();
  form.append("file", pdf, "infosys-annual-report-2025.pdf");
  form.append("company_symbol", "INFY");
  form.append("financial_year", "2025");
  const up = await fetch(`${API}/api/document/upload`, { method: "POST", body: form });
  const upBody = await up.json();
  step("upload → 201 with flat document body", up.status === 201 && typeof upBody.id === "string" && upBody.status === "indexed");
  const again = await fetch(`${API}/api/document/upload`, { method: "POST", body: form });
  step("duplicate upload returns the same document", (await again.json()).id === upBody.id);
  const bad = await fetch(`${API}/api/document/upload`, { method: "POST", body: (() => { const f = new FormData(); f.append("file", new Blob(["hello"], { type: "text/plain" }), "x.txt"); return f; })() });
  step("non-PDF rejected with detail", bad.status === 400 && typeof (await bad.json()).detail === "string");

  // conversation
  const convo = await api.createConversation({ title: "Revenue growth", document_scope: [docs[0].id, docs[1].id] });
  step("conversation created with scope + client title", convo.document_scope.length === 2 && convo.title === "Revenue growth");

  // stream
  const events = [];
  await new Promise((resolve, reject) => {
    api.streamMessage(convo.id, "How did revenue grow?", {
      onUserMessage: (m) => events.push(["user", m]),
      onAssistantCreated: (m) => events.push(["assistant", m]),
      onSubProcess: (id, patch) => events.push(["sub", id, patch]),
      onToken: () => events.push(["token"]),
      onContent: (c) => events.push(["content", c]),
      onDone: (r) => { events.push(["done", r]); resolve(); },
      onError: (e) => { events.push(["error", e]); reject(new Error(e)); },
    });
  });
  const subs = events.filter((e) => e[0] === "sub");
  const stepIds = new Set(subs.map((s) => s[1]));
  const names = [...new Map(subs.map((s) => [s[1], s[2].name])).values()].filter(Boolean);
  step("user echo precedes assistant placeholder", events[0][0] === "user" && events[1][0] === "assistant");
  step("sub-processes keyed by index and upserted", stepIds.size >= 5 && subs.length > stepIds.size, `${stepIds.size} steps / ${subs.length} events`);
  step("noisy internals (llm) hidden, human names applied", !names.includes("LLM call") && names.includes("Agent reasoning") && names.includes("Vector retrieval"));
  step("sub-question text becomes the step name", names.some((n) => /filing say about/.test(n)));
  step("every step finished with a duration", subs.filter((s) => s[2].status === "completed").every((s) => s[2].duration_ms >= 1));
  const contents = events.filter((e) => e[0] === "content");
  step("content delivered as growing snapshots (no token path)", contents.length > 3 && events.every((e) => e[0] !== "token"));
  const done = events.find((e) => e[0] === "done")[1];
  step("done carries final content + flattened, ranked citations", done.content.length > 0 && done.sources.length === 4 && done.sources[0].index === 1 && done.sources[0].score >= done.sources.at(-1).score);

  // hydrate
  const hydrated = await api.getConversation(convo.id, "Revenue growth");
  const [u, a] = hydrated.messages;
  step("history re-sorted (user before assistant, microsecond ties broken)", u?.role === "user" && a?.role === "assistant");
  step("persisted trail + citations restored", a.sub_processes.length >= 5 && a.sources.length === 4 && a.status === "completed");

  // delete + empty list
  await api.deleteConversation(convo.id);
  let gone = false;
  try { await api.getConversation(convo.id); } catch { gone = true; }
  step("delete → subsequent fetch fails", gone);
  step("delete is idempotent (404 tolerated)", await api.deleteConversation(convo.id).then(() => true, () => false));
} catch (e) {
  console.error("✗ aborted:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await rm(out, { recursive: true, force: true });
}
console.log(process.exitCode ? "\nadapter check FAILED" : "\nadapter check passed");
