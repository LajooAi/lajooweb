import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_INPUT = path.join(__dirname, '..', 'tests', 'evals', 'llm-judge-transcripts.json');
const DEFAULT_OUTPUT = path.join(__dirname, '..', 'tests', 'evals', 'llm-judge-results.json');
const DEFAULT_MODEL = process.env.LAJOO_JUDGE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

function parseArgs(argv) {
  const args = {
    file: DEFAULT_INPUT,
    out: null,
    model: DEFAULT_MODEL,
    limit: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--file' && argv[i + 1]) {
      args.file = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--out' && argv[i + 1]) {
      args.out = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--model' && argv[i + 1]) {
      args.model = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--limit' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) args.limit = Math.floor(n);
      i += 1;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function parseJsonObjectFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Empty LLM judge response');

  try {
    return JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = raw.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw new Error('Could not parse JSON from LLM judge response');
  }
}

function normalizeScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, n));
}

function normalizeTranscriptRecord(record, idx) {
  const id = String(record?.id || `transcript-${idx + 1}`);
  const variantRaw = String(record?.variant || 'unknown').trim().toUpperCase();
  const variant = variantRaw === 'A' || variantRaw === 'B' ? variantRaw : 'UNKNOWN';
  const converted = typeof record?.converted === 'boolean' ? record.converted : null;
  const messages = Array.isArray(record?.messages)
    ? record.messages
    : Array.isArray(record?.transcript)
      ? record.transcript
      : [];

  const usableMessages = messages
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').trim(),
    }))
    .filter((m) => m.content.length > 0);

  if (usableMessages.length === 0) {
    throw new Error(`Record ${id} has no usable messages`);
  }

  const transcriptText = usableMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  return {
    id,
    variant,
    converted,
    transcriptText,
    messages: usableMessages,
  };
}

async function callJudge({ apiKey, model, transcript }) {
  const systemPrompt = `You are an evaluation judge for an insurance renewal AI assistant.
Score conversation quality on a 1-10 scale.
Return strict JSON only (no markdown) with this schema:
{
  "human_ness_score": <number 1-10>,
  "human_ness_reason": "<short reason>",
  "persuasion_quality_score": <number 1-10>,
  "persuasion_quality_reason": "<short reason>",
  "step_alignment_score": <number 1-10>,
  "step_alignment_reason": "<short reason>",
  "overall_comment": "<short summary>"
}

Scoring guidance:
- human_ness_score: natural tone, avoids robotic repetition, sounds like a real assistant.
- persuasion_quality_score: soft consultative sales quality without being pushy.
- step_alignment_score: stays on renewal flow and ends with a clear next action.
- Keep reasons concise and concrete.`;

  const userPrompt = `Evaluate this transcript:\n\n${transcript}`;

  const completion = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!completion.ok) {
    const text = await completion.text();
    throw new Error(`Judge API error: ${text}`);
  }

  const data = await completion.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseJsonObjectFromText(content);

  return {
    humanNessScore: normalizeScore(parsed.human_ness_score),
    humanNessReason: String(parsed.human_ness_reason || '').trim(),
    persuasionScore: normalizeScore(parsed.persuasion_quality_score),
    persuasionReason: String(parsed.persuasion_quality_reason || '').trim(),
    stepAlignmentScore: normalizeScore(parsed.step_alignment_score),
    stepAlignmentReason: String(parsed.step_alignment_reason || '').trim(),
    overallComment: String(parsed.overall_comment || '').trim(),
  };
}

function createAggregate() {
  return {
    count: 0,
    judgedCount: 0,
    humanNessSum: 0,
    persuasionSum: 0,
    stepAlignmentSum: 0,
    convertedKnown: 0,
    convertedCount: 0,
  };
}

function applyAggregate(aggregate, row) {
  aggregate.count += 1;

  if (typeof row.converted === 'boolean') {
    aggregate.convertedKnown += 1;
    if (row.converted) aggregate.convertedCount += 1;
  }

  if (Number.isFinite(row.humanNessScore) && Number.isFinite(row.persuasionScore) && Number.isFinite(row.stepAlignmentScore)) {
    aggregate.judgedCount += 1;
    aggregate.humanNessSum += row.humanNessScore;
    aggregate.persuasionSum += row.persuasionScore;
    aggregate.stepAlignmentSum += row.stepAlignmentScore;
  }
}

