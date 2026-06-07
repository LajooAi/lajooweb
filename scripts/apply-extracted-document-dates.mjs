import process from 'node:process';
import './_load-env.mjs';
import prisma from '../src/lib/prisma.js';
import { extractDocumentDating } from '../src/server/knowledge/documentDating.js';

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    applyToFacts: argv.includes('--apply-to-facts'),
    includeVersionOnly: argv.includes('--include-version-only'),
    overwriteDocumentDates: argv.includes('--overwrite-document-dates'),
    overwriteFactDates: argv.includes('--overwrite-fact-dates'),
    privateCarOnly: !argv.includes('--all-documents'),
  };
}

function hasDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function formatDate(value) {
  return hasDate(value) ? value.toISOString().slice(0, 10) : null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function buildDocumentUpdate(document, dating, args) {
  const update = {};

  if (hasDate(dating.effectiveFrom) && (args.overwriteDocumentDates || !document.effectiveFrom)) {
    update.effectiveFrom = dating.effectiveFrom;
  }
  if (hasDate(dating.effectiveTo) && (args.overwriteDocumentDates || !document.effectiveTo)) {
    update.effectiveTo = dating.effectiveTo;
  }
  if (dating.versionLabel && !document.versionLabel) {
    update.versionLabel = dating.versionLabel;
  }

  return update;
}

function buildFactDateUpdate(dating, args) {
  const update = {};
  if (hasDate(dating.effectiveFrom)) update.validFrom = dating.effectiveFrom;
  if (hasDate(dating.effectiveTo)) update.validTo = dating.effectiveTo;
  return update;
}

function buildFactWhere(documentId, factDateUpdate, args) {
  const where = { policyDocumentId: documentId };
  if (!args.overwriteFactDates) {
    const clauses = [];
    if (hasOwn(factDateUpdate, 'validFrom')) clauses.push({ validFrom: null });
    if (hasOwn(factDateUpdate, 'validTo')) clauses.push({ validTo: null });
    if (clauses.length > 0) where.OR = clauses;
  }
  return where;
}

async function loadDocuments(args) {
  return prisma.policyDocument.findMany({
    where: {
      extractedText: { not: null },
      ...(args.privateCarOnly ? { useForPrivateCarMvp: true } : {}),
    },
    include: {
      insurer: { select: { code: true, name: true } },
      _count: { select: { facts: true } },
    },
    orderBy: [{ insurer: { code: 'asc' } }, { sourceRelativePath: 'asc' }],
  });
}

function summarizeResult(result) {
  return [
    result.action,
    result.insurerCode,
    result.sourceRelativePath,
    `doc=${JSON.stringify(result.documentUpdate)}`,
    `facts=${result.affectedFacts}`,
  ].join(' | ');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const documents = await loadDocuments(args);
  const results = [];

  for (const document of documents) {
    const dating = extractDocumentDating({
      text: document.extractedText,
      fileName: document.sourceFileName,
      relativePath: document.sourceRelativePath,
    });
    const hasExtractedDate = hasDate(dating.effectiveFrom) || hasDate(dating.effectiveTo);
    if (!hasExtractedDate && !(args.includeVersionOnly && dating.versionLabel)) continue;

    const documentUpdate = buildDocumentUpdate(document, dating, args);
    const factDateUpdate = buildFactDateUpdate(dating, args);
    let affectedFacts = 0;
    if (args.applyToFacts && Object.keys(factDateUpdate).length > 0) {
      affectedFacts = await prisma.insurerFact.count({
        where: buildFactWhere(document.id, factDateUpdate, args),
      });
    }

    if (Object.keys(documentUpdate).length === 0 && affectedFacts === 0) {
      continue;
    }

    if (args.apply) {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(documentUpdate).length > 0) {
          await tx.policyDocument.update({
            where: { id: document.id },
            data: documentUpdate,
          });
        }

        if (args.applyToFacts && Object.keys(factDateUpdate).length > 0) {
          const result = await tx.insurerFact.updateMany({
            where: buildFactWhere(document.id, factDateUpdate, args),
            data: factDateUpdate,
          });
          affectedFacts = result.count;
        }
      });
    }

    results.push({
      action: args.apply ? 'applied' : 'dry-run',
      insurerCode: document.insurer?.code || 'UNKNOWN',
      sourceRelativePath: document.sourceRelativePath,
      extractedEffectiveFrom: formatDate(dating.effectiveFrom),
      extractedEffectiveTo: formatDate(dating.effectiveTo),
      extractedVersionLabel: dating.versionLabel || null,
      documentUpdate: {
        ...(hasOwn(documentUpdate, 'effectiveFrom') ? { effectiveFrom: formatDate(documentUpdate.effectiveFrom) } : {}),
        ...(hasOwn(documentUpdate, 'effectiveTo') ? { effectiveTo: formatDate(documentUpdate.effectiveTo) } : {}),
        ...(hasOwn(documentUpdate, 'versionLabel') ? { versionLabel: documentUpdate.versionLabel } : {}),
      },
      affectedFacts,
    });
  }

  for (const result of results) {
    console.log(summarizeResult(result));
  }

  console.log('---');
  console.log(`Mode: ${args.apply ? 'apply' : 'dry-run'}`);
  console.log(`Documents scanned: ${documents.length}`);
  console.log(`Documents with source-supported updates: ${results.length}`);
  console.log(`Facts ${args.apply ? 'updated' : 'would update'}: ${results.reduce((sum, item) => sum + item.affectedFacts, 0)}`);
  if (!args.apply) {
    console.log('No database changes were made. Re-run with --apply to update documents, and --apply-to-facts to date linked facts.');
  }
}

main()
  .catch((error) => {
    console.error('Applying extracted document dates failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
