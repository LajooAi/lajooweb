import { FLOW_STEPS } from '../../lib/conversationState.js';
import { getQuotesFromState } from '../insurance/quoteEngine.js';
import { buildQuoteRecommendation } from '../insurance/recommendationEngine.js';
import {
  buildVerifiedDatabaseFactsInstructionFromFacts,
  findVerifiedDatabaseFactsForMessage,
} from '../insurance/databaseFactStore.js';
import {
  buildAdvisorResponsePolicyInstruction,
} from './responsePolicy.js';
import { buildAdvisorStrategyInstruction } from './advisorStrategies.js';
import {
  buildInsuranceConceptInstruction,
  shouldUseGeneralConceptAnswer,
} from './insuranceConcepts.js';
import {
  buildTurnPlannerInstruction,
} from './turnPlanner.js';
import {
  buildTurnKnowledgeInstructions,
  buildTurnKnowledgePlan,
} from './turnKnowledgeContext.js';
import {
  addTurnInstruction,
  addTurnInstructions,
  buildTurnInstructionMessages,
  createTurnInstructionStack,
  TURN_INSTRUCTION_PRIORITY,
} from './turnInstructionStack.js';
import {
  buildProductionResponseQualityInstruction,
} from './productionResponseContract.js';
import {
  buildComparisonQuestionInstruction,
  buildKnowledgeGroundingInstruction,
} from './turnGroundingInstructions.js';

