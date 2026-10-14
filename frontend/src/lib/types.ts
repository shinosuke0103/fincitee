/**
 * Domain types
 *
 * These are the shapes the UI renders. They are a superset of the FastAPI
 * backend's Pydantic schemas (see backend/app/schema.py); the translation
 * from wire format to these types lives in ./backend.ts.
 */

/** NSEDocumentTypeEnum (backend) + a few UI-only categories used by the demo corpus */
export type NSEDocumentType =
  | "annual_report"
  | "financial_results"
  | "corporate_filing"
  | "investor_presentation"
  | "other"
  | "quarterly_results"
  | "concall_transcript"
  | "shareholding_pattern"
  | "corporate_announcement";

export type DocumentStatus =
  | "uploading"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexing"
  | "ready"
  | "failed";

/** Flattened view of metadata_map.nse_document (+ derived fields) */
export interface DocumentMetadata {
  company_name: string;
  nse_symbol: string;
  document_type: NSEDocumentType;
  fiscal_year: string;
  period: string;
  pages: number;
  file_size: number;
  language: string;
}

/** Document */
export interface FinDocument {
  id: string;
  filename: string;
  /** public storage URL of the original PDF (empty in demo mode) */
  url?: string;
  status: DocumentStatus;
  progress: number; // 0..100 for upload
  metadata: DocumentMetadata;
  uploaded_at: string;
}

/** Optional metadata supplied at upload time (mirrors the multipart form fields) */
export interface UploadMeta {
  company_name?: string;
  company_symbol?: string;
  financial_year?: string;
  document_type?: NSEDocumentType;
  exchange?: string;
}

/** MessageSubProcessSourceEnum, collapsed into UI-level categories */
export type SubProcessSource =
  | "engine"
  | "agent"
  | "llm"
  | "retrieval"
  | "embedding"
  | "rerank"
  | "parser";

/** MessageSubProcessStatusEnum */
export type SubProcessStatus = "pending" | "running" | "completed" | "failed";

/** MessageSubProcess */
export interface MessageSubProcess {
  id: string;
  name: string;
  source: SubProcessSource;
  status: SubProcessStatus;
  /** SubProcessMetadataKeysEnum values flattened to readable detail */
  detail?: string;
  duration_ms?: number;
}

/** MessageRoleEnum */
export type MessageRole = "user" | "assistant";

/** MessageStatusEnum */
export type MessageStatus = "pending" | "processing" | "streaming" | "completed" | "failed";

/** A grounded citation attached to an assistant message */
export interface Source {
  index: number;
  document_id: string;
  page: number;
  excerpt: string;
  score: number; // 0..1 relevance
}

/** Message */
export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  sub_processes: MessageSubProcess[];
  sources: Source[];
  created_at: string;
}

/** Conversation */
export interface Conversation {
  id: string;
  title: string;
  /** document ids this conversation is scoped to (fixed at creation on the backend) */
  document_scope: string[];
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

/** ConversationCreate */
export interface ConversationCreate {
  title: string;
  document_scope?: string[];
}

/** DocumentUploadResponse */
export interface DocumentUploadResponse {
  document: FinDocument;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "down";
}

export type View = "chat" | "library";
