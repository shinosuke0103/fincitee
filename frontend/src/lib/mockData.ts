/**
 * Demo corpus for mock mode (`npm run dev:mock`).
 *
 * Lets the full research experience run in the browser with no backend:
 * a seeded filing library, canned grounded answers with page-level sources,
 * and suggestion prompts. Figures are headline numbers from public FY2024-25
 * filings, quoted for illustration; page references are indicative.
 */
import type { FinDocument, SubProcessSource } from "./types";

/* ------------------------------------------------------------------ */
/*  Seeded filing library                                              */
/* ------------------------------------------------------------------ */

export const SEED_DOCUMENTS: FinDocument[] = [
  {
    id: "doc_reliance_ar_fy25",
    filename: "reliance-industries-annual-report-2024-25.pdf",
    status: "ready",
    progress: 100,
    uploaded_at: "2026-10-09T04:12:00.000Z",
    metadata: {
      company_name: "Reliance Industries",
      nse_symbol: "RELIANCE",
      document_type: "annual_report",
      fiscal_year: "FY2024-25",
      period: "Annual · Mar 2025",
      pages: 476,
      file_size: 18_900_000,
      language: "en",
    },
  },
  {
    id: "doc_tcs_ar_fy25",
    filename: "tcs-integrated-annual-report-2024-25.pdf",
    status: "ready",
    progress: 100,
    uploaded_at: "2026-10-09T04:20:00.000Z",
    metadata: {
      company_name: "Tata Consultancy Services",
      nse_symbol: "TCS",
      document_type: "annual_report",
      fiscal_year: "FY2024-25",
      period: "Annual · Mar 2025",
      pages: 364,
      file_size: 14_200_000,
      language: "en",
    },
  },
  {
    id: "doc_infy_ar_fy25",
    filename: "infosys-integrated-annual-report-2024-25.pdf",
    status: "ready",
    progress: 100,
    uploaded_at: "2026-10-10T09:41:00.000Z",
    metadata: {
      company_name: "Infosys",
      nse_symbol: "INFY",
      document_type: "annual_report",
      fiscal_year: "FY2024-25",
      period: "Annual · Mar 2025",
      pages: 392,
      file_size: 15_600_000,
      language: "en",
    },
  },
  {
    id: "doc_hdfcbank_ar_fy25",
    filename: "hdfc-bank-integrated-annual-report-2024-25.pdf",
    status: "ready",
    progress: 100,
    uploaded_at: "2026-10-11T06:05:00.000Z",
    metadata: {
      company_name: "HDFC Bank",
      nse_symbol: "HDFCBANK",
      document_type: "annual_report",
      fiscal_year: "FY2024-25",
      period: "Annual · Mar 2025",
      pages: 512,
      file_size: 21_300_000,
      language: "en",
    },
  },
  {
    id: "doc_bajfin_ip_q4fy25",
    filename: "bajaj-finance-q4-fy25-investor-presentation.pdf",
    status: "ready",
    progress: 100,
    uploaded_at: "2026-10-12T11:30:00.000Z",
    metadata: {
      company_name: "Bajaj Finance",
      nse_symbol: "BAJFINANCE",
      document_type: "investor_presentation",
      fiscal_year: "FY2024-25",
      period: "Q4 · Mar 2025",
      pages: 58,
      file_size: 4_160_000,
      language: "en",
    },
  },
  {
    id: "doc_itc_ar_fy25",
    filename: "itc-report-and-accounts-2025.pdf",
    status: "ready",
    progress: 100,
    uploaded_at: "2026-10-13T07:55:00.000Z",
    metadata: {
      company_name: "ITC",
      nse_symbol: "ITC",
      document_type: "annual_report",
      fiscal_year: "FY2024-25",
      period: "Annual · Mar 2025",
      pages: 440,
      file_size: 17_100_000,
      language: "en",
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Canned answers                                                     */
/* ------------------------------------------------------------------ */

export interface PlanStep {
  name: string;
  source: SubProcessSource;
  duration_ms: number;
  detail: string;
}

export interface CannedSource {
  doc_id: string;
  page: number;
  excerpt: string;
  score: number;
}

export interface CannedAnswer {
  id: string;
  patterns: RegExp[];
  plan: PlanStep[];
  answer: string;
  sources: CannedSource[];
}

const step = (
  name: string,
  source: SubProcessSource,
  duration_ms: number,
  detail: string
): PlanStep => ({ name, source, duration_ms, detail });

export const ANSWER_BANK: CannedAnswer[] = [
  {
    id: "reliance-revenue",
    patterns: [/reliance.*(revenue|turnover|top ?line)/i, /(revenue|turnover).*reliance/i],
    plan: [
      step("Built research engine", "engine", 420, "1 retrieval tool · RELIANCE annual report FY2024-25"),
      step("Planning sub-questions", "llm", 610, "1 sub-question · scoped to RELIANCE"),
      step("What was Reliance Industries' revenue from operations in FY2025 and FY2024?", "retrieval", 1040, "3 passages retrieved · pages 212, 214, 48"),
      step("Synthesising answer", "llm", 0, "Grounded generation"),
    ],
    answer:
      "Reliance Industries reported **consolidated revenue from operations of ₹ 9,64,693 Crore in FY2025**, up from ₹ 9,01,064 Crore in FY2024 — growth of roughly 7.1% [1].\n\nThe standalone statement of profit and loss shows the increase was led by the Oil-to-Chemicals segment, with Jio Platforms and Retail contributing the bulk of the incremental growth [2].\n\n| Metric (₹ Crore) | FY2025 | FY2024 |\n|---|---|---|\n| Revenue from operations | 9,64,693 | 9,01,064 |\n| Profit after tax | 81,309 | 79,020 |\n\nFigures are consolidated and quoted exactly as reported in the annual report.",
    sources: [
      {
        doc_id: "doc_reliance_ar_fy25",
        page: 212,
        excerpt:
          "Revenue from operations for the year ended 31 March 2025 stood at ₹ 9,64,693 crore as against ₹ 9,01,064 crore in the previous year.",
        score: 0.84,
      },
      {
        doc_id: "doc_reliance_ar_fy25",
        page: 48,
        excerpt:
          "Growth was led by continued momentum in the consumer businesses — Jio Platforms and Reliance Retail — alongside a resilient O2C performance.",
        score: 0.71,
      },
    ],
  },
  {
    id: "tcs-vs-infy",
    patterns: [/(tcs|tata consultancy).*(infosys|infy)/i, /(infosys|infy).*(tcs|tata consultancy)/i],
    plan: [
      step("Built research engine", "engine", 460, "2 retrieval tools · TCS, INFY"),
      step("Planning sub-questions", "llm", 720, "2 sub-questions · one per filing"),
      step("What were TCS's revenue and net profit in FY2025?", "retrieval", 980, "3 passages · pages 188, 190, 23"),
      step("What were Infosys' revenue and net profit in FY2025?", "retrieval", 1010, "3 passages · pages 201, 205, 31"),
      step("Synthesising answer", "llm", 0, "Cross-document synthesis"),
    ],
    answer:
      "Both companies grew in FY2025, with TCS remaining the larger franchise by a wide margin and Infosys posting the faster top-line growth.\n\n| ₹ Crore | TCS FY2025 | TCS FY2024 | Infosys FY2025 | Infosys FY2024 |\n|---|---|---|---|---|\n| Revenue from operations | 2,55,324 [1] | 2,40,893 | 1,62,990 [2] | 1,53,670 |\n| Net profit | 48,553 [1] | 45,908 | 26,713 [2] | 26,233 |\n\n- **TCS** grew revenue about 6.0% and net profit about 5.8% year on year, attributing the year to deal-closure strength and AI-led services demand [1].\n- **Infosys** grew revenue about 6.1% in rupee terms, with the annual report calling out a 3.9% constant-currency growth rate and large-deal TCV as the drivers [2].\n\nEach figure is attributed to the respective company's FY2024-25 annual report and preserved in ₹ Crore as reported.",
    sources: [
      {
        doc_id: "doc_tcs_ar_fy25",
        page: 188,
        excerpt:
          "Revenue from operations ₹ 2,55,324 crore (previous year ₹ 2,40,893 crore). Profit for the year ₹ 48,553 crore (previous year ₹ 45,908 crore).",
        score: 0.86,
      },
      {
        doc_id: "doc_infy_ar_fy25",
        page: 201,
        excerpt:
          "Revenue from operations for fiscal 2025 was ₹ 1,62,990 crore, a growth of 6.1% over fiscal 2024. Net profit stood at ₹ 26,713 crore.",
        score: 0.82,
      },
    ],
  },
  {
    id: "hdfc-profit",
    patterns: [/hdfc.*(profit|pat|earnings|net income)/i, /(profit|pat|earnings).*hdfc/i],
    plan: [
      step("Built research engine", "engine", 400, "1 retrieval tool · HDFCBANK annual report FY2024-25"),
      step("Planning sub-questions", "llm", 580, "1 sub-question"),
      step("What was HDFC Bank's net profit in FY2025 compared with FY2024?", "retrieval", 1120, "3 passages · pages 96, 97, 240"),
      step("Synthesising answer", "llm", 0, "Grounded generation"),
    ],
    answer:
      "HDFC Bank's **standalone net profit for FY2025 was ₹ 67,347 Crore**, against ₹ 60,812 Crore in FY2024 — an increase of about 10.7% [1].\n\nThe Directors' Report attributes the growth to net interest income expansion on a larger post-merger balance sheet, partly offset by higher provisions; the bank also notes that FY2024 figures are not strictly comparable because the merger with HDFC Ltd. became effective on 1 July 2023 [2].",
    sources: [
      {
        doc_id: "doc_hdfcbank_ar_fy25",
        page: 96,
        excerpt:
          "The Bank's net profit for the year ended March 31, 2025 was ₹ 67,347 crore, up 10.7% over the year ended March 31, 2024 (₹ 60,812 crore).",
        score: 0.88,
      },
      {
        doc_id: "doc_hdfcbank_ar_fy25",
        page: 97,
        excerpt:
          "Figures for the previous year include the merged entity only from July 1, 2023 and are therefore not comparable.",
        score: 0.69,
      },
    ],
  },
  {
    id: "bajaj-aum",
    patterns: [/bajaj.*(aum|assets under management|book|loan)/i, /(aum|assets under management).*bajaj/i],
    plan: [
      step("Built research engine", "engine", 380, "1 retrieval tool · BAJFINANCE investor deck Q4 FY25"),
      step("Planning sub-questions", "llm", 540, "1 sub-question"),
      step("What was Bajaj Finance's AUM and profit after tax for FY2025?", "retrieval", 860, "3 passages · pages 4, 6, 12"),
      step("Synthesising answer", "llm", 0, "Grounded generation"),
    ],
    answer:
      "Per the Q4 FY25 investor presentation, Bajaj Finance closed FY2025 with **assets under management of ₹ 4,16,661 Crore**, up about 26% year on year [1], and **profit after tax of ₹ 16,779 Crore** for the full year [2].\n\nThe deck highlights 14.7 million new loans booked in the quarter and a customer franchise crossing 101 million [1]. Credit cost guidance for FY26 is discussed qualitatively but not quantified in the retrieved pages.",
    sources: [
      {
        doc_id: "doc_bajfin_ip_q4fy25",
        page: 4,
        excerpt:
          "AUM grew 26% to ₹ 4,16,661 crore as of 31 March 2025. New loans booked during Q4 FY25 were 14.7 MM; customer franchise stood at 101.82 MM.",
        score: 0.83,
      },
      {
        doc_id: "doc_bajfin_ip_q4fy25",
        page: 6,
        excerpt: "Profit after tax for FY25 was ₹ 16,779 crore, a growth of 16% over FY24.",
        score: 0.77,
      },
    ],
  },
  {
    id: "risk-factors",
    patterns: [/risk/i, /headwind/i, /threat/i],
    plan: [
      step("Built research engine", "engine", 480, "Retrieval tools for every filing in scope"),
      step("Planning sub-questions", "llm", 760, "Risk disclosures · one sub-question per filing"),
      step("What principal risks does management identify?", "retrieval", 1180, "Risk management sections across the corpus"),
      step("Synthesising answer", "llm", 0, "Thematic synthesis"),
    ],
    answer:
      "Across the selected filings, management commentary converges on four risk themes:\n\n1. **Macro and demand volatility** — TCS flags discretionary-spend softness in North American BFSI and retail verticals [1].\n2. **Technology disruption** — Infosys lists generative AI as both an opportunity and a risk to legacy service lines, with talent re-skilling as the mitigation [2].\n3. **Credit and liquidity cycles** — HDFC Bank's risk section centres on unsecured retail credit quality and deposit mobilisation in a tight-liquidity environment [3].\n4. **Regulatory and ESG transition** — Reliance highlights carbon-pricing exposure in O2C and execution risk on its new-energy capex programme [4].\n\nEach point is attributed to the specific company's FY2024-25 report; the corpus does not include a cross-company risk ranking.",
    sources: [
      {
        doc_id: "doc_tcs_ar_fy25",
        page: 142,
        excerpt:
          "Continued caution in discretionary technology spending, particularly in BFSI and retail in North America, remains a key demand-side risk.",
        score: 0.79,
      },
      {
        doc_id: "doc_infy_ar_fy25",
        page: 118,
        excerpt:
          "Rapid advances in generative AI could compress revenue in traditional application services; we are mitigating through large-scale reskilling and platform investments.",
        score: 0.76,
      },
      {
        doc_id: "doc_hdfcbank_ar_fy25",
        page: 176,
        excerpt:
          "Asset quality in unsecured retail segments and the pace of deposit accretion are monitored as principal risks under the Bank's ICAAP framework.",
        score: 0.74,
      },
      {
        doc_id: "doc_reliance_ar_fy25",
        page: 133,
        excerpt:
          "Evolving carbon pricing regimes and the execution of the new energy giga-factory programme are identified as key strategic risks.",
        score: 0.72,
      },
    ],
  },
];

/** Closest grounded passage per document, used when no canned answer matches */
export const FALLBACK_EXCERPT: Record<string, { page: number; excerpt: string }> = {
  doc_reliance_ar_fy25: {
    page: 44,
    excerpt:
      "The Company continued to strengthen its consumer and new-energy platforms while maintaining industry-leading O2C margins through the year.",
  },
  doc_tcs_ar_fy25: {
    page: 21,
    excerpt:
      "Order book TCV for the year stood at US$ 39.4 billion, with AI and GenAI engagements now embedded across most large deals.",
  },
  doc_infy_ar_fy25: {
    page: 29,
    excerpt:
      "Large deal TCV of US$ 11.6 billion for the year, 56% of which was net new, underpinned the outlook for fiscal 2026.",
  },
  doc_hdfcbank_ar_fy25: {
    page: 88,
    excerpt:
      "Total deposits grew 14.1% to ₹ 27.1 lakh crore while gross advances grew 5.4%, in line with the Bank's stated priority of bringing down the credit-deposit ratio.",
  },
  doc_bajfin_ip_q4fy25: {
    page: 9,
    excerpt:
      "Gross NPA and net NPA stood at 0.96% and 0.44% respectively as of 31 March 2025.",
  },
  doc_itc_ar_fy25: {
    page: 36,
    excerpt:
      "The FMCG-Others segment delivered resilient growth despite subdued demand conditions and elevated input-cost inflation across key categories.",
  },
};

/* ------------------------------------------------------------------ */
/*  Suggestions (work in both demo and live mode)                      */
/* ------------------------------------------------------------------ */

export const SUGGESTIONS: { question: string; tags: string[] }[] = [
  {
    question: "What was Reliance's revenue from operations in FY2025 versus FY2024?",
    tags: ["quantitative", "year-on-year"],
  },
  {
    question: "Compare TCS and Infosys on revenue and net profit for FY2025.",
    tags: ["cross-document", "comparison"],
  },
  {
    question: "What principal risks does management identify in these filings?",
    tags: ["qualitative", "risk"],
  },
  {
    question: "How much did HDFC Bank's net profit grow in FY2025?",
    tags: ["banking", "profitability"],
  },
];
