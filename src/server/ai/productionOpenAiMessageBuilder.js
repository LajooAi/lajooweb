import {
  buildLiveKnowledgeSnapshot,
  loadKnowledgeMatchesForQuestion,
} from './turnGroundingInstructions.js';
import {
  buildProductionTurnInstructionMessages,
} from './productionTurnInstructionBuilder.js';
import { buildKnowledgeSourceTrace } from './sourceTrace.js';

export async function buildProductionOpenAiMessages({
  sessionId = null,
  latestMessage = '',
  messages = [],
  state,
  intent,
  advisorIntent = null,
  advisorBrain = null,
  decision,
  turnPlan,
  vehicleProfile = null,
  promptVariant = 'A',
  buildSystemPrompt,
  buildStepContractInstruction = null,
  buildAntiRepetitionInstruction = null,
} = {}) {
  if (typeof buildSystemPrompt !== 'function') {
    throw new TypeError('buildProductionOpenAiMessages requires buildSystemPrompt callback');
  }

  const questionKnowledgeMatches = await loadKnowledgeMatchesForQuestion(latestMessage, intent, {
    limit: 6,
    maxChunkCandidates: 320,
  });
  const liveKnowledgeSnapshot = buildLiveKnowledgeSnapshot(questionKnowledgeMatches, 4);
  const systemPrompt = buildSystemPrompt(state, vehicleProfile, promptVariant, liveKnowledgeSnapshot);

  const openAiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || ''),
    })),
  ];

  const productionTurnInstructions = await buildProductionTurnInstructionMessages({
    latestMessage,
    messages,
    state,
    decision,
    turnPlan,
    intent,
    advisorIntent,
    advisorBrain,
    vehicleProfile,
    questionKnowledgeMatches,
    buildStepContractInstruction,
    buildAntiRepetitionInstruction,
  });

  openAiMessages.push(...productionTurnInstructions.messages);
  const knowledgeSourceTrace = buildKnowledgeSourceTrace({
    sessionId,
    latestMessage,
    state,
    intent,
    decision,
    turnPlan,
    questionKnowledgeMatches,
    verifiedDatabaseFacts: productionTurnInstructions.verifiedDatabaseFacts,
    quoteRecommendation: productionTurnInstructions.quoteRecommendation,
  });

  return {
    openAiMessages,
    questionKnowledgeMatches,
    liveKnowledgeSnapshot,
    productionTurnInstructions,
    knowledgeSourceTrace,
  };
}

export default buildProductionOpenAiMessages;
