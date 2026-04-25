import { CONVERSATION_ACTIONS, CONVERSATION_MODES } from './orchestrator.js';

const MODE_LABELS = {
  [CONVERSATION_MODES.FLOW_ANSWER]: 'user is providing required renewal information',
  [CONVERSATION_MODES.INSURANCE_QUESTION]: 'user is asking an insurance question',
  [CONVERSATION_MODES.QUOTE_COMPARISON]: 'user is comparing quote or insurer choices',
  [CONVERSATION_MODES.CHANGE_REQUEST]: 'user wants to change a previous choice',
  [CONVERSATION_MODES.CORRECTION]: 'user is correcting information',
  [CONVERSATION_MODES.CONFUSED]: 'user is unclear or unsure',
  [CONVERSATION_MODES.SMALL_TALK]: 'user is greeting or casually probing',
  [CONVERSATION_MODES.READY_TO_PROCEED]: 'user is ready to continue',
};

const ACTION_LABELS = {
  [CONVERSATION_ACTIONS.ANSWER_ONLY]: 'answer the question only',
  [CONVERSATION_ACTIONS.ANSWER_THEN_RESUME]: 'answer first, then return to the renewal flow',
  [CONVERSATION_ACTIONS.ADVANCE_FLOW]: 'advance the renewal flow safely',
  [CONVERSATION_ACTIONS.ASK_FOLLOW_UP]: 'ask one useful follow-up question',
  [CONVERSATION_ACTIONS.CLARIFY_CONFUSION]: 'clarify confusion without dumping a menu',
  [CONVERSATION_ACTIONS.CHANGE_SELECTION]: 'confirm or apply the requested change safely',
};

export function shouldSuppressStepLine(decision) {
  if (!decision) return false;
  return decision.shouldAvoidStepLanguage === true || decision.shouldShowStepLabel === false;
}

export function buildAdvisorResponsePolicyInstruction(decision, state) {
  if (!decision) return null;

  const modeLabel = MODE_LABELS[decision.mode] || decision.mode;
  const actionLabel = ACTION_LABELS[decision.action] || decision.action;
  const stepLanguageRule = decision.shouldAvoidStepLanguage
    ? '- Do NOT expose "Step X of 6" wording in this reply. Use natural consultant wording instead.'
    : '- If a progress header is required by another contract, keep it brief and do not over-explain the step.';
  const resumeRule = decision.shouldResumeFlow
    ? '- Use the answer-then-resume pattern: answer the user first, then bridge back to the current renewal decision.'
    : '- Do not add unnecessary recap text. Move directly to the useful answer or next safe action.';
  const followUpRule = decision.shouldAskOneFollowUp
    ? '- End with exactly one practical follow-up question.'
    : '- Ask at most one question, only if needed to continue safely.';

  return `LAJOO CONSULTANT ORCHESTRATION
Conversation mode: ${decision.mode} (${modeLabel})
Required action: ${decision.action} (${actionLabel})
Current internal flow checkpoint: ${decision.currentStep || state?.step || 'unknown'}

Advisor rules for this turn:
${stepLanguageRule}
${resumeRule}
${followUpRule}
- Sound like a professional Malaysian motor insurance consultant, not a form wizard.
- Do not reveal internal mode names, confidence, orchestration, or state-machine wording.
- Keep regulatory safety: do not invent insurer facts, prices, discounts, payment status, or policy terms.
- If information is missing for a transaction step, ask for the missing item clearly and only once.`;
}

export default buildAdvisorResponsePolicyInstruction;
