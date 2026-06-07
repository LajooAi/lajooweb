import process from 'node:process';
import './_load-env.mjs';
import {
  formatStrictReadinessReport,
  summarizeStrictFactReadiness,
} from '../src/server/knowledge/strictReadiness.js';
import prisma from '../src/lib/prisma.js';

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    failOnNotReady: argv.includes('--fail-on-not-ready'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await summarizeStrictFactReadiness();

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatStrictReadinessReport(report));
  }

  if (args.failOnNotReady && !report.strictModeReady) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('Strict readiness audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
