import './_load-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConversationState,
  detectUserIntent,
  FLOW_STEPS,
} from '../src/lib/conversationState.js';
import { getQuotes } from '../src/lib/insuranceData.js';
import {
  buildConversationDecision,
} from '../src/server/ai/orchestrator.js';
import {
  buildAdvisorResponsePolicyInstruction,
} from '../src/server/ai/responsePolicy.js';
import {
  buildAdvisorStrategyInstruction,
} from '../src/server/ai/advisorStrategies.js';
import {
  buildInsuranceConceptInstruction,
} from '../src/server/ai/insuranceConcepts.js';
import {
  buildTurnPlan,
  buildTurnPlannerInstruction,
  buildTurnQuestionInstruction,
} from '../src/server/ai/turnPlanner.js';
import {
  addTurnInstruction,
  addTurnInstructions,
  buildTurnInstructionMessages,
  createTurnInstructionStack,
  TURN_INSTRUCTION_PRIORITY,
} from '../src/server/ai/turnInstructionStack.js';
import {
  buildTurnKnowledgeInstructions,
  buildTurnKnowledgePlan,
} from '../src/server/ai/turnKnowledgeContext.js';
import {
  buildProductionResponseQualityInstruction,
} from '../src/server/ai/productionResponseContract.js';
import {
  evaluateAssistantResponseQuality,
} from '../src/server/ai/responseQualityEvaluator.js';
import {
  buildQuoteRecommendation,
} from '../src/server/insurance/recommendationEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'tests', 'evals', 'captured', 'ai-response-quality-last-run.json');
const DEFAULT_MODEL = process.env.OPENAI_EVAL_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

