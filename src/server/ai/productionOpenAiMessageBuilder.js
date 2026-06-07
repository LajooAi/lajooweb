import {
  buildLiveKnowledgeSnapshot,
  loadKnowledgeMatchesForQuestion,
} from './turnGroundingInstructions.js';
import {
  buildProductionTurnInstructionMessages,
} from './productionTurnInstructionBuilder.js';

export async function buildProductionOpenAiMessages({
  latestMessage = '',
  messages = [],
  state,
  intent,
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
    vehicleProfile,
    questionKnowledgeMatches,
    buildStepContractInstruction,
    buildAntiRepetitionInstruction,
  });

  openAiMessages.push(...productionTurnInstructions.messages);

  return {
    openAiMessages,
    questionKnowledgeMatches,
    liveKnowledgeSnapshot,
    productionTurnInstructions,
  };
}

export default buildProductionOpenAiMessages;
