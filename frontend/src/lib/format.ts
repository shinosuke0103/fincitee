import type { DocumentStatus, NSEDocumentType, SubProcessSource } from "./types";

export function initials(company: string): string {
  return company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function timeHM(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return timeHM(iso);
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * "2025" → "FY2024-25", "2024-25" → "FY2024-25", "FY2025" → "FY2025".
 * Anything unrecognised is returned as-is.
 */
export function formatFiscalYear(raw?: string | null): string {
  if (!raw) return "—";
  const v = raw.trim();
  if (/^\d{4}$/.test(v)) {
    const y = Number(v);
    return `FY${y - 1}-${String(y).slice(2)}`;
  }
  if (/^\d{4}-\d{2}$/.test(v)) return `FY${v}`;
  return v;
}

/** Inverse of formatFiscalYear for the upload form: "FY2024-25" → "2025". */
export function fiscalYearToWire(label?: string | null): string | undefined {
  if (!label) return undefined;
  const v = label.trim();
  const m = /^FY(\d{4})-(\d{2})$/.exec(v);
  if (m) return `${m[1].slice(0, 2)}${m[2]}`;
  if (/^\d{4}$/.test(v)) return v;
  return undefined;
}

export const DOC_TYPE_LABEL: Record<NSEDocumentType, string> = {
  annual_report: "Annual Report",
  financial_results: "Financial Results",
  corporate_filing: "Corporate Filing",
  investor_presentation: "Investor Deck",
  other: "Document",
  quarterly_results: "Quarterly Results",
  concall_transcript: "Concall Transcript",
  shareholding_pattern: "Shareholding",
  corporate_announcement: "Announcement",
};

export const DOC_TYPE_SHORT: Record<NSEDocumentType, string> = {
  annual_report: "AR",
  financial_results: "FR",
  corporate_filing: "CF",
  investor_presentation: "ID",
  other: "DOC",
  quarterly_results: "QR",
  concall_transcript: "CT",
  shareholding_pattern: "SP",
  corporate_announcement: "CA",
};

/** Types accepted by the backend's upload form (NSEDocumentTypeEnum) */
export const UPLOADABLE_DOC_TYPES: NSEDocumentType[] = [
  "annual_report",
  "financial_results",
  "investor_presentation",
  "corporate_filing",
  "other",
];

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  uploading: "Uploading",
  parsing: "Parsing PDF",
  chunking: "Chunking",
  embedding: "Embedding",
  indexing: "Indexing",
  ready: "Ready",
  failed: "Failed",
};

export const PIPELINE_STAGES: DocumentStatus[] = [
  "parsing",
  "chunking",
  "embedding",
  "indexing",
];

export const SUBPROCESS_META: Record<SubProcessSource, { label: string }> = {
  engine: { label: "Engine" },
  agent: { label: "Agent" },
  llm: { label: "LLM" },
  retrieval: { label: "Vector store" },
  embedding: { label: "Embeddings" },
  rerank: { label: "Reranker" },
  parser: { label: "Parser" },
};

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

let nowCounter = 0;
export function nowIso(): string {
  // keep ordering stable inside the same tick
  return new Date(Date.now() + nowCounter++).toISOString();
}

/** Deterministic brand-palette hue for a ticker symbol (used by Monogram) */
export function symbolHue(symbol: string): string {
  const palette = [
    "#1f3a5f", "#5b3a29", "#2f4f3a", "#4a2c5a", "#6b2d2d", "#2d4a4a",
    "#4d3b1f", "#3b3b6b", "#1f5f5f", "#5f1f3a", "#3a5f1f", "#5a4a2c",
  ];
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
