import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectUserIntent, FLOW_STEPS } from '../src/lib/conversationState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evalPath = path.join(__dirname, '..', 'tests', 'evals', 'intent-eval.json');

function buildState(testCase) {
  const step = FLOW_STEPS[(testCase.step || 'start').toUpperCase()] || FLOW_STEPS.START;
  const defaultInsurer = testCase.currentInsurer || 'Takaful Ikhlas';
  const defaultPrice = testCase.currentPrice || (
    defaultInsurer.includes('Allianz') ? 920 :
    defaultInsurer.includes('Etiqa') ? 872 : 796
  );

  return {
    step,
    selectedQuote: testCase.selectedQuote
      ? { insurer: defaultInsurer, priceAfter: defaultPrice }
      : null,
    addOnsConfirmed: !!testCase.addOnsConfirmed,
    pendingAction: testCase.pendingAction ? { type: testCase.pendingAction } : null,
    plateNumber: testCase.plateNumber || null,
    nricNumber: testCase.nricNumber || null,
    ownerIdType: testCase.ownerIdType || null,
  };
}

function deepContains(actual, expected) {
  if (!expected || typeof expected !== 'object') return true;
  if (!actual || typeof actual !== 'object') return false;

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
      if (!deepContains(actualValue, expectedValue)) return false;
    } else if (actualValue !== expectedValue) {
      return false;
    }
  }
  return true;
}

function normalizeStep(step) {
  return String(step || 'unknown').toLowerCase();
}

function initStats() {
  return { total: 0, passed: 0 };
}

function updateStats(stats, key, passed) {
  if (!stats[key]) stats[key] = initStats();
  stats[key].total += 1;
  if (passed) stats[key].passed += 1;
}

function pct(passed, total) {
  if (!total) return '0.0';
  return ((passed / total) * 100).toFixed(1);
}

function printStatsTable(title, stats) {
  console.log(`\n${title}`);
  const keys = Object.keys(stats).sort();
  for (const key of keys) {
    const row = stats[key];
    console.log(`- ${key}: ${row.passed}/${row.total} (${pct(row.passed, row.total)}%)`);
  }
}

function validateCase(c, result) {
  const expectedIntents = Array.isArray(c.expectedOneOf)
    ? c.expectedOneOf
    : [c.expectedIntent];
  const intentMatch = expectedIntents.includes(result.intent);

  const confidenceMatch = c.minConfidence == null
    ? true
    : Number(result.confidence || 0) >= Number(c.minConfidence);

  const dataMatch = c.expectedDataContains
    ? deepContains(result.data || {}, c.expectedDataContains)
    : true;

  return {
    passed: intentMatch && confidenceMatch && dataMatch,
    intentMatch,
    confidenceMatch,
    dataMatch,
  };
}

async function run() {
  const raw = await fs.readFile(evalPath, 'utf8');
  const cases = JSON.parse(raw);

  let passed = 0;
  const failed = [];
  const byStep = {};
  const byIntent = {};

  for (const c of cases) {
    const state = buildState(c);
    const result = detectUserIntent(c.message, state);
    const validation = validateCase(c, result);
    const ok = validation.passed;

    updateStats(byStep, normalizeStep(c.step), ok);
    updateStats(byIntent, String(c.expectedIntent || c.expectedOneOf?.join('|') || 'unknown'), ok);

    if (ok) {
      passed += 1;
    } else {
      failed.push({
        name: c.name,
        expected: c.expectedIntent || c.expectedOneOf,
        actual: result.intent,
        confidence: result.confidence,
        data: result.data,
        reason: {
          intentMatch: validation.intentMatch,
          confidenceMatch: validation.confidenceMatch,
          dataMatch: validation.dataMatch,
        },
        message: c.message,
        step: c.step,
      });
    }
  }

  const total = cases.length;
  const accuracy = total > 0 ? (passed / total) * 100 : 0;

  console.log(`Intent eval: ${passed}/${total} passed (${accuracy.toFixed(1)}%)`);
  printStatsTable('By step', byStep);
  printStatsTable('By expected intent', byIntent);

  if (failed.length > 0) {
    console.log('\nFailed cases:');
    for (const item of failed) {
      console.log(
        `- ${item.name}: expected=${JSON.stringify(item.expected)} actual=${item.actual} ` +
        `confidence=${item.confidence} step=${item.step} reason=${JSON.stringify(item.reason)} ` +
        `data=${JSON.stringify(item.data || {})} message="${item.message}"`
      );
    }
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Failed to run eval:', err);
  process.exitCode = 1;
});

