import process from "node:process";
import "./_load-env.mjs";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_KNOWLEDGE_EMBEDDING_MODEL,
  generateKnowledgeEmbeddings,
  updateKnowledgeChunkEmbedding,
} from "../src/server/knowledge/semanticSearch.js";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    limit: 300,
    batchSize: 32,
    insurerCode: null,
    replaceExisting: false,
    dryRun: false,
    mvpOnly: true,
    model: process.env.OPENAI_EMBEDDING_MODEL ||
      process.env.LAJOO_KNOWLEDGE_EMBEDDING_MODEL ||
      DEFAULT_KNOWLEDGE_EMBEDDING_MODEL,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
    } else if (token === "--batch-size" && next) {
      args.batchSize = Number(next);
      i += 1;
    } else if (token === "--insurer" && next) {
      args.insurerCode = String(next).trim().toUpperCase();
      i += 1;
    } else if (token === "--model" && next) {
      args.model = String(next).trim();
      i += 1;
    } else if (token === "--replace-existing") {
      args.replaceExisting = true;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--all") {
      args.mvpOnly = false;
    }
  }

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.ceil(args.limit) : 300;
  args.batchSize = Number.isFinite(args.batchSize) && args.batchSize > 0
    ? Math.min(Math.ceil(args.batchSize), 64)
    : 32;
  return args;
}

async function loadChunkBatch(args) {
  const where = {
    chunkText: { not: "" },
    ...(args.replaceExisting ? {} : { embeddingModel: null }),
    ...(args.insurerCode ? { insurer: { code: args.insurerCode } } : {}),
    ...(args.mvpOnly ? { policyDocument: { useForPrivateCarMvp: true } } : {}),
  };

  return prisma.knowledgeChunk.findMany({
    where,
    include: {
      insurer: { select: { code: true, name: true } },
      policyDocument: {
        select: {
          title: true,
          sourceRelativePath: true,
          useForPrivateCarMvp: true,
        },
      },
    },
    orderBy: [
      { createdAt: "asc" },
      { policyDocumentId: "asc" },
      { chunkOrder: "asc" },
    ],
    take: args.limit,
  });
}

function buildEmbeddingInput(chunk) {
  const insurer = chunk.insurer?.name || chunk.insurer?.code || "Insurer";
  const document = chunk.policyDocument?.sourceRelativePath || chunk.policyDocument?.title || "Policy document";
  const page = chunk.pageNumber ? `Page ${chunk.pageNumber}` : "Page unknown";
  return [
    `Insurer: ${insurer}`,
    `Document: ${document}`,
    page,
    "",
    chunk.chunkText,
  ].join("\n");
}

async function embedBatch(batch, args) {
  const inputs = batch.map(buildEmbeddingInput);
  const { embeddings, model } = await generateKnowledgeEmbeddings(inputs, { model: args.model });
  for (let index = 0; index < batch.length; index += 1) {
    await updateKnowledgeChunkEmbedding({
      chunkId: batch[index].id,
      embedding: embeddings[index],
      model,
      prismaClient: prisma,
    });
  }
  return model;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to embed knowledge chunks.");
  }
  if (!process.env.OPENAI_API_KEY && !args.dryRun) {
    throw new Error("OPENAI_API_KEY is required to embed knowledge chunks. Use --dry-run to inspect selected chunks.");
  }

  const chunks = await loadChunkBatch(args);
  console.log(`Selected chunks: ${chunks.length}`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : "embed"} | model=${args.model} | batchSize=${args.batchSize} | mvpOnly=${args.mvpOnly}`);
  if (args.insurerCode) console.log(`Insurer: ${args.insurerCode}`);
  if (args.replaceExisting) console.log("Replacing existing embeddings: yes");

  if (chunks.length === 0) {
    console.log("No chunks need embeddings.");
    return;
  }

  for (const chunk of chunks.slice(0, 8)) {
    console.log(`- ${chunk.insurer?.code || "?"} ${chunk.policyDocument?.sourceRelativePath || chunk.policyDocument?.title || "document"} p.${chunk.pageNumber || "?"} chunk ${chunk.chunkOrder}`);
  }
  if (chunks.length > 8) console.log(`...and ${chunks.length - 8} more`);
  if (args.dryRun) return;

  let embedded = 0;
  let model = args.model;
  for (let start = 0; start < chunks.length; start += args.batchSize) {
    const batch = chunks.slice(start, start + args.batchSize);
    model = await embedBatch(batch, args);
    embedded += batch.length;
    console.log(`Embedded ${embedded}/${chunks.length}`);
  }

  console.log(`Done. Embedded ${embedded} chunk(s) with ${model}.`);
}

main()
  .catch((error) => {
    console.error("Knowledge embedding failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
