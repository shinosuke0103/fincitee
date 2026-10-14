/**
 * fincite API client
 * ------------------
 * One facade, two transports.
 *
 *   RealTransport  → the FastAPI backend (default)
 *       GET    /api/health/
 *       POST   /api/document/upload                    multipart
 *       GET    /api/document/        ·  GET /api/document/{id}
 *       POST   /api/conversation/    ·  GET / DELETE /api/conversation/{id}
 *       GET    /api/conversation/{id}/message?user_message=…   (SSE)
 *
 *   MockTransport  → in-browser demo corpus (`npm run dev:mock`)
 *
 * The streaming contract (StreamHandlers) is the seam between a transport
 * and the store; components never see either transport.
 */

import type {
  ChatMessage,
  Conversation,
  ConversationCreate,
  DocumentUploadResponse,
  FinDocument,
  HealthResponse,
  MessageSubProcess,
  Source,
  UploadMeta,
} from "./types";
import {
  errorDetail,
  extractSources,
  isVisibleSubProcess,
  mapConversation,
  mapDocument,
  mapSubProcess,
  readSse,
  type WireConversation,
  type WireDocument,
  type WireMessage,
} from "./backend";
import { ANSWER_BANK, FALLBACK_EXCERPT, SEED_DOCUMENTS, type CannedAnswer } from "./mockData";
import { formatFiscalYear, nowIso, uid } from "./format";

export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === "true";
/** Backend origin. Empty = same origin (Vite dev proxy, or the build served next to the API). */
export const BASE_URL: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Anything with the three fields the mock needs; a DOM `File` qualifies. */
export interface FileLike {
  name: string;
  size: number;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  Streaming handler contract                                         */
/* ------------------------------------------------------------------ */

export interface StreamHandlers {
  onUserMessage: (msg: ChatMessage) => void;
  onAssistantCreated: (msg: ChatMessage) => void;
  /** upsert: unknown stepIds are appended to the active assistant message */
  onSubProcess: (stepId: string, patch: Partial<MessageSubProcess>) => void;
  /** append a delta (token-based transports) */
  onToken: (token: string) => void;
  /** replace the full content (snapshot-based transports) */
  onContent: (content: string) => void;
  onDone: (result: { content: string; sources: Source[] }) => void;
  onError: (message: string) => void;
}

/* ================================================================== */
/*  MOCK TRANSPORT                                                     */
/* ================================================================== */

interface PipelineState {
  doc: FinDocument;
  startedAt: number;
}

const STAGE_MS: Record<string, number> = {
  parsing: 1500,
  chunking: 1700,
  embedding: 1600,
  indexing: 1300,
};

class MockTransport {
  documents: FinDocument[];
  pipelines = new Map<string, PipelineState>();
  conversations = new Map<string, Conversation>();

  constructor() {
    this.documents = SEED_DOCUMENTS.map((d) => ({ ...d }));
  }

  /* -------- health -------- */
  health(latencyMs: number): Promise<{ data: HealthResponse; latency: number }> {
    return this.delay(180).then(() => ({
      data: { status: "healthy" },
      latency: Math.max(8, Math.round(latencyMs + Math.random() * 24)),
    }));
  }

  /* -------- documents -------- */
  listDocuments(): Promise<FinDocument[]> {
    return this.delay(320).then(() => this.documents.map((d) => this.refresh(d)));
  }

  getDocument(id: string): Promise<FinDocument> {
    return this.delay(140).then(() => {
      const doc = this.documents.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      return this.refresh(doc);
    });
  }

  /** advance a document's simulated indexing pipeline based on elapsed time */
  private refresh(doc: FinDocument): FinDocument {
    const pipe = this.pipelines.get(doc.id);
    if (!pipe || doc.status === "ready" || doc.status === "failed") return { ...doc };
    const elapsed = Date.now() - pipe.startedAt;
    const stages = Object.keys(STAGE_MS);
    let acc = 0;
    for (const s of stages) {
      acc += STAGE_MS[s];
      if (elapsed < acc) {
        const stageStart = acc - STAGE_MS[s];
        doc.status = s as FinDocument["status"];
        doc.progress = Math.round(((elapsed - stageStart) / STAGE_MS[s]) * 100);
        return { ...doc };
      }
    }
    doc.status = "ready";
    doc.progress = 100;
    this.pipelines.delete(doc.id);
    return { ...doc };
  }

