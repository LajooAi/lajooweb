import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const DEFAULT_CAPTURE_FILE = path.join(ROOT, 'tests', 'evals', 'captured', 'unknown-intents.jsonl');
const DEFAULT_BASE_EVAL = path.join(ROOT, 'tests', 'evals', 'intent-eval.json');
const DEFAULT_OUTPUT_EVAL = path.join(ROOT, 'tests', 'evals', 'intent-eval.generated.json');

function parseArgs(argv) {
  const args = {
    captureFile: DEFAULT_CAPTURE_FILE,
    baseEval: DEFAULT_BASE_EVAL,
    outputEval: DEFAULT_OUTPUT_EVAL,
    minCount: 1,
    limit: 120,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--capture-file' && next) {
      args.captureFile = path.isAbsolute(next) ? next : path.join(ROOT, next);
      i += 1;
    } else if (key === '--base-eval' && next) {
      args.baseEval = path.isAbsolute(next) ? next : path.join(ROOT, next);
      i += 1;
    } else if (key === '--output' && next) {
      args.outputEval = path.isAbsolute(next) ? next : path.join(ROOT, next);
      i += 1;
    } else if (key === '--min-count' && next) {
      args.minCount = Math.max(1, Number(next) || 1);
      i += 1;
    } else if (key === '--limit' && next) {
      args.limit = Math.max(1, Number(next) || 120);
      i += 1;
    }
  }

  return args;
}

async function loadJsonIfExists(filePath, fallback = []) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function loadJsonlIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch {
          return { __parseError: true, __line: idx + 1 };
        }
      })
      .filter(item => !item.__parseError);
  } catch {
    return [];
  }
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeMessage(message) {
  return normalizeWhitespace(message).toLowerCase();
}

function normalizeStep(step) {
  return String(step || 'start').toLowerCase();
}

function buildCaseKey(step, message) {
  return `${normalizeStep(step)}::${normalizeMessage(message)}`;
}

function buildDisplayStep(step) {
  const value = normalizeStep(step);
  if (value === 'personal_details') return 'personal details';
  if (value === 'vehicle_lookup') return 'start';
  return value;
}

function truncateForName(text, max = 44) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1))}…`;
}

function isUsableCapturedMessage(message) {
  const clean = normalizeWhitespace(message);
  if (clean.length < 2) return false;
  if (/^\d{4}$/.test(clean)) return false; // OTP is already covered in base evals.
  return true;
}

function pickExpectedOneOf(aggregate) {
  const scores = aggregate.expectedCandidateScores || {};
  const ranked = Object.entries(scores)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([intent]) => intent)
    .slice(0, 5);

  if (ranked.length > 0) return ranked;
  if (aggregate.detectedIntent) return [aggregate.detectedIntent];
  return ['other'];
}

function aggregateCaptures(records) {
  const grouped = new Map();

  for (const record of records) {
    const step = normalizeStep(record.step || 'start');
    const message = normalizeWhitespace(record.userMessage || '');
    if (!isUsableCapturedMessage(message)) continue;

    const key = buildCaseKey(step, message);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        step,
        message,
        count: 0,
        detectedIntent: String(record.detectedIntent || 'other'),
        firstSeen: record.capturedAt || null,
        lastSeen: record.capturedAt || null,
        expectedCandidateScores: {},
      });
    }

    const current = grouped.get(key);
    current.count += 1;
    current.lastSeen = record.capturedAt || current.lastSeen;
    if (!current.firstSeen) current.firstSeen = record.capturedAt || null;

    const suggested = Array.isArray(record.suggestedExpectedOneOf)
      ? record.suggestedExpectedOneOf
      : [];

    if (suggested.length === 0 && record.detectedIntent) {
      current.expectedCandidateScores[record.detectedIntent] = (current.expectedCandidateScores[record.detectedIntent] || 0) + 1;
    } else {
      for (const intent of suggested) {
        const keyIntent = String(intent || '').trim();
        if (!keyIntent) continue;
        current.expectedCandidateScores[keyIntent] = (current.expectedCandidateScores[keyIntent] || 0) + 1;
      }
    }
  }

  return [...grouped.values()];
}

function buildGeneratedCase(record) {
  const expectedOneOf = pickExpectedOneOf(record);
  return {
    name: `Captured ${buildDisplayStep(record.step)} (${record.count}x): ${truncateForName(record.message)}`,
    message: record.message,
    step: record.step,
    expectedOneOf,
    minConfidence: 0.35,
    source: 'captured',
    captureCount: record.count,
    firstSeen: record.firstSeen,
    lastSeen: record.lastSeen,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  const [baseCases, capturedRows] = await Promise.all([
    loadJsonIfExists(args.baseEval, []),
    loadJsonlIfExists(args.captureFile),
  ]);

  const baseKeys = new Set(
    (Array.isArray(baseCases) ? baseCases : [])
      .map(item => buildCaseKey(item.step, item.message))
  );

  const aggregated = aggregateCaptures(capturedRows)
    .filter(item => item.count >= args.minCount)
    .filter(item => !baseKeys.has(buildCaseKey(item.step, item.message)))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.message.localeCompare(b.message);
    })
    .slice(0, args.limit);

  const generatedCases = aggregated.map(buildGeneratedCase);
  await fs.mkdir(path.dirname(args.outputEval), { recursive: true });
  await fs.writeFile(args.outputEval, `${JSON.stringify(generatedCases, null, 2)}\n`, 'utf8');

  console.log(
    `Generated ${generatedCases.length} intent eval case(s) from ${capturedRows.length} captured row(s).`
  );
  console.log(`Capture file: ${path.relative(ROOT, args.captureFile)}`);
  console.log(`Output file: ${path.relative(ROOT, args.outputEval)}`);
}

run().catch((error) => {
  console.error('Failed to build intent eval from captures:', error);
  process.exitCode = 1;
});

