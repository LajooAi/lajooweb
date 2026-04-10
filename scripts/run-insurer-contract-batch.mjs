import { randomUUID } from 'node:crypto';
import {
  InsurerGatewayError,
  getActiveInsurerPlatformInfo,
  health,
  getToken,
  vehicleLookup,
  createQuoteJob,
  getQuoteJobStatus,
  getQuoteResult,
  repriceQuote,
} from '../src/lib/insurers/platform.js';

const SAMPLE_CASES = [
  { sampleId: 'CAR01', plate: 'JRT9289', ownerIdType: 'nric', ownerId: '951018145405', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR02', plate: 'WXY1234', ownerIdType: 'nric', ownerId: '900101105544', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR03', plate: 'ABC5678', ownerIdType: 'nric', ownerId: '880303106677', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR04', plate: 'BND2020', ownerIdType: 'nric', ownerId: '920909106688', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR05', plate: 'VHX7721', ownerIdType: 'nric', ownerId: '950505141212', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR06', plate: 'QQA8810', ownerIdType: 'company_reg', ownerId: '202001234567', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR07', plate: 'FID5566', ownerIdType: 'foreign_id', ownerId: 'A12345678', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR08', plate: 'EHL3344', ownerIdType: 'nric', ownerId: '930707107799', usageType: 'ehailing', expectedDecline: false },
  { sampleId: 'CAR09', plate: 'REF9090', ownerIdType: 'nric', ownerId: '870202108811', usageType: 'private', expectedDecline: false },
  { sampleId: 'CAR10', plate: 'DCL4040', ownerIdType: 'nric', ownerId: '810101109922', usageType: 'private', expectedDecline: true },
];

function parseArgs(argv) {
  const args = {
    adapter: process.env.INSURER_PLATFORM_ADAPTER || process.env.INSURER_API_PROVIDER || 'mockoon_aggregator',
    only: '',
    help: false,
  };

  const tokens = [...argv];
  while (tokens.length > 0) {
    const token = tokens.shift();
    if (!token || !token.startsWith('--')) continue;

    if (token === '--help') {
      args.help = true;
      continue;
    }

    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const value = inlineValue ?? tokens.shift();
    if (value == null) {
      throw new Error(`Missing value for argument "${rawKey}"`);
    }

    if (key === 'adapter') {
      args.adapter = value;
      continue;
    }
    if (key === 'only') {
      args.only = value;
      continue;
    }

    throw new Error(`Unknown argument "${rawKey}"`);
  }

  return args;
}

function printHelp() {
  console.log(`
Batch insurer contract runner (10 mock cars)

Usage:
  node scripts/run-insurer-contract-batch.mjs [options]

Options:
  --adapter <key>     Adapter key (default: mockoon_aggregator)
  --only <ids>        Comma-separated sample IDs, e.g. CAR01,CAR06,CAR10
  --help              Show this help
  `.trim());
}

function buildCorrelation(step, sampleId) {
  return `batch-${sampleId}-${step}-${randomUUID().slice(0, 8)}`;
}

function extractData(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function asErrorSummary(error) {
  if (error instanceof InsurerGatewayError) {
    return {
      message: error.message || 'Gateway error',
      code: error.code || null,
      status: error.status || null,
      endpoint: error.endpoint || null,
    };
  }
  return {
    message: error?.message || String(error),
    code: null,
    status: null,
    endpoint: null,
  };
}

function selectedCases(args) {
  const wanted = String(args.only || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

  if (wanted.length === 0) return SAMPLE_CASES;
  return SAMPLE_CASES.filter((c) => wanted.includes(c.sampleId));
}

function roadTaxOptionForCase(c) {
  if (c.ownerIdType === 'foreign_id' || c.ownerIdType === 'company_reg') {
    return 'printed_12m';
  }
  return 'digital_12m';
}

function addOnsForCase(c) {
  if (c.usageType === 'ehailing') return ['windscreen', 'ehailing'];
  return ['windscreen', 'flood'];
}

async function runOneCase(testCase, options) {
  const lookup = await vehicleLookup(
    {
      plate_number: testCase.plate,
      owner_id_type: testCase.ownerIdType,
      owner_id: testCase.ownerId,
      usage_type: testCase.usageType,
    },
    {
      ...options,
      correlationId: buildCorrelation('lookup', testCase.sampleId),
    }
  );

  const vehicle = extractData(lookup);
  const sampleId = String(vehicle?.sample_id || '').trim();
  const vehicleRefId = String(vehicle?.vehicle_ref_id || '').trim();

  if (!sampleId || !vehicleRefId) {
    throw new Error(`Vehicle lookup missing sample fields: ${JSON.stringify(vehicle || {})}`);
  }

  const job = await createQuoteJob(
    {
      sample_id: sampleId,
      vehicle_ref_id: vehicleRefId,
      coverage_type: 'comprehensive',
      effective_date: '2026-04-05',
    },
    {
      ...options,
      correlationId: buildCorrelation('quotejob', testCase.sampleId),
      idempotencyKey: `idem-batch-${testCase.sampleId}-${randomUUID().slice(0, 8)}`,
    }
  );
  const jobData = extractData(job);
  const jobId = String(jobData?.job_id || '').trim();
  if (!jobId) {
    throw new Error(`Quote job missing job_id: ${JSON.stringify(jobData || {})}`);
  }

  await getQuoteJobStatus(jobId, {
    ...options,
    stage: 'done',
    correlationId: buildCorrelation('status', testCase.sampleId),
  });

  try {
    const result = await getQuoteResult(jobId, {
      ...options,
      correlationId: buildCorrelation('result', testCase.sampleId),
    });

    const resultData = extractData(result);
    const quotes = Array.isArray(resultData?.quotes) ? resultData.quotes : [];
    const firstQuote = quotes[0];
    const quoteId = String(firstQuote?.quote_id || '').trim();

    if (!quoteId) {
      throw new Error(`Quote result missing quote_id: ${JSON.stringify(resultData || {})}`);
    }

    const repriced = await repriceQuote(
      quoteId,
      {
        owner_id_type: testCase.ownerIdType,
        selected_addons: addOnsForCase(testCase),
        roadtax_option: roadTaxOptionForCase(testCase),
      },
      {
        ...options,
        correlationId: buildCorrelation('reprice', testCase.sampleId),
      }
    );
    const repriceData = extractData(repriced);
    const grandTotal = Number(repriceData?.grand_total || 0);

    return {
      status: 'pass',
      sampleId: testCase.sampleId,
      plate: testCase.plate,
      quoteCount: quotes.length,
      grandTotal: Number.isFinite(grandTotal) ? grandTotal : null,
    };
  } catch (error) {
    if (
      error instanceof InsurerGatewayError &&
      testCase.expectedDecline &&
      (error.code === 'UW_DECLINED' || error.status === 409)
    ) {
      return {
        status: 'expected_decline',
        sampleId: testCase.sampleId,
        plate: testCase.plate,
        code: error.code || null,
      };
    }
    throw error;
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const batchCases = selectedCases(args);
  if (batchCases.length === 0) {
    throw new Error('No valid sample cases selected for --only.');
  }

  const options = { provider: args.adapter };
  const active = getActiveInsurerPlatformInfo(options);

  console.log(`[INFO] adapter=${active.key} mode=${active.mode} cases=${batchCases.length}`);

  await health(options);
  const token = await getToken(options);
  if (!token || typeof token !== 'string') {
    throw new Error('Token acquisition failed before batch run.');
  }

  const results = [];
  for (const testCase of batchCases) {
    try {
      const result = await runOneCase(testCase, options);
      results.push(result);
      if (result.status === 'expected_decline') {
        console.log(`[PASS-DECLINE] ${result.sampleId} ${result.plate} code=${result.code || 'UW_DECLINED'}`);
      } else {
        console.log(`[PASS] ${result.sampleId} ${result.plate} quotes=${result.quoteCount} total=${result.grandTotal ?? 'n/a'}`);
      }
    } catch (error) {
      const summary = asErrorSummary(error);
      results.push({
        status: 'fail',
        sampleId: testCase.sampleId,
        plate: testCase.plate,
        ...summary,
      });
      console.log(
        `[FAIL] ${testCase.sampleId} ${testCase.plate} status=${summary.status ?? 'n/a'} code=${summary.code ?? 'n/a'} msg=${summary.message}`
      );
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const expectedDeclines = results.filter((r) => r.status === 'expected_decline').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const total = results.length;

  console.log('');
  console.log('Batch summary');
  console.log(`- total: ${total}`);
  console.log(`- pass: ${passed}`);
  console.log(`- expected_decline: ${expectedDeclines}`);
  console.log(`- fail: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  const summary = asErrorSummary(error);
  console.error('[FATAL] batch runner aborted');
  console.error(`status=${summary.status ?? 'n/a'} code=${summary.code ?? 'n/a'} endpoint=${summary.endpoint ?? 'n/a'}`);
  console.error(`message=${summary.message}`);
  process.exitCode = 1;
});
