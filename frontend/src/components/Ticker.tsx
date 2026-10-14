import { Database, FileText, Loader2 } from "lucide-react";
import { useStore } from "../store";
import { USE_MOCK } from "../lib/api";
import { DOC_TYPE_SHORT } from "../lib/format";

/**
 * Terminal-style tape across the top of the app. Instead of market prices it
 * shows the corpus the model can currently read from: one cell per indexed
 * filing, plus anything still moving through the ingestion pipeline.
 */
export default function Ticker() {
  const { documents, health } = useStore();

  const cells = documents.map((d) => ({
    key: d.id,
    symbol: d.metadata.nse_symbol,
    label: `${DOC_TYPE_SHORT[d.metadata.document_type]} ${d.metadata.period}`,
    pages: d.metadata.pages,
    busy: d.status !== "ready" && d.status !== "failed",
    failed: d.status === "failed",
  }));

  const ready = cells.filter((c) => !c.busy && !c.failed).length;
  const totalPages = documents
    .filter((d) => d.status === "ready")
    .reduce((a, d) => a + d.metadata.pages, 0);

  const summary = (
    <span className="flex h-full items-center gap-2 border-r border-line-dark/60 px-4 font-mono text-[10px] tracking-wide">
      <Database size={10} className="text-accent" />
      <span className="text-bone/50">CORPUS</span>
      <span className="tnum text-bone/90">
        {ready} {ready === 1 ? "filing" : "filings"}
      </span>
      {totalPages > 0 && <span className="tnum text-bone/50">{totalPages.toLocaleString("en-IN")} pages</span>}
      <span className="text-bone/30">·</span>
      <span className="text-bone/50">{USE_MOCK ? "DEMO" : health?.status === "healthy" ? "LIVE" : "API"}</span>
    </span>
  );

  // Duplicate the tape so the marquee loops seamlessly; keep it static when short.
  const loop = cells.length > 6;
  const tape = loop ? [...cells, ...cells] : cells;

  return (
    <div className="relative z-30 h-7 shrink-0 overflow-hidden border-b border-line-dark bg-soot text-bone/80">
      <div className={`flex h-full w-max items-center ${loop ? "animate-marquee" : ""}`}>
        {summary}
        {tape.length === 0 && (
          <span className="flex h-full items-center gap-2 px-4 font-mono text-[10px] tracking-wide text-bone/50">
            <FileText size={10} />
            No filings indexed yet — upload a PDF to start the tape
          </span>
        )}
        {tape.map((c, i) => (
          <span
            key={`${c.key}-${i}`}
            className="flex h-full items-center gap-2 border-r border-line-dark/60 px-4 font-mono text-[10px] tracking-wide"
          >
            <span className="text-bone/90">{c.symbol}</span>
            <span className="text-bone/50">{c.label}</span>
            {c.busy ? (
              <span className="flex items-center gap-1 text-accent">
                <Loader2 size={9} className="animate-spin" />
                indexing
              </span>
            ) : c.failed ? (
              <span className="text-red-400/90">failed</span>
            ) : (
              c.pages > 0 && <span className="tnum text-emerald-400/90">{c.pages}p</span>
            )}
          </span>
        ))}
        {loop && summary}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-soot to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-soot to-transparent" />
    </div>
  );
}
