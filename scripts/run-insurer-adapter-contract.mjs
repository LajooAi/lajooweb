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
  createProposal,
  submitProposal,
  createPaymentIntent,
  confirmPaymentIntent,
  issuePolicy,
} from '../src/lib/insurers/platform.js';
import { getAvailableAdapters } from '../src/lib/insurers/registry.js';

const DEFAULTS = {
  adapter: process.env.INSURER_PLATFORM_ADAPTER || process.env.INSURER_API_PROVIDER || 'mockoon_aggregator',
  mode: 'quote',
  plate: 'JRT9289',
  ownerIdType: 'nric',
  ownerId: '951018145405',
  usageType: 'private',
  coverageType: 'comprehensive',
  effectiveDate: '2026-04-05',
  roadtaxOption: 'digital_12m',
  addons: 'windscreen,flood',
  paymentMethod: 'card',
  simulatePayment: '',
};

const HELP_TEXT = `
Insurer adapter contract runner

Usage:
  node scripts/run-insurer-adapter-contract.mjs [options]

Options:
  --list-adapters             Show registered adapters and exit
  --adapter <key>             Adapter key (default: ${DEFAULTS.adapter})
  --mode <quote|full>         quote = through reprice, full = through policy issue
  --plate <plate>             Vehicle plate number
  --owner-id-type <type>      nric | foreign_id | company_reg
  --owner-id <value>          Owner identity number
  --usage-type <type>         private | ehailing
  --coverage-type <type>      comprehensive (default)
  --effective-date <YYYY-MM-DD>
  --roadtax-option <id>       digital_12m | printed_12m | none
  --addons <a,b,c>            Comma-separated add-on IDs
  --payment-method <method>   card | fpx | ewallet | bnpl
  --simulate-payment <mode>   decline | timeout (for failure tests)
  --help                      Show this help
`;

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    listAdapters: false,
    help: false,
  };

  const tokens = [...argv];
  while (tokens.length > 0) {
    const token = tokens.shift();
    if (!token || !token.startsWith('--')) continue;

    if (token === '--list-adapters') {
      args.listAdapters = true;
      continue;
    }
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

    switch (key) {
      case 'adapter':
        args.adapter = value;
        break;
      case 'mode':
        args.mode = value;
        break;
      case 'plate':
        args.plate = value;
        break;
      case 'owner-id-type':
        args.ownerIdType = value;
        break;
      case 'owner-id':
        args.ownerId = value;
        break;
      case 'usage-type':
        args.usageType = value;
        break;
      case 'coverage-type':
        args.coverageType = value;
        break;
      case 'effective-date':
        args.effectiveDate = value;
        break;
      case 'roadtax-option':
        args.roadtaxOption = value;
        break;
      case 'addons':
        args.addons = value;
        break;
      case 'payment-method':
        args.paymentMethod = value;
        break;
      case 'simulate-payment':
        args.simulatePayment = value;
        break;
      default:
        throw new Error(`Unknown argument "${rawKey}"`);
    }
  }

  return args;
}

function listAdapters() {
  const adapters = getAvailableAdapters();
  console.log('Registered insurer adapters:');
  for (const adapter of adapters) {
    console.log(`- ${adapter.key} (${adapter.mode}): ${adapter.name}`);
  }
}

