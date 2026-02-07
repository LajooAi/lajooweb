import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRecommendedInsurerFromAssistantMessage,
  isVehicleDetailsRejectionMessage,
  wasLastAssistantVehicleConfirmation,
  canUseDeliveredRoadTaxByOwnerType,
} from '../src/lib/flowGuards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evalPath = path.join(__dirname, '..', 'tests', 'evals', 'flow-eval.json');

function runCase(c) {
  switch (c.type) {
    case 'recommended_insurer': {
      const actual = parseRecommendedInsurerFromAssistantMessage(c.assistantMessage);
      return { actual, passed: actual === c.expected };
    }
    case 'vehicle_rejection': {
      const actual = isVehicleDetailsRejectionMessage(c.userMessage);
      return { actual, passed: actual === c.expected };
    }
    case 'vehicle_confirmation_context': {
      const actual = wasLastAssistantVehicleConfirmation(c.messages || []);
      return { actual, passed: actual === c.expected };
    }
    case 'roadtax_delivery_eligibility': {
      const actual = canUseDeliveredRoadTaxByOwnerType(c.ownerIdType ?? null);
      return { actual, passed: actual === c.expected };
    }
    default:
      return { actual: null, passed: false, error: `Unknown type: ${c.type}` };
  }
}

async function run() {
  const raw = await fs.readFile(evalPath, 'utf8');
  const cases = JSON.parse(raw);

  let passed = 0;
  const failed = [];

  for (const c of cases) {
    const result = runCase(c);
    if (result.passed) {
      passed += 1;
    } else {
      failed.push({
        name: c.name,
        type: c.type,
        expected: c.expected,
        actual: result.actual,
        error: result.error || null,
      });
    }
  }

  const total = cases.length;
  const accuracy = total > 0 ? (passed / total) * 100 : 0;
  console.log(`Flow eval: ${passed}/${total} passed (${accuracy.toFixed(1)}%)`);

  if (failed.length > 0) {
    console.log('Failed cases:');
    for (const item of failed) {
      console.log(`- ${item.name} [${item.type}]: expected=${JSON.stringify(item.expected)} actual=${JSON.stringify(item.actual)}${item.error ? ` error=${item.error}` : ''}`);
    }
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Failed to run flow eval:', err);
  process.exitCode = 1;
});
