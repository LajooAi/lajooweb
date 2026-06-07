import './_load-env.mjs';
import prisma from '../src/lib/prisma.js';

const SHOULD_APPLY = process.argv.includes('--apply');

const GENERIC_BRAND_PROGRAM_WHERE = {
  category: 'brand_program',
  AND: [
    { value: { contains: 'imported private-car', mode: 'insensitive' } },
    { value: { contains: 'programme or product wording', mode: 'insensitive' } },
  ],
};

const REVIEW_ADVISOR_USE =
  'Admin must verify this is a real brand programme or product eligibility rule before AI uses it. Example vehicle mentions in a PDS are not enough evidence.';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to review generated brand-program facts.');
  }

  const facts = await prisma.insurerFact.findMany({
    where: GENERIC_BRAND_PROGRAM_WHERE,
    select: {
      id: true,
      status: true,
      confidence: true,
      title: true,
      sourceRelativePath: true,
      sourcePage: true,
      insurer: { select: { code: true, name: true } },
    },
    orderBy: [{ insurer: { code: 'asc' } }, { updatedAt: 'desc' }],
  });

  console.log(`Generic generated brand-program facts found: ${facts.length}`);
  for (const fact of facts.slice(0, 40)) {
    console.log([
      fact.insurer?.code || 'UNKNOWN',
      fact.status,
      fact.confidence || 'no-confidence',
      fact.title,
      fact.sourceRelativePath || 'no-source',
      fact.sourcePage ? `p.${fact.sourcePage}` : 'no-page',
      fact.id,
    ].join(' | '));
  }
  if (facts.length > 40) {
    console.log(`...${facts.length - 40} more not shown`);
  }

  if (!SHOULD_APPLY) {
    console.log('Dry run only. Re-run with --apply to move these facts to DRAFT review.');
    return;
  }

  const result = await prisma.insurerFact.updateMany({
    where: GENERIC_BRAND_PROGRAM_WHERE,
    data: {
      status: 'DRAFT',
      confidence: 'low',
      advisorUse: REVIEW_ADVISOR_USE,
    },
  });

  console.log(`Updated ${result.count} generic brand-program fact(s) to DRAFT review.`);
}

main()
  .catch((error) => {
    console.error('Brand-program fact review failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null);
  });
