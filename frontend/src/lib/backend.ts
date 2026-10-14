/**
 * Backend wire protocol
 * ---------------------
 * Types and mappers for the FastAPI service (backend/app/schema.py), plus a
 * minimal Server-Sent Events reader for the streaming message endpoint.
 *
 * Nothing in here knows about React or the store; it only translates the
 * backend's shapes into the UI's domain types (./types.ts).
 */
import { formatFiscalYear, initials } from "./format";
import type {
  ChatMessage,
  Conversation,
  FinDocument,
  MessageStatus,
  MessageSubProcess,
  NSEDocumentType,
  Source,
  SubProcessSource,
  SubProcessStatus,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Wire types (mirror backend/app/schema.py)                          */
/* ------------------------------------------------------------------ */

export interface WireNSEDocumentMetadata {
  company_name: string;
  company_symbol?: string | null;
  document_type?: string | null;
  financial_year?: string | null;
  report_date?: string | null;
  exchange?: string | null;
  original_filename?: string | null;
}

export interface WireDocument {
  id: string;
  url: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata_map?: {
    nse_document?: WireNSEDocumentMetadata;
    content_hash?: string;
    original_filename?: string;
    page_count?: number | null;
    file_size?: number | null;
    [k: string]: unknown;
  } | null;
}

export interface WireCitation {
  document_id: string;
  text: string;
  page_number: number;
  score?: number | null;
}

export interface WireSubProcess {
  id?: string | null;
  message_id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  source: string;
  status: "PENDING" | "FINISHED";
  metadata_map?: {
    sub_question?: {
      question: string;
      answer?: string | null;
      citations?: WireCitation[] | null;
    };
    [k: string]: unknown;
  } | null;
}

export interface WireMessage {
  id: string;
  conversation_id: string;
  content: string;
  role: "user" | "assistant";
  status: "PENDING" | "SUCCESS" | "ERROR";
  sub_processes: WireSubProcess[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WireConversation {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  messages: WireMessage[];
  documents: WireDocument[];
}

/* ------------------------------------------------------------------ */
/*  Primitives                                                         */
/* ------------------------------------------------------------------ */

/**
 * The backend serialises naive UTC datetimes without a zone designator
 * ("2026-10-14T10:12:03.412000"). Append "Z" so the browser doesn't treat
 * them as local time.
 */
/**
 * Sort key that keeps the backend's microsecond precision (toIso() rounds to
 * milliseconds, which makes rows written in the same millisecond tie).
 */
export function sortKey(value?: string | null): string {
  if (!value) return "";
  // naive timestamps and "+00:00" both sort correctly as plain strings once
  // the zone suffix is stripped
  return value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, "");
}

export function toIso(value?: string | null): string {
  if (!value) return new Date().toISOString();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const DOC_TYPES: NSEDocumentType[] = [
  "annual_report",
  "financial_results",
  "corporate_filing",
  "investor_presentation",
  "other",
  "quarterly_results",
  "concall_transcript",
  "shareholding_pattern",
  "corporate_announcement",
];

function asDocType(v?: string | null): NSEDocumentType {
  return (DOC_TYPES as string[]).includes(v ?? "") ? (v as NSEDocumentType) : "other";
}

function prettifyFilename(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

/* ------------------------------------------------------------------ */
/*  Documents                                                          */
/* ------------------------------------------------------------------ */

export function mapDocument(w: WireDocument): FinDocument {
  const mm = w.metadata_map ?? {};
  const nse = mm.nse_document;
  const filename =
    mm.original_filename ??
    nse?.original_filename ??
    decodeURIComponent(w.url.split("/").pop() ?? "") ??
    "document.pdf";
  const company = nse?.company_name?.trim() || prettifyFilename(filename) || "Unknown Company";
  const symbol = nse?.company_symbol?.trim().toUpperCase() || initials(company);
  const fiscal = formatFiscalYear(nse?.financial_year);
  const docType = asDocType(nse?.document_type);

  return {
    id: w.id,
    filename,
    url: w.url,
    status: "ready",
    progress: 100,
    uploaded_at: toIso(w.created_at),
    metadata: {
      company_name: company,
      nse_symbol: symbol,
      document_type: docType,
      fiscal_year: fiscal,
      period: nse?.report_date
        ? new Date(toIso(nse.report_date)).toLocaleDateString([], { month: "short", year: "numeric" })
        : fiscal !== "—"
          ? fiscal
          : "Unclassified",
      pages: typeof mm.page_count === "number" ? mm.page_count : 0,
      file_size: typeof mm.file_size === "number" ? mm.file_size : 0,
      language: "en",
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Sub-processes                                                      */
/* ------------------------------------------------------------------ */

interface SourceMeta {
  source: SubProcessSource;
  name: string;
  /** hide noisy low-level events from the research trail */
  visible: boolean;
}

/** backend MessageSubProcessSourceEnum value → UI category + label */
const SOURCE_MAP: Record<string, SourceMeta> = {
  constructed_query_engine: { source: "engine", name: "Built research engine", visible: true },
  agent_step: { source: "agent", name: "Agent reasoning", visible: true },
  function_call: { source: "agent", name: "Consulting the filings", visible: true },
  sub_questions: { source: "llm", name: "Planning sub-questions", visible: true },
  sub_question: { source: "retrieval", name: "Sub-question", visible: true },
  retrieve: { source: "retrieval", name: "Vector retrieval", visible: true },
  reranking: { source: "rerank", name: "Reranking passages", visible: true },
  synthesize: { source: "llm", name: "Synthesising answer", visible: true },
  exception: { source: "agent", name: "Step failed", visible: true },
  llm: { source: "llm", name: "LLM call", visible: false },
  templating: { source: "llm", name: "Prompt templating", visible: false },
  embedding: { source: "embedding", name: "Embedding query", visible: false },
  query: { source: "retrieval", name: "Query", visible: false },
  tree: { source: "llm", name: "Tree summarise", visible: false },
  chunking: { source: "parser", name: "Chunking", visible: false },
  node_parsing: { source: "parser", name: "Parsing nodes", visible: false },
};

function sourceMeta(source: string): SourceMeta {
  return (
    SOURCE_MAP[source] ?? {
      source: "llm",
      name: source.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      visible: true,
    }
  );
}

export function isVisibleSubProcess(w: WireSubProcess): boolean {
  return sourceMeta(w.source).visible;
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

export function mapSubProcess(w: WireSubProcess, id: string): MessageSubProcess {
  const meta = sourceMeta(w.source);
  const sq = w.metadata_map?.sub_question;
  const status: SubProcessStatus =
    w.source === "exception" ? "failed" : w.status === "FINISHED" ? "completed" : "running";

  let name = meta.name;
  let detail: string | undefined;
  if (w.source === "sub_question" && sq) {
    name = truncate(sq.question, 140);
    const n = sq.citations?.length ?? 0;
    detail = sq.answer
      ? `${truncate(sq.answer, 180)}${n ? ` · ${n} citation${n === 1 ? "" : "s"}` : ""}`
      : undefined;
  } else if (w.source === "constructed_query_engine") {
    detail = "One retrieval tool per filing in scope, isolated by document id";
  } else if (w.source === "function_call") {
    detail = "document_question_engine";
  }

  return { id, name, source: meta.source, status, detail };
}

/* ------------------------------------------------------------------ */
/*  Citations → sources                                                */
/* ------------------------------------------------------------------ */

export function extractSources(subProcesses: WireSubProcess[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const sp of subProcesses) {
    const cites = sp.metadata_map?.sub_question?.citations ?? [];
    for (const c of cites) {
      const key = `${c.document_id}|${c.page_number}|${c.text.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        index: 0,
        document_id: c.document_id,
        page: c.page_number,
        excerpt: truncate(c.text, 420),
        score: clamp01(c.score ?? 0),
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.map((s, i) => ({ ...s, index: i + 1 }));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/* ------------------------------------------------------------------ */
/*  Messages & conversations                                           */
/* ------------------------------------------------------------------ */

export function mapMessageStatus(w: WireMessage): MessageStatus {
  if (w.status === "SUCCESS") return "completed";
  if (w.status === "ERROR") return "failed";
  return w.content ? "streaming" : "processing";
}

/** Persisted message (from GET /conversation/{id}) → UI message */
export function mapPersistedMessage(w: WireMessage): ChatMessage {
  const subs = [...w.sub_processes]
    .sort((a, b) => sortKey(a.created_at).localeCompare(sortKey(b.created_at)))
    .filter(isVisibleSubProcess)
    .map((sp, i) => mapSubProcess(sp, sp.id ?? `${w.id}-sp-${i}`));
  return {
    id: w.id,
    conversation_id: w.conversation_id,
    role: w.role,
    content: w.content,
    status: w.role === "user" ? "completed" : w.status === "PENDING" ? "failed" : mapMessageStatus(w),
    sub_processes: w.role === "assistant" ? subs : [],
    sources: w.role === "assistant" ? extractSources(w.sub_processes) : [],
    created_at: toIso(w.created_at),
  };
}

export function mapConversation(w: WireConversation, title: string): Conversation {
  // chronological; a user turn always precedes the assistant turn it triggered
  const roleRank = (m: WireMessage) => (m.role === "user" ? 0 : 1);
  const messages = [...w.messages]
    .sort(
      (a, b) =>
        sortKey(a.created_at).localeCompare(sortKey(b.created_at)) || roleRank(a) - roleRank(b)
    )
    .map(mapPersistedMessage);
  return {
    id: w.id,
    title,
    document_scope: w.documents.map((d) => d.id),
    messages,
    created_at: toIso(w.created_at),
    updated_at: toIso(messages.length ? messages[messages.length - 1].created_at : w.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/*  Server-Sent Events reader                                          */
/* ------------------------------------------------------------------ */

/**
 * Reads an SSE response body and invokes `onEvent` with the decoded `data`
 * of each event. Handles `\r\n` separators and `: ping` comments emitted
 * by sse-starlette. Resolves when the server closes the stream.
 */
export async function readSse(
  res: Response,
  onEvent: (data: string, event?: string) => void
): Promise<void> {
  if (!res.body) throw new Error("Streaming not supported by this browser");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const flush = (raw: string) => {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
    }
    if (data.length) onEvent(data.join("\n"), event);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      flush(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  if (buf.trim()) flush(buf);
}

/** Extract a human-readable error from a FastAPI error response */
export async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((d) => (typeof d === "object" && d && "msg" in d ? String((d as { msg: unknown }).msg) : String(d)))
        .join("; ");
    }
  } catch {
    /* non-JSON body */
  }
  return `${fallback} (HTTP ${res.status})`;
}