function extractData(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function toAddonsArray(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function ensure(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function correlation(step) {
  return `contract-${step}-${randomUUID().slice(0, 8)}`;
}

function logStep(step, status, details = '') {
  const suffix = details ? ` | ${details}` : '';
  console.log(`[${status}] ${step}${suffix}`);
}

function normalizeMode(mode) {
  const value = String(mode || '').toLowerCase();
  return value === 'full' ? 'full' : 'quote';
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT.trim());
    return;
  }

  if (args.listAdapters) {
    listAdapters();
    return;
  }

  const mode = normalizeMode(args.mode);
  const provider = String(args.adapter || '').trim();
  const options = { provider };
  const addOns = toAddonsArray(args.addons);

  const active = getActiveInsurerPlatformInfo(options);
  logStep('Adapter', 'INFO', `${active.key} (${active.mode})`);

  const healthRes = await health(options);
  logStep('Health', 'PASS', JSON.stringify(extractData(healthRes) || {}));

  const token = await getToken(options);
  ensure(typeof token === 'string' && token.length > 0, 'Token response is empty.');
  logStep('OAuth token', 'PASS', `len=${token.length}`);

  const vehicleRes = await vehicleLookup(
    {
      plate_number: args.plate,
      owner_id_type: args.ownerIdType,
      owner_id: args.ownerId,
      usage_type: args.usageType,
    },
    {
      ...options,
      correlationId: correlation('vehicle'),
    }
  );
  const vehicle = extractData(vehicleRes);
  ensure(vehicle && typeof vehicle === 'object', 'Vehicle lookup response missing data object.', vehicleRes);

  const sampleId = String(vehicle.sample_id || '').trim();
  const vehicleRefId = String(vehicle.vehicle_ref_id || '').trim();
  ensure(sampleId, 'Vehicle lookup did not return sample_id.', vehicle);
  ensure(vehicleRefId, 'Vehicle lookup did not return vehicle_ref_id.', vehicle);
  logStep('Vehicle lookup', 'PASS', `${sampleId} (${vehicleRefId})`);

  const quoteJobRes = await createQuoteJob(
    {
      sample_id: sampleId,
      vehicle_ref_id: vehicleRefId,
      coverage_type: args.coverageType,
      effective_date: args.effectiveDate,
    },
    {
      ...options,
      correlationId: correlation('quotejob'),
      idempotencyKey: `idem-contract-${randomUUID().slice(0, 8)}`,
    }
  );
  const quoteJob = extractData(quoteJobRes);
  const jobId = String(quoteJob?.job_id || '').trim();
  ensure(jobId, 'Create quote job did not return job_id.', quoteJob);
  logStep('Create quote job', 'PASS', jobId);

  const quoteJobStatusRes = await getQuoteJobStatus(jobId, {
    ...options,
    stage: 'done',
    correlationId: correlation('qstatus'),
  });
  const quoteJobStatus = extractData(quoteJobStatusRes);
  ensure(quoteJobStatus && typeof quoteJobStatus === 'object', 'Quote job status payload invalid.', quoteJobStatusRes);
  logStep('Quote job status', 'PASS', String(quoteJobStatus?.status || 'UNKNOWN'));

  const quoteResultRes = await getQuoteResult(jobId, {
    ...options,
    correlationId: correlation('qresult'),
  });
  const quoteResult = extractData(quoteResultRes);
  const quotes = Array.isArray(quoteResult?.quotes) ? quoteResult.quotes : [];
  ensure(quotes.length > 0, 'Quote result returned no quotes.', quoteResult);

  const quoteId = String(quotes[0]?.quote_id || '').trim();
  ensure(quoteId, 'Quote result missing quote_id.', quoteResult);
  logStep('Quote result', 'PASS', `quotes=${quotes.length}, first=${quoteId}`);

  const repriceRes = await repriceQuote(
    quoteId,
    {
      owner_id_type: args.ownerIdType,
      selected_addons: addOns,
      roadtax_option: args.roadtaxOption,
    },
    {
      ...options,
      correlationId: correlation('reprice'),
    }
  );
  const reprice = extractData(repriceRes);
  ensure(reprice && typeof reprice === 'object', 'Reprice payload invalid.', repriceRes);
  const grandTotal = Number(reprice?.grand_total || 0);
  ensure(Number.isFinite(grandTotal) && grandTotal >= 0, 'Reprice missing valid grand_total.', reprice);
  logStep('Reprice', 'PASS', `grand_total=${grandTotal}`);

  if (mode !== 'full') {
    logStep('Contract run completed', 'PASS', 'mode=quote');
    return;
  }

  const proposalRes = await createProposal(
    {
      quote_id: quoteId,
      customer: {
        full_name: 'Contract Runner',
        email: 'contract.runner@lajoo.test',
        phone: '0123456789',
      },
    },
    {
      ...options,
      correlationId: correlation('proposal'),
      idempotencyKey: `idem-proposal-${randomUUID().slice(0, 8)}`,
    }
  );
  const proposal = extractData(proposalRes);
  const proposalId = String(proposal?.proposal_id || '').trim();
  ensure(proposalId, 'Create proposal did not return proposal_id.', proposal);
  logStep('Create proposal', 'PASS', proposalId);

  const submitProposalRes = await submitProposal(
    proposalId,
    {
      accepted_terms: true,
    },
    {
      ...options,
      correlationId: correlation('submit-proposal'),
    }
  );
  const submittedProposal = extractData(submitProposalRes);
  ensure(submittedProposal && typeof submittedProposal === 'object', 'Submit proposal payload invalid.', submitProposalRes);
  logStep('Submit proposal', 'PASS', String(submittedProposal?.status || 'UNKNOWN'));

  const paymentIntentRes = await createPaymentIntent(
    {
      proposal_id: proposalId,
      amount: grandTotal,
      currency: 'MYR',
      payment_method: args.paymentMethod,
    },
    {
      ...options,
      correlationId: correlation('payment-intent'),
      idempotencyKey: `idem-payment-${randomUUID().slice(0, 8)}`,
    }
  );
  const paymentIntent = extractData(paymentIntentRes);
  const paymentIntentId = String(paymentIntent?.payment_intent_id || '').trim();
  ensure(paymentIntentId, 'Create payment intent did not return payment_intent_id.', paymentIntent);
  logStep('Create payment intent', 'PASS', paymentIntentId);

  const paymentConfirmBody = {
    payment_method: args.paymentMethod,
  };
  if (args.simulatePayment) {
    paymentConfirmBody.simulate = args.simulatePayment;
  }

  const confirmPaymentRes = await confirmPaymentIntent(
    paymentIntentId,
    paymentConfirmBody,
    {
      ...options,
      correlationId: correlation('payment-confirm'),
    }
  );
  const confirmedPayment = extractData(confirmPaymentRes);
  const paymentStatus = String(confirmedPayment?.status || '').toUpperCase();
  ensure(paymentStatus, 'Confirm payment response missing status.', confirmedPayment);
  logStep('Confirm payment', 'PASS', paymentStatus);

  const issuePolicyRes = await issuePolicy(
    {
      proposal_id: proposalId,
      quote_id: quoteId,
      payment_intent_id: paymentIntentId,
      payment_status: paymentStatus,
    },
    {
      ...options,
      correlationId: correlation('issue-policy'),
      idempotencyKey: `idem-policy-${randomUUID().slice(0, 8)}`,
    }
  );
  const policy = extractData(issuePolicyRes);
  const policyNumber = String(policy?.policy_number || '').trim();
  ensure(policyNumber, 'Issue policy did not return policy_number.', policy);
  logStep('Issue policy', 'PASS', policyNumber);

  logStep('Contract run completed', 'PASS', 'mode=full');
}

run().catch((error) => {
  if (error instanceof InsurerGatewayError) {
    console.error('[FAIL] Gateway error');
    console.error(`message=${error.message || 'n/a'}`);
    console.error(`status=${error.status || 'n/a'} code=${error.code || 'n/a'} endpoint=${error.endpoint || 'n/a'}`);
    if (error.details) {
      console.error(JSON.stringify(error.details, null, 2));
    }
    process.exitCode = 1;
    return;
  }

  console.error('[FAIL]', error?.message || error);
  if (error?.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
});