export function buildStepStyleInstruction(state) {
  const prefs = state?.userPreferences || {};
  const preferenceHints = [];
  if (prefs.budgetFocused) preferenceHints.push('Emphasize value-for-money when comparing options.');
  if (prefs.claimsFocused) preferenceHints.push('Highlight claim process convenience and support reliability.');
  if (prefs.coverageFocused) preferenceHints.push('Highlight protection scope and higher coverage tradeoffs.');
  if (prefs.concisePreferred === true) preferenceHints.push('Keep replies concise (1-2 short paragraphs).');
  if (prefs.concisePreferred === false) preferenceHints.push('User accepts more detail when needed, but stay clear.');

  if (!state?.hasCompleteVehicleIdentification?.()) {
    return `STEP STYLE PROFILE
Mode: Intake mode
Style: concise, guided, one clear request at a time.
Intake rule: ask for missing vehicle plate number and/or owner identification number. Do not show quotes until both are available.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.QUOTES) {
    return `STEP STYLE PROFILE
Mode: Advisor mode
Style: compare clearly, be decisive when recommending, ask one decision question.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.ADDONS) {
    return `STEP STYLE PROFILE
Mode: Practical consultant mode
Style: explain usefulness quickly, avoid jargon, then ask for add-on choice.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.ROADTAX) {
    return `STEP STYLE PROFILE
Mode: Consultative close mode
Style: short answer + light convenience pitch + direct yes/no road tax close.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
    return `STEP STYLE PROFILE
Mode: Checklist mode
Style: structured bullets, clear missing fields, no unnecessary explanation.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.OTP || state.step === FLOW_STEPS.PAYMENT) {
    return `STEP STYLE PROFILE
Mode: Transaction mode
Style: clear, trust-building, action-oriented.
${preferenceHints.join('\n')}`;
  }

  return null;
}

export async function buildProductionTurnInstructionMessages({
  latestMessage = '',
  messages = [],
  state,
  intent,
  decision,
  turnPlan,
  vehicleProfile = null,
  questionKnowledgeMatches = [],
  buildStepContractInstruction = null,
  buildAntiRepetitionInstruction = null,
} = {}) {
  const turnInstructionStack = createTurnInstructionStack();

  addTurnInstruction(turnInstructionStack, {
    id: 'advisor-response-policy',
    category: 'safety',
    priority: TURN_INSTRUCTION_PRIORITY.SAFETY,
    content: buildAdvisorResponsePolicyInstruction(decision, state),
  });

  addTurnInstruction(turnInstructionStack, {
    id: 'turn-planner',
    category: 'planner',
    priority: TURN_INSTRUCTION_PRIORITY.PLANNER,
    content: buildTurnPlannerInstruction(turnPlan),
  });

  const verifiedDatabaseFacts = await findVerifiedDatabaseFactsForMessage(latestMessage, {
    limit: 12,
  });

  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotesFromState(state),
    state,
    userPreferences: state?.userPreferences,
    message: latestMessage,
    extraApprovedFacts: verifiedDatabaseFacts,
  });

  addTurnInstruction(turnInstructionStack, {
    id: 'verified-database-facts',
    category: 'knowledge',
    priority: TURN_INSTRUCTION_PRIORITY.KNOWLEDGE,
    content: buildVerifiedDatabaseFactsInstructionFromFacts(verifiedDatabaseFacts),
  });

  addTurnInstruction(turnInstructionStack, {
    id: 'advisor-strategy',
    category: 'advisor',
    priority: TURN_INSTRUCTION_PRIORITY.ADVISOR,
    content: buildAdvisorStrategyInstruction(decision, state, {
      quoteRecommendation,
      engineContext: decision?.engineContext,
      turnPlan,
      latestMessage,
    }),
  });

  addTurnInstruction(turnInstructionStack, {
    id: 'insurance-concept',
    category: 'concept',
    priority: TURN_INSTRUCTION_PRIORITY.CONCEPT,
    content: buildInsuranceConceptInstruction(latestMessage, state),
  });

  const turnKnowledgePlan = buildTurnKnowledgePlan({
    message: latestMessage,
    intent,
    state,
    decision,
    turnPlan,
    quoteRecommendation,
  });
  const turnKnowledgeInstructions = buildTurnKnowledgeInstructions(turnKnowledgePlan, {
    message: latestMessage,
    decision,
    state,
    quoteRecommendation,
  });
  addTurnInstructions(turnInstructionStack, turnKnowledgeInstructions, {
    id: 'turn-knowledge',
    category: 'knowledge',
    priority: TURN_INSTRUCTION_PRIORITY.KNOWLEDGE,
  });

  addTurnInstruction(turnInstructionStack, {
    id: 'step-style',
    category: 'style',
    priority: TURN_INSTRUCTION_PRIORITY.STYLE,
    content: buildStepStyleInstruction(state),
  });

  if (typeof buildStepContractInstruction === 'function') {
    addTurnInstruction(turnInstructionStack, {
      id: 'step-contract',
      category: 'flow-contract',
      priority: TURN_INSTRUCTION_PRIORITY.FLOW_CONTRACT,
      content: buildStepContractInstruction(state, { intent, messages, vehicleProfile }),
    });
  }

  if (typeof buildAntiRepetitionInstruction === 'function') {
    addTurnInstruction(turnInstructionStack, {
      id: 'anti-repetition',
      category: 'quality',
      priority: TURN_INSTRUCTION_PRIORITY.QUALITY,
      content: buildAntiRepetitionInstruction(messages),
    });
  }

  addTurnInstruction(turnInstructionStack, {
    id: 'production-response-quality',
    category: 'quality',
    priority: TURN_INSTRUCTION_PRIORITY.QUALITY,
    content: buildProductionResponseQualityInstruction({
      state,
      decision,
      turnPlan,
      intent,
    }),
  });

  addTurnInstruction(turnInstructionStack, {
    id: 'knowledge-grounding',
    category: 'knowledge',
    priority: TURN_INSTRUCTION_PRIORITY.KNOWLEDGE,
    content: await buildKnowledgeGroundingInstruction(
      latestMessage,
      intent,
      state,
      questionKnowledgeMatches,
      { allowGeneralConceptAnswer: shouldUseGeneralConceptAnswer(latestMessage) }
    ),
  });

  addTurnInstruction(turnInstructionStack, {
    id: 'comparison-question',
    category: 'advisor',
    priority: TURN_INSTRUCTION_PRIORITY.ADVISOR,
    content: buildComparisonQuestionInstruction(latestMessage, intent, state),
  });

  return {
    messages: buildTurnInstructionMessages(turnInstructionStack),
    quoteRecommendation,
    verifiedDatabaseFacts,
    turnKnowledgePlan,
  };
}

export default buildProductionTurnInstructionMessages;
