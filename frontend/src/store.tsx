import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, USE_MOCK, type FileLike } from "./lib/api";
import type {
  Conversation,
  FinDocument,
  HealthResponse,
  Source,
  UploadMeta,
  View,
} from "./lib/types";

export interface ToastItem {
  id: number;
  kind: "success" | "info" | "error";
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

export interface SelectedSource {
  source: Source;
  messageId: string;
  conversationId: string;
}

interface Store {
  view: View;
  setView: (v: View) => void;
  booted: boolean;
  boot: () => Promise<void>;

  documents: FinDocument[];
  refreshDocuments: () => Promise<void>;
  uploadFiles: (files: FileLike[], meta?: UploadMeta) => Promise<void>;
  uploading: { name: string; pct: number; error?: string }[];
  libraryOpenDocId: string | null;
  setLibraryOpenDocId: (id: string | null) => void;

  conversations: Conversation[];
  activeId: string | null;
  active: Conversation | null;
  selectConversation: (id: string | null) => void;
  newChat: () => void;
  deleteConversation: (id: string) => Promise<void>;
  /** document ids a *new* thread will be scoped to; [] = whole library */
  draftScope: string[];
  setDraftScope: (docIds: string[]) => void;
  startScopedChat: (doc: FinDocument) => Promise<void>;
  send: (question: string) => Promise<void>;
  streaming: boolean;
  stopStreaming: () => void;

  health: { status: HealthResponse["status"]; latency: number } | null;
  checkHealth: () => Promise<void>;

  selectedSource: SelectedSource | null;
  openSource: (s: SelectedSource) => void;
  closeSource: () => void;

  mobileNav: boolean;
  setMobileNav: (b: boolean) => void;