  uploadDocument(
    file: FileLike,
    meta: UploadMeta,
    onProgress: (pct: number) => void
  ): { promise: Promise<DocumentUploadResponse>; cancel: () => void } {
    let cancelled = false;
    const timers: number[] = [];
    const promise = new Promise<DocumentUploadResponse>((resolve, reject) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        reject(new Error("Only PDF filings are supported"));
        return;
      }
      let pct = 0;
      const tick = () => {
        if (cancelled) return reject(new Error("cancelled"));
        pct = Math.min(100, pct + 4 + Math.random() * 9);
        onProgress(Math.round(pct));
        if (pct >= 100) {
          const id = uid("doc");
          const pretty = file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
          const doc: FinDocument = {
            id,
            filename: file.name,
            status: "parsing",
            progress: 0,
            uploaded_at: nowIso(),
            metadata: {
              company_name:
                meta.company_name?.trim() || titleCase(pretty.split(" ").slice(0, 3).join(" ")),
              nse_symbol: meta.company_symbol?.trim().toUpperCase() || guessSymbol(file.name),
              document_type: meta.document_type ?? guessType(file.name),
              fiscal_year: meta.financial_year ? formatFiscalYear(meta.financial_year) : "FY2024-25",
              period: "Unclassified",
              pages: 40 + Math.floor(Math.random() * 220),
              file_size: file.size,
              language: "en",
            },
          };
          this.documents.unshift(doc);
          this.pipelines.set(id, { doc, startedAt: Date.now() });
          resolve({ document: { ...doc } });
          return;
        }
        timers.push(window.setTimeout(tick, 110 + Math.random() * 90));
      };
      timers.push(window.setTimeout(tick, 200));
    });
    return {
      promise,
      cancel: () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      },
    };
  }

  /* -------- conversations -------- */
  createConversation(body: ConversationCreate): Promise<Conversation> {
    return this.delay(160).then(() => {
      const convo: Conversation = {
        id: uid("conv"),
        title: body.title,
        document_scope: body.document_scope ?? [],
        messages: [],
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      this.conversations.set(convo.id, convo);
      return { ...convo };
    });
  }

  getConversation(id: string): Promise<Conversation> {
    return this.delay(120).then(() => {
      const c = this.conversations.get(id);
      if (!c) throw new Error("Conversation not found");
      return { ...c };
    });
  }

  deleteConversation(id: string): Promise<void> {
    return this.delay(140).then(() => void this.conversations.delete(id));
  }

  /* -------- message streaming -------- */
  streamMessage(conversationId: string, question: string, h: StreamHandlers): () => void {
    const timers: number[] = [];
    let cancelled = false;
    const after = (ms: number, fn: () => void) =>
      timers.push(window.setTimeout(() => !cancelled && fn(), ms));

    const convo = this.conversations.get(conversationId);
    const scoped = this.scopedDocs(convo);

    const userMsg: ChatMessage = {
      id: uid("msg"),
      conversation_id: conversationId,
      role: "user",
      content: question,
      status: "completed",
      sub_processes: [],
      sources: [],
      created_at: nowIso(),
    };

    const canned = this.pickAnswer(question, scoped);
    const steps: MessageSubProcess[] = canned.plan.map((p) => ({
      id: uid("sp"),
      name: p.name,
      source: p.source,
      status: "pending",
    }));

    const assistant: ChatMessage = {
      id: uid("msg"),
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      status: "processing",
      sub_processes: steps,
      sources: [],
      created_at: nowIso(),
    };

    // 1. user message lands immediately
    after(0, () => h.onUserMessage(userMsg));

    // 2. assistant placeholder, then walk the sub-process plan
    const start = Date.now();
    after(240, () => {
      h.onAssistantCreated(assistant);
      let t = 260;
      steps.forEach((step, i) => {
        const dur = canned.plan[i].duration_ms || 400;
        after(t, () => h.onSubProcess(step.id, { status: "running" }));
        after(t + dur, () =>
          h.onSubProcess(step.id, {
            status: "completed",
            duration_ms: dur,
            detail: canned.plan[i].detail,
          })
        );
        t += dur;
      });

      // 3. synthesis streams tokens
      after(t + 60, () => h.onSubProcess(steps[steps.length - 1].id, { status: "running" }));
      const tokens = canned.answer.match(/\S+\s*/g) ?? [canned.answer];
      let i = 0;
      const synthStart = t + 60;
      const emit = () => {
        if (cancelled) return;
        const burst = 1 + Math.floor(Math.random() * 2);
        const chunk = tokens.slice(i, i + burst).join("");
        i += burst;
        h.onToken(chunk);
        if (i < tokens.length) {
          timers.push(window.setTimeout(emit, 12 + Math.random() * 26));
          return;
        }
        const synthMs = Date.now() - start - synthStart;
        h.onSubProcess(steps[steps.length - 1].id, {
          status: "completed",
          duration_ms: Math.max(600, synthMs),
          detail: `Grounded generation · cited ${canned.sources.length} sources`,
        });
        h.onDone({
          content: canned.answer,
          sources: canned.sources.map((s, idx) => ({
            index: idx + 1,
            document_id: s.doc_id,
            page: s.page,
            excerpt: s.excerpt,
            score: s.score,
          })),
        });
      };
      after(t + 60, emit);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }

  private scopedDocs(convo?: Conversation | null): FinDocument[] {
    const ready = this.documents.filter((d) => d.status === "ready");
    if (!convo || convo.document_scope.length === 0) return ready;
    const scoped = ready.filter((d) => convo.document_scope.includes(d.id));
    return scoped.length ? scoped : ready;
  }

  private pickAnswer(question: string, scope: FinDocument[]): CannedAnswer {
    const hit = ANSWER_BANK.find((a) => a.patterns.some((p) => p.test(question)));
    if (hit) return hit;
    // generic grounded fallback across the scoped corpus
    const pool = scope.filter((d) => FALLBACK_EXCERPT[d.id]).slice(0, 2);
    const refs = pool.length ? pool : this.documents.slice(0, 2);
    const cites = refs
      .map((d, i) => {
        const f = FALLBACK_EXCERPT[d.id];
        return f
          ? `${d.metadata.company_name} states in its ${d.metadata.fiscal_year} ${
              d.metadata.document_type === "annual_report" ? "annual report" : "filing"
            } that “${f.excerpt.split(". ")[0]}.” [${i + 1}]`
          : "";
      })
      .filter(Boolean)
      .join("\n\n");
    return {
      id: "fallback",
      patterns: [],
      plan: [
        { name: "Built research engine", source: "engine", duration_ms: 420, detail: `${scope.length} retrieval tools` },
        { name: "Planning sub-questions", source: "llm", duration_ms: 590, detail: "Rewrote question · resolved entities" },
        { name: "Vector retrieval", source: "retrieval", duration_ms: 1050, detail: `${refs.length * 3} chunks from ${refs.length} document${refs.length > 1 ? "s" : ""}` },
        { name: "Synthesising answer", source: "llm", duration_ms: 0, detail: "Grounded generation" },
      ],
      answer: `The corpus does not contain a dedicated passage that directly answers this, so here is the closest grounded context I retrieved [1]:\n\n${cites}\n\nIf you can point me at a specific company, period or metric — or upload the relevant filing — I can retrieve a sharper, fully-cited answer.`,
      sources: refs.map((d, i) => {
        const f = FALLBACK_EXCERPT[d.id] ?? { page: 1, excerpt: d.filename };
        return { doc_id: d.id, page: f.page, excerpt: f.excerpt, score: 0.61 - i * 0.04 };
      }),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function guessSymbol(name: string): string {
  const n = name.toLowerCase();
  for (const sym of ["reliance", "tcs", "hdfc", "infosys", "infy", "itc", "bajaj", "tata"]) {
    if (n.includes(sym)) {
      if (sym === "infosys" || sym === "infy") return "INFY";
      if (sym === "hdfc") return "HDFCBANK";
      if (sym === "bajaj") return "BAJFINANCE";
      if (sym === "tata") return "TATAMOTORS";
      return sym.toUpperCase();
    }
  }
  return "UNLISTED";
}

function guessType(name: string): FinDocument["metadata"]["document_type"] {
  const n = name.toLowerCase();
  if (n.includes("annual")) return "annual_report";
  if (n.includes("transcript") || n.includes("concall") || n.includes("call")) return "concall_transcript";
  if (n.includes("presentation") || n.includes("deck")) return "investor_presentation";
  if (n.includes("shareholding")) return "shareholding_pattern";
  if (n.match(/q[1-4]|quarter|result/)) return "financial_results";
  return "corporate_filing";
}

/* ================================================================== */
/*  REAL TRANSPORT — FastAPI backend                                   */
/* ================================================================== */

class RealTransport {
  private url(path: string): string {
    return `${BASE_URL}${path}`;
  }

  /* -------- health -------- */
  async health(): Promise<{ data: HealthResponse; latency: number }> {
    const t = performance.now();
    const res = await fetch(this.url("/api/health/"), { cache: "no-store" });
    const latency = Math.round(performance.now() - t);
    if (!res.ok) return { data: { status: "degraded" }, latency };
    const body = (await res.json()) as { status?: string };
    return { data: { status: body.status === "alive" ? "healthy" : "degraded" }, latency };
  }

  /* -------- documents -------- */
  async listDocuments(): Promise<FinDocument[]> {
    const res = await fetch(this.url("/api/document/"));
    if (res.status === 404) return []; // backend returns 404 for an empty library
    if (!res.ok) throw new Error(await errorDetail(res, "Could not load documents"));
    const docs = (await res.json()) as WireDocument[];
    return docs.map(mapDocument).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  }

  async getDocument(id: string): Promise<FinDocument> {
    const res = await fetch(this.url(`/api/document/${encodeURIComponent(id)}`));
    if (!res.ok) throw new Error(await errorDetail(res, "Document not found"));
    return mapDocument((await res.json()) as WireDocument);
  }

  uploadDocument(
    file: File,
    meta: UploadMeta,
    onProgress: (pct: number) => void
  ): { promise: Promise<DocumentUploadResponse>; cancel: () => void } {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<DocumentUploadResponse>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file, file.name);
      if (meta.company_name?.trim()) form.append("company_name", meta.company_name.trim());
      if (meta.company_symbol?.trim())
        form.append("company_symbol", meta.company_symbol.trim().toUpperCase());
      if (meta.financial_year?.trim()) form.append("financial_year", meta.financial_year.trim());
      if (meta.document_type) form.append("document_type", meta.document_type);
      if (meta.exchange?.trim()) form.append("exchange", meta.exchange.trim());

      xhr.open("POST", this.url("/api/document/upload"));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const doc = JSON.parse(xhr.responseText) as WireDocument;
            resolve({ document: mapDocument(doc) });
          } catch {
            reject(new Error("Unexpected response from the upload endpoint"));
          }
          return;
        }
        let detail = `Upload failed (HTTP ${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          /* keep default */
        }
        reject(new Error(detail));
      };
      xhr.onerror = () => reject(new Error("Upload failed — is the backend reachable?"));
      xhr.onabort = () => reject(new Error("cancelled"));
      xhr.send(form);
    });
    return { promise, cancel: () => xhr.abort() };
  }

  /* -------- conversations -------- */
  async createConversation(body: ConversationCreate): Promise<Conversation> {
    const res = await fetch(this.url("/api/conversation/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_ids: body.document_scope ?? [] }),
    });
    if (!res.ok) throw new Error(await errorDetail(res, "Could not create conversation"));
    return mapConversation((await res.json()) as WireConversation, body.title);
  }

  async getConversation(id: string, title = "Research thread"): Promise<Conversation> {
    const res = await fetch(this.url(`/api/conversation/${encodeURIComponent(id)}`));
    if (!res.ok) throw new Error(await errorDetail(res, "Conversation not found"));
    return mapConversation((await res.json()) as WireConversation, title);
  }

  async deleteConversation(id: string): Promise<void> {
    const res = await fetch(this.url(`/api/conversation/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404)
      throw new Error(await errorDetail(res, "Could not delete conversation"));
  }

  /* -------- message streaming -------- */
  /**
   * Consumes the backend's SSE stream. Every event is a full `Message`
   * snapshot; we diff consecutive snapshots into the StreamHandlers calls.
   */
  streamMessage(conversationId: string, question: string, h: StreamHandlers): () => void {
    const controller = new AbortController();
    const url = this.url(
      `/api/conversation/${encodeURIComponent(conversationId)}/message?user_message=${encodeURIComponent(question)}`
    );

    h.onUserMessage({
      id: uid("msg"),
      conversation_id: conversationId,
      role: "user",
      content: question,
      status: "completed",
      sub_processes: [],
      sources: [],
      created_at: nowIso(),
    });

    let assistantId: string | null = null;
    let settled = false;
    // wire index → bookkeeping (indices are stable while the stream is live)
    const stepId = new Map<number, string>();
    const stepStart = new Map<number, number>();
    const stepDone = new Set<number>();
    let lastContent = "";

    const finishStep = (i: number, patch: Partial<MessageSubProcess>) => {
      if (stepDone.has(i)) return;
      stepDone.add(i);
      const started = stepStart.get(i) ?? performance.now();
      h.onSubProcess(stepId.get(i)!, {
        ...patch,
        duration_ms: Math.max(1, Math.round(performance.now() - started)),
      });
    };

    const applySnapshot = (snap: WireMessage) => {
      if (!assistantId) {
        assistantId = snap.id;
        h.onAssistantCreated({
          id: snap.id,
          conversation_id: conversationId,
          role: "assistant",
          content: "",
          status: "processing",
          sub_processes: [],
          sources: [],
          created_at: nowIso(),
        });
      }

      const terminal = snap.status !== "PENDING";

      // Sub-processes: during the live stream the list is append-only and
      // index-stable. The terminal snapshot is re-read from the database
      // (ids assigned, order not guaranteed), so we only finalise there.
      if (!terminal) {
        snap.sub_processes.forEach((sp, i) => {
          if (!isVisibleSubProcess(sp)) return;
          if (!stepId.has(i)) {
            const id = `${snap.id}-sp-${i}`;
            stepId.set(i, id);
            stepStart.set(i, performance.now());
            const mapped = mapSubProcess(sp, id);
            h.onSubProcess(id, { ...mapped, status: sp.status === "FINISHED" ? "completed" : "running" });
            if (sp.status === "FINISHED") finishStep(i, {});
            return;
          }
          if (sp.status === "FINISHED" && !stepDone.has(i)) {
            const mapped = mapSubProcess(sp, stepId.get(i)!);
            finishStep(i, { name: mapped.name, detail: mapped.detail, status: mapped.status });
          }
        });
      }

      if (snap.content !== lastContent) {
        lastContent = snap.content;
        h.onContent(snap.content);
      }

      if (terminal) {
        settled = true;
        for (const i of stepId.keys()) {
          finishStep(i, { status: snap.status === "ERROR" ? "failed" : "completed" });
        }
        if (snap.status === "ERROR") {
          h.onError("The research engine hit an error while answering. Please try again.");
        } else {
          h.onDone({ content: snap.content, sources: extractSources(snap.sub_processes) });
        }
      }
    };

    (async () => {
      try {
        const res = await fetch(url, {
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await errorDetail(res, "Could not start the answer"));
        await readSse(res, (data) => {
          if (settled) return;
          let snap: WireMessage;
          try {
            snap = JSON.parse(data) as WireMessage;
          } catch {
            return; // ignore non-JSON frames
          }
          applySnapshot(snap);
        });
        if (!settled) {
          settled = true;
          h.onError("The answer stream ended before the backend finished.");
        }
      } catch (e) {
        if (settled) return;
        if (e instanceof DOMException && e.name === "AbortError") return; // user pressed stop
        settled = true;
        h.onError(e instanceof Error ? e.message : "Stream interrupted");
      }
    })();

    return () => controller.abort();
  }
}

/* ------------------------------------------------------------------ */
/*  Facade                                                             */
/* ------------------------------------------------------------------ */

const mock = USE_MOCK ? new MockTransport() : null;
const real = USE_MOCK ? null : new RealTransport();

export const api = {
  health: () => (mock ? mock.health(performance.now() % 30) : real!.health()),
  listDocuments: () => (mock ? mock.listDocuments() : real!.listDocuments()),
  getDocument: (id: string) => (mock ? mock.getDocument(id) : real!.getDocument(id)),
  uploadDocument: (file: FileLike, meta: UploadMeta, onProgress: (pct: number) => void) =>
    mock
      ? mock.uploadDocument(file, meta, onProgress)
      : real!.uploadDocument(file as File, meta, onProgress),
  createConversation: (body: ConversationCreate) =>
    mock ? mock.createConversation(body) : real!.createConversation(body),
  getConversation: (id: string, title?: string) =>
    mock ? mock.getConversation(id) : real!.getConversation(id, title),
  deleteConversation: (id: string) =>
    mock ? mock.deleteConversation(id) : real!.deleteConversation(id),
  streamMessage: (conversationId: string, question: string, h: StreamHandlers) =>
    mock
      ? mock.streamMessage(conversationId, question, h)
      : real!.streamMessage(conversationId, question, h),
};
