"""
Protocol-faithful stand-in for the Fincite backend — no database, LLM or storage.

It reproduces the parts of the real API that the frontend adapter has to cope
with: flat upload responses, 404 on an empty list, naive UTC timestamps, SSE
`Message` snapshots with `id: null` sub-processes, `: ping` comments, and an
unordered message list on re-fetch.

Run from the backend environment (it only needs fastapi, sse-starlette, pypdf):

    cd backend && uv run python ../frontend/scripts/adapter-check/stub_api.py

then, in another shell:  cd frontend && npm run check:adapter
"""
import asyncio, datetime as dt, hashlib, io, json, uuid
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def now():  # naive UTC, like the real backend
    return dt.datetime.utcnow().isoformat()

DOCS: dict = {}
CONVOS: dict = {}

def seed(name, sym, dtype, fy, pages, size):
    did = str(uuid.uuid4())
    DOCS[did] = {
        "id": did, "created_at": now(), "updated_at": now(),
        "url": f"https://example.supabase.co/storage/v1/object/public/fincite-documents/documents/{did}/original.pdf",
        "metadata_map": {
            "nse_document": {"company_name": name, "company_symbol": sym, "document_type": dtype,
                              "financial_year": fy, "report_date": None, "exchange": "NSE",
                              "original_filename": f"{sym.lower()}-{dtype}-{fy}.pdf"},
            "content_hash": hashlib.sha256(name.encode()).hexdigest(),
            "original_filename": f"{sym.lower()}-{dtype}-{fy}.pdf",
            "page_count": pages, "file_size": size,
        },
    }
seed("Reliance Industries", "RELIANCE", "annual_report", "2025", 412, 18_400_000)
seed("Tata Consultancy Services", "TCS", "annual_report", "2025", 358, 12_100_000)

@app.get("/api/health/")
def health():
    return {"status": "alive"}

@app.get("/api/document/")
def list_docs(document_ids: Optional[List[str]] = Query(None)):
    docs = list(DOCS.values())
    if document_ids:
        docs = [d for d in docs if d["id"] in document_ids]
    if not docs:
        raise HTTPException(404, "Document(s) not found")
    return docs

@app.get("/api/document/{doc_id}")
def get_doc(doc_id: str):
    if doc_id not in DOCS:
        raise HTTPException(404, "Document not found")
    return DOCS[doc_id]

@app.post("/api/document/upload", status_code=201)
async def upload(file: UploadFile = File(...), company_name: Optional[str] = Form(None),
                 company_symbol: Optional[str] = Form(None), financial_year: Optional[str] = Form(None),
                 document_type: Optional[str] = Form("annual_report"), exchange: Optional[str] = Form("NSE")):
    content = await file.read()
    if not content.startswith(b"%PDF"):
        raise HTTPException(400, "The uploaded file does not appear to be a valid PDF.")
    h = hashlib.sha256(content).hexdigest()
    for d in DOCS.values():
        if d["metadata_map"]["content_hash"] == h:
            return {**d, "status": "indexed"}
    try:
        from pypdf import PdfReader
        pages = len(PdfReader(io.BytesIO(content)).pages)
    except Exception:
        pages = None
    await asyncio.sleep(1.5)  # pretend to embed
    did = str(uuid.uuid4())
    fname = file.filename or "document.pdf"
    DOCS[did] = {
        "id": did, "created_at": now(), "updated_at": now(),
        "url": f"https://example.supabase.co/storage/v1/object/public/fincite-documents/documents/{did}/original.pdf",
        "metadata_map": {
            "nse_document": {"company_name": company_name or fname.replace(".pdf", "").replace("-", " ").title(),
                              "company_symbol": company_symbol, "document_type": document_type or "annual_report",
                              "financial_year": financial_year, "report_date": None, "exchange": exchange or "NSE",
                              "original_filename": fname},
            "content_hash": h, "original_filename": fname, "page_count": pages, "file_size": len(content),
        },
    }
    return {**DOCS[did], "status": "indexed"}

class ConvoCreate(BaseModel):
    document_ids: List[str] = []

