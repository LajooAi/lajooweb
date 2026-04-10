import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "./_load-env.mjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { file: "data/insurer-facts.json" };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file" && argv[i + 1]) {
      args.file = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function toDate(value) {
  if (!value) return null;
  return new Date(value);
}

async function readJson(filePath) {
  const full = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(full, "utf-8");
  return JSON.parse(raw);
}

async function upsertInsurers(insurers = []) {
  const byCode = new Map();

  for (const insurer of insurers) {
    const row = await prisma.insurer.upsert({
      where: { code: insurer.code },
      update: {
        name: insurer.name,
        type: insurer.type,
        isActive: true,
      },
      create: {
        code: insurer.code,
        name: insurer.name,
        type: insurer.type,
      },
    });
    byCode.set(row.code, row);
  }

  return byCode;
}

async function importFacts(input, insurerMap) {
  let inserted = 0;
  let updated = 0;

  for (const fact of input.facts || []) {
    const insurer = insurerMap.get(fact.insurer_code);
    if (!insurer) {
      throw new Error(`Unknown insurer_code in facts: ${fact.insurer_code}`);
    }

    const validFrom = toDate(fact.valid_from);
    const validTo = toDate(fact.valid_to);
    const sourcePage = Number.isInteger(fact.source_page) ? fact.source_page : null;
    const sourceExcerpt = fact.source_excerpt || null;
    const status = fact.status || "DRAFT";

    const existing = await prisma.insurerFact.findFirst({
      where: {
        insurerId: insurer.id,
        factType: fact.fact_type,
        title: fact.title,
        value: fact.value,
        validFrom,
        validTo,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.insurerFact.update({
        where: { id: existing.id },
        data: {
          status,
          sourcePage,
          sourceExcerpt,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.insurerFact.create({
      data: {
        insurerId: insurer.id,
        factType: fact.fact_type,
        title: fact.title,
        value: fact.value,
        validFrom,
        validTo,
        status,
        sourcePage,
        sourceExcerpt,
      },
    });
    inserted += 1;
  }

  return { inserted, updated };
}

async function importPromotions(input, insurerMap) {
  let inserted = 0;
  let updated = 0;

  for (const promo of input.promotions || []) {
    const insurer = insurerMap.get(promo.insurer_code);
    if (!insurer) {
      throw new Error(`Unknown insurer_code in promotions: ${promo.insurer_code}`);
    }

    const validFrom = new Date(promo.valid_from);
    const validTo = new Date(promo.valid_to);
    const sourcePage = Number.isInteger(promo.source_page) ? promo.source_page : null;
    const sourceExcerpt = promo.source_excerpt || null;
    const status = promo.status || "UPCOMING";

    const existing = await prisma.insurerPromotion.findFirst({
      where: {
        insurerId: insurer.id,
        title: promo.title,
        description: promo.description,
        validFrom,
        validTo,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.insurerPromotion.update({
        where: { id: existing.id },
        data: {
          status,
          sourcePage,
          sourceExcerpt,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.insurerPromotion.create({
      data: {
        insurerId: insurer.id,
        title: promo.title,
        description: promo.description,
        validFrom,
        validTo,
        status,
        sourcePage,
        sourceExcerpt,
      },
    });
    inserted += 1;
  }

  return { inserted, updated };
}

async function main() {
  const args = parseArgs(process.argv);
  const payload = await readJson(args.file);

  const insurerMap = await upsertInsurers(payload.insurers || []);
  const factSummary = await importFacts(payload, insurerMap);
  const promoSummary = await importPromotions(payload, insurerMap);

  console.log(`Imported insurers: ${insurerMap.size}`);
  console.log(`Facts inserted: ${factSummary.inserted}`);
  console.log(`Facts updated: ${factSummary.updated}`);
  console.log(`Promotions inserted: ${promoSummary.inserted}`);
  console.log(`Promotions updated: ${promoSummary.updated}`);
}

main()
  .catch((error) => {
    console.error("Import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
