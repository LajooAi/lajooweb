import prisma from "./prisma.js";

const QUERY_STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "am",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "can",
  "does",
  "do",
  "did",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "how",
  "i",
  "if",
  "in",
  "is",
  "include",
  "into",
  "it",
  "its",
  "just",
  "me",
  "more",
  "need",
  "of",
  "on",
  "or",
  "policy",
  "should",
  "she",
  "that",
  "the",
  "their",
  "there",
  "them",
  "they",
  "this",
  "to",
  "too",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "would",
  "you",
  "your",
]);

function tokenizeQuery(query) {
  const rawTokens = [...new Set(String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((word) => word.length >= 3))];

  const filtered = rawTokens.filter((word) => !QUERY_STOP_WORDS.has(word));
  return (filtered.length > 0 ? filtered : rawTokens).slice(0, 12);
}

function truncateText(text, maxLength = 360) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}…`;
}

function mergeKnowledgeResults(dbResults = [], staticResults = [], limit = 6) {
  const map = new Map();
  for (const item of [...dbResults, ...staticResults]) {
    const key = `${String(item.question || "").toLowerCase()}|${String(item.answer || "").toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()]
    .sort((a, b) => {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const aIsDb = String(a.sourceType || "").startsWith("db_");
      const bIsDb = String(b.sourceType || "").startsWith("db_");
      if (aIsDb === bIsDb) return 0;
      return aIsDb ? -1 : 1;
    })
    .slice(0, limit);
}

function extractInsurerHints(query) {
  const q = String(query || "").toLowerCase();
  const hints = new Set();

  if (q.includes("allianz")) hints.add("ALLIANZ");
  if (q.includes("etiqa")) hints.add("ETIQA");
  if (q.includes("takaful") || q.includes("ikhlas")) hints.add("TAKAFUL");

  return [...hints];
}

function stripInsurerNameTerms(terms = []) {
  const insurerTerms = new Set(["allianz", "etiqa", "takaful", "ikhlas"]);
  const filtered = terms.filter((term) => !insurerTerms.has(String(term || "").toLowerCase()));
  return filtered.length > 0 ? filtered : terms;
}

function expandDomainTerms(query, terms = []) {
  const expanded = new Set(terms.map((t) => String(t || "").toLowerCase()).filter(Boolean));
  const q = String(query || "").toLowerCase();

  if (expanded.has("betterment") || q.includes("zero betterment")) {
    expanded.add("waiver");
    expanded.add("a201");
    expanded.add("contribution");
  }

  if (expanded.has("windscreen")) {
    expanded.add("glass");
  }

  if (expanded.has("flood")) {
    expanded.add("special");
    expanded.add("perils");
  }

  return [...expanded];
}

function termWeight(term) {
  const normalized = String(term || "").toLowerCase();
  if (!normalized) return 0;
  if (["waiver", "betterment", "a201", "windscreen", "flood", "roadtax", "road", "tax"].includes(normalized)) {
    return 3;
  }
  if (normalized.length >= 8) return 2;
  return 1;
}

export async function searchInsurerKnowledgeFromDb(query, options = {}) {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const insurerHints = extractInsurerHints(query);
  const scopedTerms = insurerHints.length > 0 ? stripInsurerNameTerms(terms) : terms;
  const scoredTerms = expandDomainTerms(query, scopedTerms).slice(0, 16);
  const maxChunks = Number(options.maxChunks || 10);
  const maxChunkCandidates = Number(options.maxChunkCandidates || Math.max(maxChunks * 20, 260));

  const termClausesFor = (field) => scoredTerms.map((term) => ({
    [field]: { contains: term, mode: "insensitive" },
  }));

  const insurerScope = insurerHints.length > 0
    ? { insurer: { code: { in: insurerHints } } }
    : {};

  try {
    const chunkRows = await prisma.knowledgeChunk.findMany({
      where: {
        ...insurerScope,
        OR: termClausesFor("chunkText"),
      },
      include: {
        insurer: { select: { code: true, name: true } },
        policyDocument: { select: { title: true, sourceFileName: true } },
      },
      take: maxChunkCandidates,
    });

    const chunkResults = chunkRows
      .map((row) => {
        const sourceName = row.policyDocument?.title || row.policyDocument?.sourceFileName || "Policy Document";
        const insurerCode = String(row.insurer?.code || "").toUpperCase();
        const insurerName = String(row.insurer?.name || "").toLowerCase();
        const insurerBoost = insurerHints.length === 0
          ? 0
          : insurerHints.includes(insurerCode)
            ? 3
            : insurerHints.some((hint) => insurerName.includes(hint.toLowerCase()))
              ? 2
              : -1;
        const text = String(row.chunkText || "").toLowerCase();
        const weightedScore = scoredTerms.reduce((sum, term) => {
          if (!term) return sum;
          return text.includes(term) ? sum + termWeight(term) : sum;
        }, 0);
        const score = weightedScore + insurerBoost;
        return {
          id: `db-chunk-${row.id}`,
          category: "Policy Documents",
          question: `${row.insurer?.name || "Insurer"}: ${sourceName}`,
          answer: truncateText(row.chunkText, 320),
          keywords: [],
          score,
          sourceType: "db_chunk",
          insurerCode: insurerCode || null,
        };
      })
      .filter((item) => item.score > 0);

    return chunkResults
      .sort((a, b) => b.score - a.score)
      .slice(0, Number(options.limit || 6));
  } catch (error) {
    console.warn("[insurer-knowledge-db] policy chunk search failed.", error?.message || error);
    return [];
  }
}

export { mergeKnowledgeResults };