  toasts: ToastItem[];
  pushToast: (t: Omit<ToastItem, "id">) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

let toastSeq = 1;

/* ------------------------------------------------------------------ */
/*  Thread index — the backend has no "list conversations" endpoint,  */
/*  so ids + titles are remembered locally and hydrated on boot.       */
/* ------------------------------------------------------------------ */

interface ThreadRef {
  id: string;
  title: string;
  created_at: string;
}

const THREADS_KEY = USE_MOCK ? "fincite.threads.mock" : "fincite.threads";

function loadThreadRefs(): ThreadRef[] {
  try {
    const raw = window.localStorage.getItem(THREADS_KEY);
    const parsed = raw ? (JSON.parse(raw) as ThreadRef[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveThreadRefs(refs: ThreadRef[]) {
  try {
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(refs.slice(0, 200)));
  } catch {
    /* storage unavailable */
  }
}

function rememberThread(ref: ThreadRef) {
  saveThreadRefs([ref, ...loadThreadRefs().filter((r) => r.id !== ref.id)]);
}

function forgetThread(id: string) {
  saveThreadRefs(loadThreadRefs().filter((r) => r.id !== id));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("chat");
  const [booted, setBooted] = useState(false);
  const [documents, setDocuments] = useState<FinDocument[]>([]);
  const [uploading, setUploading] = useState<Store["uploading"]>([]);
  const [libraryOpenDocId, setLibraryOpenDocId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [health, setHealth] = useState<Store["health"]>(null);
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const cancelStream = useRef<(() => void) | null>(null);
  const pollers = useRef(new Map<string, number>());
  const documentsRef = useRef<FinDocument[]>([]);
  documentsRef.current = documents;

  /* ---------- toasts ---------- */
  const pushToast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = toastSeq++;
    setToasts((prev) => [...prev, { ...t, id }].slice(-3));
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4600);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  /* ---------- documents ---------- */
  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await api.listDocuments();
      setDocuments(docs);
    } catch {
      /* keep stale */
    }
  }, []);

  const watchDocument = useCallback(
    (id: string) => {
      if (pollers.current.has(id)) return;
      const timer = window.setInterval(async () => {
        try {
          const doc = await api.getDocument(id);
          setDocuments((prev) => prev.map((d) => (d.id === id ? doc : d)));
          if (doc.status === "ready" || doc.status === "failed") {
            window.clearInterval(timer);
            pollers.current.delete(id);
            if (doc.status === "ready") {
              pushToast({
                kind: "success",
                title: "Filing indexed",
                body: `${doc.metadata.company_name} · ${doc.metadata.pages} pages are now searchable.`,
              });
            }
          }
        } catch {
          window.clearInterval(timer);
          pollers.current.delete(id);
        }
      }, 900);
      pollers.current.set(id, timer);
    },
    [pushToast]
  );

  const uploadFiles = useCallback(
    async (files: FileLike[], meta: UploadMeta = {}) => {
      for (const f of files) {
        setUploading((prev) => [...prev.filter((u) => u.name !== f.name), { name: f.name, pct: 0 }]);
        try {
          const { promise } = api.uploadDocument(f, meta, (pct) =>
            setUploading((prev) => prev.map((u) => (u.name === f.name ? { ...u, pct } : u)))
          );
          const { document } = await promise;
          setUploading((prev) => prev.filter((u) => u.name !== f.name));
          setDocuments((prev) => [document, ...prev.filter((d) => d.id !== document.id)]);
          if (document.status === "ready") {
            pushToast({
              kind: "success",
              title: "Filing indexed",
              body: `${document.metadata.company_name}${
                document.metadata.pages ? ` · ${document.metadata.pages} pages` : ""
              } · ready to query.`,
            });
          } else {
            watchDocument(document.id);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "Upload failed";
          setUploading((prev) =>
            prev.map((u) => (u.name === f.name ? { ...u, error: message } : u))
          );
          pushToast({ kind: "error", title: "Upload rejected", body: message });
          window.setTimeout(
            () => setUploading((prev) => prev.filter((u) => u.name !== f.name)),
            3200
          );
        }
      }
    },
    [watchDocument, pushToast]
  );

  /* ---------- conversations ---------- */
  const patchConversation = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === id ? fn(c) : c));
      return [...next].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    });
  }, []);

  const patchLastAssistant = useCallback(
    (cid: string, fn: (m: Conversation["messages"][number]) => Conversation["messages"][number]) =>
      patchConversation(cid, (c) => {
        const idx = [...c.messages].reverse().findIndex((m) => m.role === "assistant");
        if (idx === -1) return c;
        const real = c.messages.length - 1 - idx;
        return { ...c, messages: c.messages.map((m, i) => (i === real ? fn(m) : m)) };
      }),
    [patchConversation]
  );

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || streaming) return;

      const ready = documentsRef.current.filter((d) => d.status === "ready");
      if (ready.length === 0) {
        pushToast({
          kind: "info",
          title: "Index a filing first",
          body: "Upload at least one PDF to the library, then ask away.",
          action: { label: "Open library", run: () => setView("library") },
        });
        return;
      }

      setStreaming(true);
      setView("chat");
      setSelectedSource(null);

      let convoId = activeId;
      if (!convoId) {
        const title = q.length > 46 ? q.slice(0, 46).trimEnd() + "…" : q;
        // backend scope is fixed at creation: [] in the UI means "whole library"
        const scope = draftScope.length ? draftScope : ready.map((d) => d.id);
        try {
          const convo = await api.createConversation({ title, document_scope: scope });
          rememberThread({ id: convo.id, title, created_at: convo.created_at });
          setConversations((prev) => [convo, ...prev]);
          convoId = convo.id;
          setActiveId(convo.id);
          setDraftScope([]);
        } catch (e) {
          setStreaming(false);
          pushToast({
            kind: "error",
            title: "Could not create conversation",
            body: e instanceof Error ? e.message : undefined,
          });
          return;
        }
      }
      const cid = convoId;

      const cancel = api.streamMessage(cid, q, {
        onUserMessage: (msg) =>
          patchConversation(cid, (c) => ({
            ...c,
            updated_at: msg.created_at,
            messages: [...c.messages, msg],
          })),
        onAssistantCreated: (msg) =>
          patchConversation(cid, (c) => ({ ...c, messages: [...c.messages, msg] })),
        onSubProcess: (stepId, patch) =>
          patchLastAssistant(cid, (m) => {
            const exists = m.sub_processes.some((s) => s.id === stepId);
            if (exists) {
              return {
                ...m,
                sub_processes: m.sub_processes.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
              };
            }
            return {
              ...m,
              sub_processes: [
                ...m.sub_processes,
                {
                  id: stepId,
                  name: patch.name ?? "Working",
                  source: patch.source ?? "llm",
                  status: patch.status ?? "running",
                  detail: patch.detail,
                  duration_ms: patch.duration_ms,
                },
              ],
            };
          }),
        onToken: (token) =>
          patchLastAssistant(cid, (m) => ({ ...m, status: "streaming", content: m.content + token })),
        onContent: (content) =>
          patchLastAssistant(cid, (m) => ({
            ...m,
            status: content ? "streaming" : m.status,
            content,
          })),
        onDone: ({ content, sources }) => {
          patchLastAssistant(cid, (m) => ({ ...m, status: "completed", content, sources }));
          setStreaming(false);
          cancelStream.current = null;
        },
        onError: (message) => {
          patchLastAssistant(cid, (m) => ({
            ...m,
            status: "failed",
            content: m.content || message,
            sub_processes: m.sub_processes.map((s) =>
              s.status === "running" || s.status === "pending" ? { ...s, status: "failed" } : s
            ),
          }));
          setStreaming(false);
          cancelStream.current = null;
          pushToast({ kind: "error", title: "Answer interrupted", body: message });
        },
      });
      cancelStream.current = cancel;
    },
    [activeId, draftScope, streaming, patchConversation, patchLastAssistant, pushToast]
  );

  const stopStreaming = useCallback(() => {
    cancelStream.current?.();
    cancelStream.current = null;
    if (activeId) {
      patchLastAssistant(activeId, (m) =>
        m.status === "completed" || m.status === "failed"
          ? m
          : {
              ...m,
              status: "completed",
              content: m.content || "_Stopped before an answer was produced._",
              sub_processes: m.sub_processes.map((s) =>
                s.status === "running" || s.status === "pending" ? { ...s, status: "completed" } : s
              ),
            }
      );
    }
    setStreaming(false);
  }, [activeId, patchLastAssistant]);

  const selectConversation = useCallback((id: string | null) => {
    setActiveId(id);
    setView("chat");
    setSelectedSource(null);
    setMobileNav(false);
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    setDraftScope([]);
    setView("chat");
    setSelectedSource(null);
    setMobileNav(false);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await api.deleteConversation(id);
      } catch (e) {
        pushToast({
          kind: "error",
          title: "Could not delete thread",
          body: e instanceof Error ? e.message : undefined,
        });
        return;
      }
      forgetThread(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setActiveId((cur) => (cur === id ? null : cur));
      pushToast({ kind: "info", title: "Conversation deleted" });
    },
    [pushToast]
  );

  const startScopedChat = useCallback(
    async (doc: FinDocument) => {
      const title = `${doc.metadata.nse_symbol} · ${doc.metadata.document_type.replace(/_/g, " ")}`;
      try {
        const convo = await api.createConversation({ title, document_scope: [doc.id] });
        rememberThread({ id: convo.id, title, created_at: convo.created_at });
        setConversations((prev) => [convo, ...prev]);
        setActiveId(convo.id);
        setView("chat");
        setLibraryOpenDocId(null);
        setSelectedSource(null);
        pushToast({
          kind: "info",
          title: "Scoped thread created",
          body: `Retrieval is narrowed to ${doc.metadata.company_name}.`,
        });
      } catch (e) {
        pushToast({
          kind: "error",
          title: "Could not create thread",
          body: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [pushToast]
  );

  /* ---------- health ---------- */
  const checkHealth = useCallback(async () => {
    try {
      const { data, latency } = await api.health();
      setHealth({ status: data.status, latency });
    } catch {
      setHealth({ status: "down", latency: 0 });
    }
  }, []);

  /* ---------- boot ---------- */
  const hydrateThreads = useCallback(async () => {
    const refs = loadThreadRefs();
    if (refs.length === 0) return;
    const results = await Promise.allSettled(refs.map((r) => api.getConversation(r.id, r.title)));
    const alive: Conversation[] = [];
    results.forEach((res, i) => {
      if (res.status === "fulfilled") alive.push(res.value);
      else forgetThread(refs[i].id); // deleted server-side or never persisted
    });
    alive.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    setConversations(alive);
  }, []);

  const boot = useCallback(async () => {
    await Promise.all([refreshDocuments(), checkHealth(), hydrateThreads()]);
    setBooted(true);
  }, [refreshDocuments, checkHealth, hydrateThreads]);

  const openSource = useCallback((s: SelectedSource) => setSelectedSource(s), []);
  const closeSource = useCallback(() => setSelectedSource(null), []);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const value: Store = {
    view,
    setView,
    booted,
    boot,
    documents,
    refreshDocuments,
    uploadFiles,
    uploading,
    libraryOpenDocId,
    setLibraryOpenDocId,
    conversations,
    activeId,
    active,
    selectConversation,
    newChat,
    deleteConversation,
    draftScope,
    setDraftScope,
    startScopedChat,
    send,
    streaming,
    stopStreaming,
    health,
    checkHealth,
    selectedSource,
    openSource,
    closeSource,
    mobileNav,
    setMobileNav,
    toasts,
    pushToast,
    dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}
