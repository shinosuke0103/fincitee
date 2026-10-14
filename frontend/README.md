# Fincite · Frontend

> **The research terminal.** An editorial, keyboard-friendly React interface for interrogating NSE filings — streaming answers, a live research trail, and citations that open the exact passage.

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9%20strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?logo=vite&logoColor=white)](vite.config.ts)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)](src/index.css)
[![Framer Motion](https://img.shields.io/badge/Framer%20Motion-13-0055FF)](src/App.tsx)
[![Modes](https://img.shields.io/badge/modes-live%20API%20%C2%B7%20demo-E0490B)](#5-live-mode-and-demo-mode)

The product story is in the [root README](../README.md); the API this UI talks to is documented in the [backend README](../backend/README.md). This document covers the interface itself.

---

## Contents

1. [What the UI does](#1-what-the-ui-does)
2. [Design language](#2-design-language)
3. [Architecture](#3-architecture)
4. [Directory structure](#4-directory-structure)
5. [Live mode and demo mode](#5-live-mode-and-demo-mode)
6. [The backend adapter](#6-the-backend-adapter)
7. [Getting started](#7-getting-started)
8. [Interaction details](#8-interaction-details)
9. [Roadmap](#9-roadmap)

---

## 1. What the UI does

Fincite is a single-page app with two primary views and three overlays, all living inside one shell.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  TAPE  CORPUS 6 filings · 2,242 pages · LIVE   RELIANCE AR FY2024-25 476p  TCS … │
├────────────────┬─────────────────────────────────────────────────────────────────┤
│  SIDEBAR       │  CHAT VIEW                                    [ Scope ▾ all 6 ] │
│                │                                                                 │
│  f  Fincite    │   Interrogate the filings.                                      │
│     Ask the    │   Every claim, pinned to a page.                                │
│     filings    │   6 DOCUMENTS · 4 NSE COMPANIES · 1,842 PAGES IN THE INDEX      │
│                │                                                                 │
│  ▸ Filing      │   ┌ suggestion ─────────┐  ┌ suggestion ─────────┐              │
│    library   6 │   └──────────────────────┘  └──────────────────────┘            │
│  ▸ Research    │                                                                 │
│    chats     3 │   ── inside a thread ────────────────────────────────────────   │
│                │                                                                 │
│  THREADS  + New│                         you ▸ Compare FY25 vs FY24 net profit   │
│  · RELIANCE AR │   f  RESEARCH TRAIL  ▾                        5 steps · 6.1s    │
│  · Capex compa…│      ✓ Agent reasoning        agent                   1210ms    │
│  · ESG risks   │      ✓ Planning sub-questions llm                      640ms    │
│                │      ✓ What does the FY25 AR… vector store            2180ms    │
│                │      ✓ Vector retrieval       vector store             410ms    │
│                │      ✓ Synthesising answer    llm                     1660ms    │
│                │   Net profit rose to ₹ 69,621 Crore in FY2025 [1], up from      │
│                │   ₹ 68,000 Crore in FY2024 [2] …                                │
│                │   GROUNDED SOURCES · 2                                          │
│                │   [1] RELIANCE  p.212  “…”  81%    [2] RELIANCE  p.198  “…”  74%│
│                │                                                                 │
│  ● fincite API │   ┌───────────────────────────────────────────────────────┐     │
│           14ms │   │ Ask across every indexed filing…                  [↑] │     │
│                │   │ ↵ send · ⇧+↵ newline · ⌘K focus     scope · 6 filings │     │
│                │   └───────────────────────────────────────────────────────┘     │
└────────────────┴─────────────────────────────────────────────────────────────────┘
```

### Views

| View | Component | What you can do |
|---|---|---|
| **Research chat** | `ChatView` | Start a thread from a suggestion or free text; watch the answer stream with a blinking caret; expand the **research trail** (per-step source, status, duration, detail); click inline `[n]` chips or source cards to open the passage; copy the answer; choose the **scope** (which filings the next thread may read) before the first message. |
| **Filing library** | `LibraryView` | Drag-and-drop PDFs anywhere on the screen or use the upload drawer (with an optional NSE metadata form: company, symbol, financial year, document type); filter by company / symbol / type; see per-document status; open a document's **detail drawer** (metadata sheet incl. page count and size, pipeline state, link to the stored PDF); start a thread scoped to that one filing; re-upload a revision with the same identity. |

### Overlays

| Overlay | Component | Purpose |
|---|---|---|
| **Source drawer** | `SourceDrawer` | The citation inspector: company monogram, document type, fiscal year, page number in display type, the quoted chunk, and an animated relevance bar. Deep-links back into the library. |
| **Sidebar / mobile rail** | `Sidebar` | Brand, primary navigation with counts, thread list with inline delete-confirmation, live API health (latency or *unreachable*). Slides in as a drawer below `lg`. |
| **Toasts** | `Toasts` | Success / info / error notifications with optional action button; capped at three, auto-dismiss. |
| **Boot splash** | `App.tsx → Splash` | 1.5 s minimum brand reveal while documents and health load in parallel. |

---

## 2. Design language

The interface is deliberately **not** a generic chat template. It reads like a research desk: paper tones, hairline rules, square corners, tabular numerals, a market ticker, and a touch of film grain.

| Token | Value | Used for |
|---|---|---|
| `--color-bone` / `--color-paper` / `--color-faint` | `#f3efe4` / `#faf7ee` / `#ece7d6` | Page, cards, subtle fills |
| `--color-ink` / `--color-soot` | `#16130b` / `#1e1a0f` | Text, dark rail |
| `--color-moss` | `#736d55` | Secondary text, meta labels |
| `--color-accent` / `--color-accent-deep` | `#e0490b` / `#b2380a` | The Fincite orange: brand mark, active states, streaming caret, relevance bars |
| `--color-pine` / `--color-rust` / `--color-gold` | `#1f7a4d` / `#b3261e` / `#8c6d1f` | Success, error, warning |
| `--font-display` | **Fraunces** (variable, optical sizing) | Headlines, italics, page numbers |
| `--font-sans` | **Space Grotesk** | Body |
| `--font-mono` | **IBM Plex Mono** | Labels, endpoints, numerals, the ticker |

All tokens are declared once in [`src/index.css`](src/index.css) via Tailwind v4's `@theme` block and consumed as utility classes (`bg-bone`, `text-moss`, `font-display`, `animate-marquee`). Motion is restrained and consistent — one easing curve (`[0.32, 0.72, 0, 1]`) for layout transitions, short durations, `AnimatePresence` for view/drawer mount and unmount.

Small details that add up: `.tnum` for tabular numerals everywhere a number can change width, a CSS-only streaming caret, thin scrollbars tuned per surface, custom `::selection`, and `<title>` / `<meta description>` written for the product rather than the framework.

---

## 3. Architecture

### 3.1 Component tree

```
<App>
└── <StoreProvider>                      src/store.tsx — React context, no external state library
    └── <Shell>
        ├── <Ticker/>                    corpus tape: indexed filings, pages, LIVE / DEMO
        ├── <Sidebar/>                   desktop rail  (and as a motion drawer on mobile)
        ├── <main>
        │   ├── mobile top bar
        │   └── <AnimatePresence mode="wait">
        │       ├── <ChatView/>
        │       │   ├── <ScopePicker/>   per-thread document scope
        │       │   ├── <Hero/>          empty state: stats + suggestions
        │       │   ├── <MessageItem/>*  user bubble | assistant block
        │       │   │   ├── <ResearchTrail/>   sub-process timeline (auto-collapses)
        │       │   │   ├── <CiteMarkdown/>    react-markdown + GFM, [n] → chips
        │       │   │   └── source cards       page, excerpt, score bar
        │       │   └── <Composer/>      auto-grow textarea, send / stop
        │       └── <LibraryView/>
        │           ├── <DocRow/>*       table rows + in-flight upload rows
        │           ├── <UploadDrawer/>  file picker, metadata form, progress (sample filing in demo mode)
        │           └── <DocDetailDrawer/>
        ├── <SourceDrawer/>              citation inspector
        ├── <Toasts/>
        └── <Splash/>
```

### 3.2 State: `src/store.tsx`

A single provider exposes a typed `Store` through `useStore()`. It owns:

| Slice | Shape | Behaviour |
|---|---|---|
| Navigation | `view`, `mobileNav`, `booted` | `boot()` loads documents, health and remembered threads in parallel; the splash waits for all three |
| Documents | `documents`, `uploading[]`, `libraryOpenDocId` | `uploadFiles(files, meta)` posts real `File`s with per-file progress and surfaces the server's `detail` on 400/422; `watchDocument()` polls `getDocument` until a document is `ready`/`failed` (only the demo transport ever reports an in-flight state — the API indexes synchronously) |
| Conversations | `conversations`, `activeId`, `active`, `draftScope`, `streaming` | `send()` lazily creates a conversation (title = first question, scope = `draftScope` or the whole library) and subscribes to the stream; `patchConversation()` keeps the list sorted by `updated_at` |
| Thread index | `localStorage["fincite.threads"]` | The API has no *list conversations* endpoint, so `{ id, title, created_at }` is remembered locally and **re-hydrated on boot** via `GET /api/conversation/{id}` — history, research trails and citations all come back from the server; ids that 404 are dropped |
| Streaming | `cancelStream` ref | `stopStreaming()` aborts the request and finalises the partial answer in place |
| Health | `health { status, latency }` | Probed at boot and every 25 s |
| Citations | `selectedSource` | `openSource()` / `closeSource()` drive the drawer |
| Toasts | `toasts[]` | FIFO, max 3, 4.6 s TTL, optional action (e.g. *Open library* when you ask before indexing anything) |

All mutations are immutable updates inside `useCallback`s; streaming patches only the last assistant message of the active conversation. `onSubProcess` is an **upsert**, so transports may introduce steps they did not announce up front.

### 3.3 Transport: `src/lib/api.ts`

The UI never touches `fetch` directly. It calls a tiny `api` facade whose methods mirror the backend contract one-to-one:

```
api.health()  ·  api.listDocuments()  ·  api.getDocument(id)  ·  api.uploadDocument(file, meta, onProgress) → { promise, cancel }
api.createConversation({ title, document_scope })  ·  api.getConversation(id, title)  ·  api.deleteConversation(id)
api.streamMessage(conversationId, question, handlers) → cancel()
```

Two implementations sit behind the facade, selected at build time by `import.meta.env.VITE_USE_MOCK`:

| | `RealTransport` (default) | `MockTransport` (`--mode mock`) |
|---|---|---|
| Documents | `GET /api/document/`, `GET /api/document/{id}`, `XMLHttpRequest` multipart upload with progress and the metadata form fields | Seeded six-filing corpus; uploads enter a **simulated pipeline** (`parsing → chunking → embedding → indexing`) that the UI polls |
| Conversations | `POST` / `GET` / `DELETE /api/conversation` | In-memory map |
| Streaming | `fetch` + `ReadableStream` over `/api/conversation/{id}/message`, cancellable with `AbortController`; snapshots are diffed into handler calls (§6) | Pattern-matched canned answers; sub-process steps with realistic durations, then tokens in 1–2 word bursts at 12–38 ms |

The **streaming handler contract** is the seam between transport and store:

```ts
interface StreamHandlers {
  onUserMessage(msg)                       // echo of the user's turn
  onAssistantCreated(msg)                  // placeholder assistant message
  onSubProcess(stepId, patch)              // upsert: status / duration / detail
  onToken(token)                           // append a delta (token transports)
  onContent(content)                       // replace content (snapshot transports)
  onDone({ content, sources })             // finalise; attach citations
  onError(message)                         // mark failed; toast
}
```

Any transport that honours this interface — SSE, WebSocket, or fetch-streaming — plugs in without touching components.

### 3.4 Rendering answers: `CiteMarkdown`

Assistant content is Markdown. `CiteMarkdown` pre-processes `[1]`, `[2]` … into `#cite-n` links, then renders through `react-markdown` + `remark-gfm` with a custom component map: citation links become **clickable chips** wired to `openSource`, external links open in a new tab, tables get horizontal scroll, block-quotes use the display italic. The streaming state renders raw text with the caret and switches to Markdown on completion, so partial syntax never flashes broken.

---

## 4. Directory structure

```
frontend/
├── index.html                  # fonts (Fraunces, Space Grotesk, IBM Plex Mono), SVG favicon, meta
├── vite.config.ts              # plugin-react · tailwind · singlefile · /api dev proxy · VITE_USE_MOCK by mode
├── tsconfig.json               # strict, bundler resolution, noUnused*, "@/*" paths
├── package.json
├── scripts/adapter-check/      # stub_api.py (protocol stand-in) + drive.mjs (lifecycle assertions)
└── src/
    ├── main.tsx                # StrictMode root
    ├── vite-env.d.ts           # typed import.meta.env
    ├── App.tsx                 # Shell + Splash
    ├── store.tsx               # StoreProvider / useStore
    ├── index.css               # Tailwind v4 @theme tokens, grain, caret, scrollbars, md tables
    ├── lib/
    │   ├── api.ts              # facade · RealTransport · MockTransport · StreamHandlers
    │   ├── backend.ts          # wire types + mappers (Document, Conversation, Message, sub-process, citations) · SSE reader
    │   ├── types.ts            # FinDocument, Conversation, ChatMessage, MessageSubProcess, Source, UploadMeta …
    │   ├── format.ts           # labels, fiscal-year + size formatters, pipeline stages, symbolHue(), uid()
    │   └── mockData.ts         # demo corpus: SEED_DOCUMENTS, ANSWER_BANK, FALLBACK_EXCERPT, SUGGESTIONS
    ├── components/
    │   ├── ChatView.tsx        # header + ScopePicker · Hero · message list · composer footer
    │   ├── Composer.tsx        # textarea, shortcuts, send/stop
    │   ├── MessageItem.tsx     # user / assistant rendering, source cards, copy
    │   ├── ResearchTrail.tsx   # sub-process timeline
    │   ├── CiteMarkdown.tsx    # markdown + citation chips
    │   ├── SourceDrawer.tsx    # citation inspector
    │   ├── LibraryView.tsx     # table, drag-drop, UploadDrawer, DocDetailDrawer
    │   ├── Sidebar.tsx         # nav, threads, health
    │   ├── Ticker.tsx          # corpus tape
    │   ├── Monogram.tsx        # hash-coloured ticker initials
    │   └── Toasts.tsx
    └── utils/cn.ts             # clsx + tailwind-merge
```

`vite-plugin-singlefile` inlines JS and CSS into `dist/index.html`, so a production build is a **single static file** that can be dropped on any host or served by the backend.

---

## 5. Live mode and demo mode

The same bundle runs in two modes; nothing in `components/` knows which one is active.

| | Live (default) | Demo (`npm run dev:mock` / `npm run build:mock`) |
|---|---|---|
| Data | Your filings, indexed by the FastAPI backend; answers from Gemini over pgvector | Six seeded NSE annual reports and five canned, fully-cited answers |
| Streaming | Real SSE from `/api/conversation/{id}/message` | Simulated research trail + token stream |
| Uploads | Real multipart upload → synchronous ingestion → `ready` | Simulated pipeline with stage-by-stage progress |
| Threads | Persisted server-side, re-hydrated on reload | In-memory for the session |
| Tape | `CORPUS n filings · pages · LIVE` | `… · DEMO` plus a *sample filing* button in the upload drawer |

Demo mode exists so the interface can be reviewed — on a laptop, in a design critique, in a deployed static preview — without a Gemini key or a database. It is a build flag, not a code path the live app can fall into.

---

## 6. The backend adapter

`RealTransport` talks to the FastAPI service exactly as it is; every shape difference between the API and the UI's domain types is absorbed in [`src/lib/backend.ts`](src/lib/backend.ts):

| Concern | API ([schema.py](../backend/app/schema.py)) | What the adapter does |
|---|---|---|
| **Create conversation** | `POST { document_ids: UUID[] }` → `{ id, messages, documents }` | Sends the scope as `document_ids` (an empty UI scope means *every ready document*, because the engine builds one retrieval tool per scoped filing); the title stays client-side |
| **Message stream** | Unnamed SSE events, each a **full `Message` snapshot**; `status ∈ PENDING · SUCCESS · ERROR`; `: ping` comments every 15 s; `\r\n\r\n` framing | `readSse()` parses the stream from a `fetch` body (no `EventSource`, which would auto-reconnect and *re-send the question*); consecutive snapshots are diffed into `onContent`, `onSubProcess` and finally `onDone` / `onError` |
| **Sub-processes** | `{ source: <CBEventType>, status: PENDING · FINISHED, metadata_map? }`, `id: null` while streaming | Keyed by stream index; `source` mapped to a UI category and a human name (`agent_step → Agent reasoning`, `sub_question → the question text`, `retrieve → Vector retrieval`, `synthesize → Synthesising answer`); noisy internals (`llm`, `templating`, `embedding`, `query`, `tree`) hidden; `duration_ms` measured client-side |
| **Citations** | `sub_processes[].metadata_map.sub_question.citations[] { document_id, page_number, text, score }` | Flattened across sub-questions, de-duplicated by `(document, page, text)`, ranked by score and numbered — so source cards render even when the answer prose carries no `[n]` markers |
| **Documents** | `{ url, metadata_map: { nse_document {…}, content_hash, original_filename, page_count, file_size }, created_at }` | Mapped to `FinDocument`; every listed document is `ready`; `financial_year "2025"` → `FY2024-25`; missing symbol → initials of the company name |
| **Timestamps** | Naive UTC without a zone suffix; rows arrive unordered | `Z` appended before parsing; messages and sub-processes sorted on the raw microsecond string with a user-before-assistant tie-break |
| **Upload** | multipart `file` + optional `company_name · company_symbol · financial_year · document_type · exchange`; `400` / `422` with `detail` | `FormData` built from the drawer's metadata form; progress from `xhr.upload`; `detail` shown verbatim in the toast and the upload row |
| **Health** | `{ status: "alive" }` | `alive → healthy`; network failure → `down` |
| **Empty library** | `GET /api/document/` returns **404** when there are no rows | Treated as `[]` |

Everything above is pinned down by a **protocol-level check** that lives in the repo. [`scripts/adapter-check/stub_api.py`](scripts/adapter-check/stub_api.py) is a stand-in server that reproduces the backend's exact framing, naive timestamps, `null` ids, 404-on-empty and unordered history; [`scripts/adapter-check/drive.mjs`](scripts/adapter-check/drive.mjs) bundles the real `api.ts` with esbuild and walks the whole lifecycle — health → list → upload → create → stream → re-hydrate → delete — with twenty assertions:

```bash
cd backend  && uv run python ../frontend/scripts/adapter-check/stub_api.py   # terminal 1
cd frontend && npm run check:adapter                                          # terminal 2
```

---

## 7. Getting started

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5173 — live mode, /api proxied to the backend
npm run dev:mock       # same UI on the seeded demo corpus, no backend needed
npm run typecheck      # tsc --noEmit (strict, noUnused*)
npm run build          # single-file bundle → dist/index.html
npm run build:mock     # a self-contained demo build you can host anywhere
npm run preview        # serve the production build locally (proxy included)
npm run check:adapter  # protocol check of the live transport against scripts/adapter-check/stub_api.py
```

| Variable | Default | Purpose |
|---|---|---|
| `VITE_PROXY_TARGET` | `http://localhost:8000` | Where the dev / preview server forwards `/api/*` |
| `VITE_API_URL` | *(empty → same origin)* | Set only when the built file is served from a different origin than the API; add that origin to the backend's `BACKEND_CORS_ORIGINS` |
| `VITE_USE_MOCK` | `false` (`true` under `--mode mock`) | Selects the transport at build time |

Node 20+ is recommended (Vite 7). Because `dist/index.html` is a single static file, the simplest deployment is to serve it next to the API under one origin — no CORS, no environment variables.

---

## 8. Interaction details

| Interaction | Behaviour |
|---|---|
| `Enter` / `Shift+Enter` | Send / newline in the composer; the textarea auto-grows to 168 px |
| `⌘K` / `Ctrl+K` | Focus the composer from anywhere |
| Stop button | Appears while streaming; aborts the request and keeps whatever was already answered |
| Auto-scroll | Sticks to the bottom while streaming unless you have scrolled more than 260 px up |
| Research trail | Expanded while working; auto-collapses 1.4 s after the last step completes; click to toggle |
| Citation chip `[n]` / source card | Opens the source drawer; "Open filing in library" jumps to that document's detail drawer |
| Scope picker | Editable before a thread exists (empty = whole library); once the first message is sent the scope is fixed server-side and the picker becomes a read-only view of what the thread reads from |
| Drag-and-drop | Anywhere on the library view; depth-counted so nested elements don't flicker the overlay |
| Delete thread | Two-step inline confirmation in the sidebar |
| Health dot | Green pulsing = healthy, amber = degraded, red = unreachable; latency shown in ms |
| Tape | One cell per filing in the corpus; animates only when there are more than six |
| Upload errors | Server `detail` (not a PDF, duplicate, indexing failure) shown inline on the upload row and as a toast |
| Mobile | Sidebar becomes a slide-in rail; table columns collapse below `lg`; drawers go full-width |

---

## 9. Roadmap

- [ ] In-app PDF viewer in the source drawer, scrolled to the cited page (the stored PDF URL is already on every document).
- [ ] Background ingestion with progress events once the API indexes asynchronously — the polling path and pipeline UI are in place.
- [ ] A *list conversations* endpoint so threads follow the user across devices instead of living in `localStorage`.
- [ ] Virtualised message list and library table for very large corpora.
- [ ] Component tests (Vitest + Testing Library) for `CiteMarkdown`, `ResearchTrail` and the store's streaming reducer, on top of the existing protocol-level adapter check.
- [ ] Accessibility pass: focus trapping in drawers, `aria-live` for streaming, reduced-motion variants.