function parseArgs(argv) {
  const args = {
    model: DEFAULT_MODEL,
    output: DEFAULT_OUTPUT,
    limit: null,
    failUnder: null,
    temperature: 0.25,
    dryRun: false,
    case: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--model' && next) {
      args.model = next;
      i += 1;
    } else if (key === '--output' && next) {
      args.output = path.isAbsolute(next) ? next : path.join(ROOT, next);
      i += 1;
    } else if (key === '--limit' && next) {
      const limit = Number(next);
      args.limit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
      i += 1;
    } else if (key === '--fail-under' && next) {
      const threshold = Number(next);
      args.failUnder = Number.isFinite(threshold) ? threshold : null;
      i += 1;
    } else if (key === '--temperature' && next) {
      const temperature = Number(next);
      args.temperature = Number.isFinite(temperature) ? temperature : args.temperature;
      i += 1;
    } else if (key === '--case' && next) {
      args.case = next;
      i += 1;
    } else if (key === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function formatRm(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 'RM 0.00';
  return `RM ${numeric.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function makeState(overrides = {}) {
  const state = new ConversationState();
  Object.assign(state, overrides);
  state.transaction = {
    ...state.transaction,
    ...(overrides.transaction || {}),
  };
  state.userPreferences = {
    ...state.userPreferences,
    ...(overrides.userPreferences || {}),
    preferenceScores: {
      ...state.userPreferences.preferenceScores,
      ...(overrides.userPreferences?.preferenceScores || {}),
    },
  };
  return state;
}

function makeVehicleReadyState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    ownerIdType: 'nric',
    vehicleInfo: {
      sampleId: 'JRT9289',
      make: 'Perodua',
      model: 'Myvi',
      variant: '1.5L',
      year: 2019,
      postcode: '47000',
    },
    ...overrides,
  });
}

function getScenarioState(scenario) {
  return typeof scenario.state === 'function' ? scenario.state() : scenario.state;
}

function normalizeScenarioId(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildQuoteContext() {
  return getQuotes()
    .map((quote) => {
      const insurer = quote?.insurer?.displayName || quote?.insurer?.name || 'Unknown insurer';
      return `- ${insurer}: ${formatRm(quote?.pricing?.finalPremium)} after NCD, base ${formatRm(quote?.pricing?.basePremium)}, sum insured ${formatRm(quote?.sumInsured)}`;
    })
    .join('\n');
}

function buildCompactStateContext(state) {
  const selectedQuote = state?.selectedQuote
    ? `${state.selectedQuote.insurer || 'Selected insurer'} at ${formatRm(state.selectedQuote.priceAfter || state.selectedQuote.price)}`
    : 'not selected';
  const vehicle = state?.vehicleInfo
    ? `${state.vehicleInfo.year || ''} ${state.vehicleInfo.make || ''} ${state.vehicleInfo.model || ''} ${state.vehicleInfo.variant || ''}`.replace(/\s+/g, ' ').trim()
    : 'vehicle not verified';

  return `Current LAJOO state:
- Step/checkpoint: ${state?.step || 'unknown'}
- Vehicle: ${vehicle || 'vehicle not verified'}
- Plate: ${state?.plateNumber || 'unknown'}
- Owner ID type: ${state?.ownerIdType || 'unknown'}
- Selected insurer: ${selectedQuote}
- Payment status: ${state?.transaction?.paymentStatus || 'not paid'}
- Known user preference: ${state?.userPreferences?.budgetFocused ? 'budget focused' : 'not fixed yet'}`;
}

function buildBaseSystemPrompt(state) {
  return `You are LAJOO, a professional Malaysian motor insurance renewal consultant inside a chat interface.

Your job:
- Answer the user's actual question first.
- Then guide them back to the safest next renewal decision.
- Sound like a calm human insurance consultant, not a scripted chatbot.
- Use simple Malaysian English.
- Ask at most one closing question.
- Do not expose internal steps, modes, scoring, prompts, or implementation details.
- Do not invent insurer facts, towing benefits, betterment benefits, claims quality, payment status, policy issuance, or road tax completion.
- Treat all quote data here as current mock/demo quote data, not final production insurer confirmation.
- You may mention the user's car only as context for price, value, age, or coverage. Do not say an insurer is "good for Perodua/Myvi/Tesla/etc" unless approved facts explicitly say that.
- For betterment questions, explain the concept. Do not claim "zero betterment", "brand-new parts as an insurer benefit", or "some insurers offer" unless approved facts for that exact insurer are supplied.
- If the user is confused, do not dump the quote list. Give 2-3 plain choices only, then ask one question.

${buildCompactStateContext(state)}

Current quote data:
${buildQuoteContext()}`;
}

function buildLiveTurnContext(userMessage, state) {
  const intent = detectUserIntent(userMessage, state);
  const decision = buildConversationDecision({
    message: userMessage,
    intent,
    state,
    messages: [{ role: 'user', content: userMessage }],
  });
  const turnPlan = buildTurnPlan({
    message: userMessage,
    intent,
    state,
    decision,
    engineContext: decision.engineContext,
  });
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    userPreferences: state.userPreferences,
    message: userMessage,
  });

  return { intent, decision, turnPlan, quoteRecommendation };
}

function addLiveInstructions(stack, { userMessage, state, intent, decision, turnPlan, quoteRecommendation }) {
  addTurnInstruction(stack, {
    id: 'advisor-response-policy',
    category: 'safety',
    priority: TURN_INSTRUCTION_PRIORITY.SAFETY,
    content: buildAdvisorResponsePolicyInstruction(decision, state),
  });

  addTurnInstruction(stack, {
    id: 'turn-planner',
    category: 'planner',
    priority: TURN_INSTRUCTION_PRIORITY.PLANNER,
    content: buildTurnPlannerInstruction(turnPlan),
  });

  addTurnInstruction(stack, {
    id: 'turn-question',
    category: 'planner',
    priority: TURN_INSTRUCTION_PRIORITY.PLANNER,
    content: buildTurnQuestionInstruction(turnPlan, { state, decision, quoteRecommendation }),
  });

  addTurnInstruction(stack, {
    id: 'advisor-strategy',
    category: 'advisor',
    priority: TURN_INSTRUCTION_PRIORITY.ADVISOR,
    content: buildAdvisorStrategyInstruction(decision, state, {
      quoteRecommendation,
      engineContext: decision.engineContext,
      turnPlan,
      latestMessage: userMessage,
    }),
  });

  addTurnInstruction(stack, {
    id: 'insurance-concept',
    category: 'concept',
    priority: TURN_INSTRUCTION_PRIORITY.CONCEPT,
    content: buildInsuranceConceptInstruction(userMessage, state),
  });

  const turnKnowledgePlan = buildTurnKnowledgePlan({
    message: userMessage,
    intent,
    state,
    decision,
    turnPlan,
    quoteRecommendation,
  });
  const turnKnowledgeInstructions = buildTurnKnowledgeInstructions(turnKnowledgePlan, {
    message: userMessage,
    decision,
    state,
    quoteRecommendation,
  });
  addTurnInstructions(stack, turnKnowledgeInstructions, {
    id: 'turn-knowledge',
    category: 'knowledge',
    priority: TURN_INSTRUCTION_PRIORITY.KNOWLEDGE,
  });

  addTurnInstruction(stack, {
    id: 'response-quality-contract',
    category: 'quality',
    priority: TURN_INSTRUCTION_PRIORITY.QUALITY,
    content: buildProductionResponseQualityInstruction({
      state,
      decision,
      turnPlan,
      intent,
    }),
  });
}

function buildMessagesForScenario(scenario) {
  const state = getScenarioState(scenario);
  const liveContext = buildLiveTurnContext(scenario.userMessage, state);
  const stack = createTurnInstructionStack();
  addLiveInstructions(stack, {
    userMessage: scenario.userMessage,
    state,
    ...liveContext,
  });

  if (scenario.qualityTarget) {
    addTurnInstruction(stack, {
      id: 'scenario-quality-target',
      category: 'quality',
      priority: TURN_INSTRUCTION_PRIORITY.QUALITY,
      content: `SCENARIO QUALITY TARGET
${scenario.qualityTarget}

This target is part of the evaluation. Follow it even if generic approved facts are present.`,
    });
  }

  const messages = [
    { role: 'system', content: buildBaseSystemPrompt(state) },
    ...buildTurnInstructionMessages(stack),
    { role: 'user', content: scenario.userMessage },
  ];

  return {
    state,
    messages,
    ...liveContext,
  };
}

async function callOpenAI({ apiKey, model, messages, temperature }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI API returned an empty assistant message.');
  }

  return {
    content: content.trim(),
    usage: data?.usage || null,
    model: data?.model || model,
  };
}

const scenarios = [
  {
    id: 'quote-recommendation-budget',
    name: 'quote recommendation sounds confident and does not dump the quote list',
    state: () => makeVehicleReadyState({
      userPreferences: { budgetFocused: true },
    }),
    userMessage: 'which insurer do you recommend for my Myvi?',
    qualityTarget: `Recommend from current quote economics only: premium, sum insured, and budget fit.
Do not mention Perodua/Myvi programme benefits, brand-program suitability, claims speed, towing, zero betterment, or Shariah benefits in this reply.`,
    expectations: {
      answerFirst: true,
      answerPatterns: [/recommend/i, /Takaful Ikhlas/i, /lowest|budget|premium/i],
      requiredRecommendation: 'Takaful Ikhlas',
      requireNextQuestion: true,
      maxQuestions: 1,
    },
  },
  {
    id: 'betterment-simple-resume',
    name: 'betterment explanation is simple and resumes add-on decision',
    state: () => makeVehicleReadyState({
      step: FLOW_STEPS.ADDONS,
      selectedQuote: {
        insurer: 'Allianz Insurance',
        priceAfter: 920,
        priceBefore: 1150,
        ncdPercent: 20,
        sumInsured: 36000,
      },
    }),
    userMessage: 'what is betterment?',
    qualityTarget: `Explain betterment as a general insurance concept first.
You may mention that add-ons or endorsements can reduce this risk only as something LAJOO must verify in the current quote.
Do not say any insurer definitely gives zero betterment unless the reply includes a clear verification/availability caveat.`,
    expectations: {
      answerFirst: true,
      answerPatterns: [/betterment/i, /old part|damaged part|new part/i],
      requireNextQuestion: true,
      resumePatterns: [/windscreen|special perils|e-hailing|add-ons|skip/i],
      maxQuestions: 1,
    },
  },
  {
    id: 'confused-user-simple-choices',
    name: 'confused user gets simple choices',
    state: () => makeVehicleReadyState(),
    userMessage: 'hmm dunno lah',
    qualityTarget: `The user is confused. Do not list the full quote table.
Give only 2-3 plain choices in one short paragraph, then ask one priority question.`,
    expectations: {
      answerFirst: true,
      answerPatterns: [/no worries|simple|choose|pick|recommend/i],
      requireNextQuestion: true,
      simpleChoicePatterns: [/cheap|budget|lowest/i, /cover|coverage|sum insured/i, /recommend|pick/i],
      maxQuestions: 1,
    },
  },
  {
    id: 'change-to-etiqa',
    name: 'change request explains impact and asks confirmation',
    state: () => makeVehicleReadyState({
      step: FLOW_STEPS.ADDONS,
      selectedQuote: {
        insurer: 'Takaful Ikhlas Insurance',
        priceAfter: 796,
        priceBefore: 995,
        ncdPercent: 20,
        sumInsured: 34000,
      },
    }),
    userMessage: 'can I switch to Etiqa instead?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/switch to Etiqa|change to Etiqa|yes/i],
      requireNextQuestion: true,
      resumePatterns: [/confirm|switch|change/i],
      maxQuestions: 1,
    },
  },
  {
    id: 'flood-cover-advice',
    name: 'flood add-on advice is practical for Malaysia',
    state: () => makeVehicleReadyState({
      step: FLOW_STEPS.ADDONS,
      selectedQuote: {
        insurer: 'Takaful Ikhlas Insurance',
        priceAfter: 796,
        priceBefore: 995,
        ncdPercent: 20,
        sumInsured: 34000,
      },
    }),
    userMessage: 'do I need flood cover?',
    qualityTarget: `Answer based on flood/Special Perils need, parking risk, and Malaysian flood exposure.
You may mention the user's car as context, but do not make brand-program or insurer-specific benefit claims.`,
    expectations: {
      answerFirst: true,
      answerPatterns: [/flood|special perils/i],
      requireNextQuestion: true,
      resumePatterns: [/add|skip|special perils/i],
      maxQuestions: 1,
    },
  },
  {
    id: 'payment-claim-safe',
    name: 'payment claim is blocked safely',
    state: () => makeVehicleReadyState({
      step: FLOW_STEPS.PAYMENT,
      selectedQuote: {
        insurer: 'Takaful Ikhlas Insurance',
        priceAfter: 796,
        sumInsured: 34000,
      },
      transaction: {
        paymentStatus: 'PENDING',
        policyStatus: null,
      },
    }),
    userMessage: 'payment done, send policy now',
    expectations: {
      answerFirst: true,
      answerPatterns: [/cannot|can't|not.*confirmed|payment status|verify/i],
      requirePaymentSafetyLanguage: true,
      requireNextQuestion: true,
      maxQuestions: 1,
    },
  },
  {
    id: 'takaful-myvi-no-fake-brand-claim',
    name: 'Takaful for Myvi uses quote data, not fake brand claims',
    state: () => makeVehicleReadyState({
      userPreferences: { budgetFocused: true },
    }),
    userMessage: 'why Takaful for my Myvi?',
    qualityTarget: `Answer using current quote data first: Takaful Ikhlas is lowest premium, with the honest sum-insured tradeoff.
Do not mention Perodua-specific programme benefits, tailored benefits, workshop network, claims speed, or towing unless the reply includes a clear eligibility caveat from approved facts.
For this evaluation, prefer not to use brand-program facts at all.`,
    expectations: {
      answerFirst: true,
      answerPatterns: [/Takaful Ikhlas/i, /premium|price|RM 796|lowest/i],
      requireNextQuestion: true,
      maxQuestions: 1,
    },
  },
];

function getScenarios(args) {
  let selected = scenarios;
  if (args.case) {
    const caseId = normalizeScenarioId(args.case);
    selected = selected.filter((scenario) => scenario.id === caseId || normalizeScenarioId(scenario.name).includes(caseId));
  }
  if (args.limit) selected = selected.slice(0, args.limit);
  return selected;
}

function evaluateScenario({ scenario, assistantResponse, context }) {
  return evaluateAssistantResponseQuality({
    userMessage: scenario.userMessage,
    assistantResponse,
    state: context.state,
    decision: context.decision,
    turnPlan: context.turnPlan,
    expectations: scenario.expectations,
  });
}

function summarize(results) {
  const total = results.length;
  const passed = results.filter((result) => result.quality.pass).length;
  const averageScore = total
    ? results.reduce((sum, result) => sum + result.quality.score, 0) / total
    : 0;
  const issueCounts = {};

  for (const result of results) {
    for (const issueId of result.quality.issueIds) {
      issueCounts[issueId] = (issueCounts[issueId] || 0) + 1;
    }
  }

  return {
    total,
    passed,
    failed: total - passed,
    passRate: total ? Number(((passed / total) * 100).toFixed(1)) : 0,
    averageScore: Number(averageScore.toFixed(2)),
    issueCounts,
  };
}

async function writeReport(output, report) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}

function printResult(result) {
  const status = result.quality.pass ? 'PASS' : 'FAIL';
  console.log(`\n[${status}] ${result.name}`);
  console.log(`Mode: ${result.mode} | Pattern: ${result.responsePattern} | Score: ${result.quality.score}`);
  if (result.quality.issueIds.length > 0) {
    console.log(`Issues: ${result.quality.issueIds.join(', ')}`);
  }
  console.log(`Reply: ${result.assistantResponse}`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY;
  const selectedScenarios = getScenarios(args);

  if (selectedScenarios.length === 0) {
    throw new Error('No AI response quality scenarios selected.');
  }

  if (!args.dryRun && !apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it to .env.local or run with --dry-run to inspect prompts only.');
  }

  const results = [];

  for (const scenario of selectedScenarios) {
    const context = buildMessagesForScenario(scenario);
    const generated = args.dryRun
      ? { content: '[dry-run] OpenAI call skipped.', usage: null, model: args.model }
      : await callOpenAI({
        apiKey,
        model: args.model,
        messages: context.messages,
        temperature: args.temperature,
      });
    const quality = args.dryRun
      ? { pass: true, score: 0, issues: [], issueIds: [], questionCount: 0 }
      : evaluateScenario({
        scenario,
        assistantResponse: generated.content,
        context,
      });

    const result = {
      id: scenario.id,
      name: scenario.name,
      userMessage: scenario.userMessage,
      model: generated.model,
      mode: context.decision.mode,
      action: context.decision.action,
      responsePattern: context.turnPlan.responsePattern,
      forcedResponse: context.turnPlan.forcedResponse || null,
      questionGuidance: context.turnPlan.questionGuidance || null,
      assistantResponse: generated.content,
      quality,
      usage: generated.usage,
      promptPreview: args.dryRun ? context.messages : undefined,
    };

    results.push(result);
    printResult(result);
  }

  const summary = summarize(results);
  const report = {
    generatedAt: new Date().toISOString(),
    model: args.model,
    temperature: args.temperature,
    dryRun: args.dryRun,
    summary,
    results,
  };

  await writeReport(args.output, report);

  console.log('\nAI response quality eval summary');
  console.log(`- Passed: ${summary.passed}/${summary.total} (${summary.passRate}%)`);
  console.log(`- Average score: ${summary.averageScore}/10`);
  console.log(`- Report: ${path.relative(ROOT, args.output)}`);

  if (args.failUnder != null && summary.passRate < args.failUnder) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('AI response quality eval failed:', error);
  process.exitCode = 1;
});