@app.post("/api/conversation/")
def create_convo(payload: ConvoCreate):
    missing = [i for i in payload.document_ids if i not in DOCS]
    if missing:
        raise HTTPException(404, f"Documents not found: {', '.join(missing)}")
    cid = str(uuid.uuid4())
    CONVOS[cid] = {"id": cid, "created_at": now(), "updated_at": now(), "messages": [],
                   "documents": [DOCS[i] for i in payload.document_ids]}
    return CONVOS[cid]

@app.get("/api/conversation/{cid}")
def get_convo(cid: str):
    if cid not in CONVOS:
        raise HTTPException(404, "Conversation not found")
    c = CONVOS[cid]
    # the real backend returns messages/sub_processes unordered; shuffle to prove sorting works
    msgs = list(reversed(c["messages"]))
    return {**c, "messages": msgs}

@app.delete("/api/conversation/{cid}", status_code=204)
def delete_convo(cid: str):
    if cid not in CONVOS:
        raise HTTPException(404, "Conversation not found")
    del CONVOS[cid]
    return None

@app.get("/api/conversation/{cid}/message")
async def message(cid: str, user_message: str):
    if cid not in CONVOS:
        raise HTTPException(404, "Conversation not found")
    convo = CONVOS[cid]
    docs = convo["documents"] or list(DOCS.values())
    mid = str(uuid.uuid4())
    user_msg = {"id": str(uuid.uuid4()), "created_at": now(), "updated_at": now(), "conversation_id": cid,
                "content": user_message, "role": "user", "status": "SUCCESS", "sub_processes": []}

    async def gen():
        subs = []
        msg = {"id": mid, "created_at": now(), "updated_at": now(), "conversation_id": cid,
               "content": "", "role": "assistant", "status": "PENDING", "sub_processes": subs}
        def snap():
            return json.dumps(msg)
        def add(source, meta=None):
            subs.append({"id": None, "created_at": now(), "updated_at": None, "message_id": mid,
                         "source": source, "status": "PENDING", "metadata_map": meta})
            return len(subs) - 1
        def finish(i):
            subs[i]["status"] = "FINISHED"

        i = add("agent_step"); yield snap(); await asyncio.sleep(0.4)
        j = add("llm"); yield snap(); await asyncio.sleep(0.3); finish(j); yield snap()
        k = add("sub_questions"); yield snap(); await asyncio.sleep(0.3); finish(k); yield snap()
        for d in docs[:2]:
            nse = d["metadata_map"]["nse_document"]
            q = add("sub_question", {"sub_question": {
                "question": f"What does the {nse['company_name']} filing say about: {user_message}?",
                "answer": f"{nse['company_name']} reports the figure on page 112 of its filing.",
                "citations": [{"document_id": d["id"], "text": f"Excerpt from {nse['company_name']}: revenue from operations grew 7.2% year on year.", "page_number": 112, "score": 0.81},
                              {"document_id": d["id"], "text": f"Second excerpt from {nse['company_name']}: EBITDA margin expanded by 40 bps.", "page_number": 118, "score": 0.66}]}})
            yield snap()
            r = add("retrieve"); yield snap(); await asyncio.sleep(0.3); finish(r); yield snap()
            e = add("embedding"); finish(e); yield snap()
            s = add("synthesize"); yield snap(); await asyncio.sleep(0.3); finish(s); yield snap()
            finish(q); yield snap()
        finish(i)
        text = (f"Based on the indexed filings, **revenue from operations grew 7.2%** year on year [1], "
                f"while EBITDA margin expanded by about 40 bps [2].\n\n"
                f"| Metric | Value |\n|---|---|\n| Revenue growth | 7.2% |\n| Margin change | +40 bps |")
        for n in range(0, len(text), 24):
            msg["content"] = text[: n + 24]; yield snap(); await asyncio.sleep(0.05)
        # terminal snapshot: persisted ids, SUCCESS
        for s_ in subs:
            s_["id"] = str(uuid.uuid4())
        msg["status"] = "SUCCESS"; msg["updated_at"] = now()
        convo["messages"].extend([user_msg, json.loads(snap())])
        yield snap()

    return EventSourceResponse(gen(), ping=1)

if __name__ == "__main__":
    import uvicorn
    import os
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("STUB_PORT", "8011")), log_level="warning")