function summarizeAggregate(label, aggregate) {
  const judged = aggregate.judgedCount || 0;
  const humanAvg = judged ? aggregate.humanNessSum / judged : null;
  const persuasionAvg = judged ? aggregate.persuasionSum / judged : null;
  const stepAvg = judged ? aggregate.stepAlignmentSum / judged : null;
  const conversionRate = aggregate.convertedKnown ? (aggregate.convertedCount / aggregate.convertedKnown) * 100 : null;

  const humanText = humanAvg == null ? 'n/a' : humanAvg.toFixed(2);
  const persuasionText = persuasionAvg == null ? 'n/a' : persuasionAvg.toFixed(2);
  const stepText = stepAvg == null ? 'n/a' : stepAvg.toFixed(2);
  const conversionText = conversionRate == null ? 'n/a' : `${conversionRate.toFixed(1)}%`;

  console.log(`${label}:`);
  console.log(`- Transcripts: ${aggregate.count}`);
  console.log(`- Avg human-ness: ${humanText}`);
  console.log(`- Avg persuasion: ${persuasionText}`);
  console.log(`- Avg step alignment: ${stepText}`);
  console.log(`- Conversion rate: ${conversionText} (${aggregate.convertedCount}/${aggregate.convertedKnown || 0})`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  const outPath = args.out
    ? (path.isAbsolute(args.out) ? args.out : path.resolve(process.cwd(), args.out))
    : DEFAULT_OUTPUT;

  const raw = await fs.readFile(inputPath, 'utf8');
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) {
    throw new Error('Input transcript file must be a JSON array');
  }

  const normalized = records.map((record, idx) => normalizeTranscriptRecord(record, idx));
  const selected = args.limit ? normalized.slice(0, args.limit) : normalized;

  console.log(`LLM judge eval input: ${inputPath}`);
  console.log(`Model: ${args.model}`);
  console.log(`Transcripts: ${selected.length}`);
  if (args.dryRun) {
    console.log('Dry run enabled: validating transcript structure only (no API calls).');
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!args.dryRun && !apiKey) {
    throw new Error('OPENAI_API_KEY is required for judge scoring (or run with --dry-run).');
  }

  const rows = [];
  for (let i = 0; i < selected.length; i += 1) {
    const record = selected[i];
    process.stdout.write(`Judging ${i + 1}/${selected.length}: ${record.id} (${record.variant})... `);

    if (args.dryRun) {
      rows.push({
        id: record.id,
        variant: record.variant,
        converted: record.converted,
        humanNessScore: null,
        humanNessReason: '',
        persuasionScore: null,
        persuasionReason: '',
        stepAlignmentScore: null,
        stepAlignmentReason: '',
        overallComment: '',
      });
      console.log('ok (validated)');
      continue;
    }

    try {
      const judged = await callJudge({
        apiKey,
        model: args.model,
        transcript: record.transcriptText,
      });
      rows.push({
        id: record.id,
        variant: record.variant,
        converted: record.converted,
        ...judged,
      });
      console.log(`ok (human=${judged.humanNessScore}, persuasion=${judged.persuasionScore}, step=${judged.stepAlignmentScore})`);
    } catch (error) {
      rows.push({
        id: record.id,
        variant: record.variant,
        converted: record.converted,
        humanNessScore: null,
        humanNessReason: '',
        persuasionScore: null,
        persuasionReason: '',
        stepAlignmentScore: null,
        stepAlignmentReason: '',
        overallComment: '',
        error: String(error.message || error),
      });
      console.log(`failed (${String(error.message || error)})`);
    }
  }

  const overall = createAggregate();
  const byVariant = new Map();
  for (const row of rows) {
    applyAggregate(overall, row);
    const key = row.variant || 'UNKNOWN';
    if (!byVariant.has(key)) byVariant.set(key, createAggregate());
    applyAggregate(byVariant.get(key), row);
  }

  console.log('\n=== LLM Judge Summary ===');
  summarizeAggregate('Overall', overall);
  for (const [variant, aggregate] of [...byVariant.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    summarizeAggregate(`Variant ${variant}`, aggregate);
  }

  const resultPayload = {
    generatedAt: new Date().toISOString(),
    model: args.model,
    inputPath,
    transcriptCount: selected.length,
    dryRun: args.dryRun,
    summary: {
      overall,
      byVariant: Object.fromEntries(byVariant.entries()),
    },
    rows,
  };

  await fs.writeFile(outPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');
  console.log(`\nSaved results to: ${outPath}`);
}

run().catch((error) => {
  console.error('Failed to run LLM judge eval:', error.message || error);
  process.exitCode = 1;
});
