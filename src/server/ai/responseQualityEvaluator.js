const STEP_LANGUAGE_REGEX = /\bstep\s*\d+\s*(?:of|\/)\s*\d+\b/i;
const ROBOTIC_PHRASE_REGEX = /\b(as an ai|as a chatbot|i am just|i cannot help with insurance|follow step|complete step)\b/i;
const UNSAFE_PAYMENT_OR_POLICY_REGEX = /\b(payment\s+(?:successful|success|confirmed|completed|received)|paid\s+successfully|policy\s+(?:issued|active|ready|confirmed)|cover\s+(?:is\s+)?active|road\s*tax\s+(?:completed|renewed|done))\b/i;
const PAYMENT_SAFETY_REGEX = /\b(not\s+(?:confirmed|received|showing|verified)|cannot\s+(?:confirm|mark)|can't\s+(?:confirm|mark)|payment\s+status|successful\s+payment\s+status|use\s+the\s+payment\s+link|refresh\s+the\s+payment)\b/i;

const POLICY_FACT_CLAIMS = [
  {
    id: 'zero_betterment',
    regex: /\b(?:zero\s+betterment|waiver\s+of\s+betterment|betterment\s+waiver)\b/i,
  },
  {
    id: 'towing_24_hour',
    regex: /\b(?:(?:24[- ]?hour|24\/7).*?(?:tow|towing|roadside)|(?:tow|towing|roadside).*?(?:24[- ]?hour|24\/7))\b/i,
  },
  {
    id: 'unlimited_towing',
    regex: /\b(?:unlimited\s+towing|free\s+towing|towing\s+up\s+to\s+\d+\s*km)\b/i,
  },
  {
    id: 'fast_claim_payout',
    regex: /\b(?:fast(?:est)?\s+claim\s+payout|quick(?:est)?\s+claims?|guaranteed\s+claims?)\b/i,
  },
  {
    id: 'best_customer_service',
    regex: /\b(?:best\s+customer\s+service|best\s+claims?\s+service|highest\s+rated\s+claims?)\b/i,
  },
  {
    id: 'shariah_compliant',
    regex: /\b(?:(?:shariah|syariah|islamic)\s*(?:compliant|insurance|option|cover)?|takaful\s+(?:is\s+shariah|shariah))\b/i,
  },
  {
    id: 'tesla_specific',
    regex: /\b(?:tesla|ev|electric\s+vehicle|charger|charging\s+cable)\b/i,
  },
  {
    id: 'brand_program',
    regex: /\b(?:(?:perodua|proton|honda|toyota|bmw|mercedes)[-\s]*(?:specific|programme|program|benefits?|support|network|workshops?|fit|suitability)|(?:best|good|great|suitable|strong|tailored)\s+(?:for|fit).*?(?:perodua|proton|honda|toyota|bmw|mercedes)|brand\s+program|approved\s+workshop\s+network|benefits\s+tailored\s+for\s+your\s+car)\b/i,
  },
];

const INSURER_CONTEXT_REGEX = /\b(?:allianz|takaful\s+ikhlas|etiqa|tokio\s+marine|lonpac|msig|generali)\b/i;

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeText(sentence))
    .filter(Boolean);
}

function countQuestions(text) {
  const withoutUrls = String(text || '').replace(/https?:\/\/\S+/gi, '');
  return (withoutUrls.match(/\?/g) || []).length;
}

function hasImplicitDecisionPrompt(text) {
  return /\b(?:please\s+confirm\s+(?:if|whether)|confirm\s+(?:if|whether)|let\s+me\s+know\s+(?:if|whether)|tell\s+me\s+(?:if|whether)|reply\s+(?:yes|no|skip|with)|choose\s+(?:one|an option))\b/i.test(text);
}

function firstQuestionIndex(text) {
  return String(text || '').indexOf('?');
}

function firstPatternIndex(text, patterns = []) {
  const source = String(text || '');
  const indexes = patterns
    .map((pattern) => {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
      const match = source.match(regex);
      return match?.index ?? -1;
    })
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(text);
    return new RegExp(String(pattern), 'i').test(text);
  });
}

function getSentenceContaining(text, index) {
  const source = String(text || '');
  const sentences = splitSentences(source);
  let cursor = 0;

  for (const sentence of sentences) {
    const sentenceIndex = source.indexOf(sentence, cursor);
    if (sentenceIndex >= 0) {
      const sentenceEnd = sentenceIndex + sentence.length;
      if (index >= sentenceIndex && index <= sentenceEnd) {
        return sentence;
      }
      cursor = sentenceEnd;
    }
  }

  return source;
}

function isGeneralConceptAllowed(claimId, claimText, claimSentence) {
  if (claimId !== 'zero_betterment') return false;
  if (INSURER_CONTEXT_REGEX.test(claimSentence)) return false;

  const text = String(claimText || '').toLowerCase();
  return text.includes('betterment waiver') || text.includes('waiver of betterment');
}

function isAllowedPolicyClaim(claimId, claimText, allowed = []) {
  return allowed.some((allowedClaim) => {
    if (allowedClaim instanceof RegExp) return allowedClaim.test(claimText);
    const normalized = String(allowedClaim || '').toLowerCase();
    return normalized === claimId || normalized === 'all' || claimText.toLowerCase().includes(normalized);
  });
}

function findUnsupportedPolicyClaims(text, allowedClaims = []) {
  const claims = [];
  for (const claim of POLICY_FACT_CLAIMS) {
    const match = String(text || '').match(claim.regex);
    if (!match) continue;
    const claimText = match[0];
    const claimSentence = getSentenceContaining(text, match.index ?? 0);
    if (isGeneralConceptAllowed(claim.id, claimText, claimSentence)) continue;

    if (!isAllowedPolicyClaim(claim.id, claimText, allowedClaims)) {
      claims.push({ id: claim.id, text: claimText });
    }
  }
  return claims;
}

function findRepeatedSentences(text, previousAssistantMessages = []) {
  const current = splitSentences(text)
    .map((sentence) => sentence.toLowerCase())
    .filter((sentence) => sentence.length >= 28);
  const previous = new Set(
    previousAssistantMessages
      .flatMap((message) => splitSentences(message))
      .map((sentence) => sentence.toLowerCase())
      .filter((sentence) => sentence.length >= 28)
  );

  return current.filter((sentence) => previous.has(sentence));
}

function scoreIssues(issues) {
  const weightByIssue = {
    empty_response: 10,
    unsafe_payment_or_policy_confirmation: 5,
    unsupported_policy_fact_claim: 4,
    missing_payment_safety_language: 3,
    missing_required_recommendation: 3,
    question_before_answer: 2,
    missing_direct_answer: 2,
    visible_step_language: 2,
    too_many_questions: 2,
    missing_next_question: 1,
    missing_flow_resume: 1,
    robotic_phrase: 1,
    repeated_sentence_recent_turns: 1,
    uncertain_recommendation: 1,
    missing_simple_choices: 1,
  };

  const penalty = issues.reduce((sum, issue) => sum + (weightByIssue[issue.id] || 1), 0);
  return Math.max(0, Math.round((10 - penalty) * 10) / 10);
}

export function evaluateAssistantResponseQuality({
  userMessage = '',
  assistantResponse = '',
  state = {},
  decision = null,
  turnPlan = null,
  expectations = {},
} = {}) {
  const text = String(assistantResponse || '').trim();
  const issues = [];
  const answerPatterns = expectations.answerPatterns || [];
  const maxQuestions = Number.isFinite(expectations.maxQuestions) ? expectations.maxQuestions : 1;
  const questionCount = countQuestions(text);
  const previousAssistantMessages = expectations.previousAssistantMessages || [];

  if (!text) {
    issues.push({ id: 'empty_response', severity: 'critical' });
  }

  if (!expectations.allowStepLanguage && STEP_LANGUAGE_REGEX.test(text)) {
    issues.push({ id: 'visible_step_language', severity: 'medium' });
  }

  if (ROBOTIC_PHRASE_REGEX.test(text)) {
    issues.push({ id: 'robotic_phrase', severity: 'low' });
  }

  if (questionCount > maxQuestions) {
    issues.push({ id: 'too_many_questions', severity: 'medium', details: { questionCount, maxQuestions } });
  }

  if (expectations.requireNextQuestion && questionCount === 0 && !hasImplicitDecisionPrompt(text)) {
    issues.push({ id: 'missing_next_question', severity: 'low' });
  }

  if (expectations.answerFirst && answerPatterns.length > 0) {
    const answerIndex = firstPatternIndex(text, answerPatterns);
    const questionIndex = firstQuestionIndex(text);
    if (answerIndex < 0) {
      issues.push({ id: 'missing_direct_answer', severity: 'medium' });
    } else if (questionIndex >= 0 && questionIndex < answerIndex) {
      issues.push({ id: 'question_before_answer', severity: 'medium' });
    }
  }

  if (expectations.resumePatterns?.length && !matchesAny(text, expectations.resumePatterns)) {
    issues.push({ id: 'missing_flow_resume', severity: 'low' });
  }

  if (expectations.requiredRecommendation) {
    const insurerName = String(expectations.requiredRecommendation).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const recommendationRegex = new RegExp(`\\b(?:i recommend|my pick is|i would choose|go with)\\s+(?:the\\s+)?${insurerName}`, 'i');
    if (!recommendationRegex.test(text)) {
      issues.push({ id: 'missing_required_recommendation', severity: 'high' });
    }
    const uncertainBeforePick = /\b(it depends|maybe|not sure|hard to say|cannot recommend|can't recommend)\b/i.test(text.slice(0, 180));
    if (uncertainBeforePick) {
      issues.push({ id: 'uncertain_recommendation', severity: 'low' });
    }
  }

  if (expectations.simpleChoicePatterns?.length) {
    const matchedChoiceCount = expectations.simpleChoicePatterns.filter((pattern) => matchesAny(text, [pattern])).length;
    if (matchedChoiceCount < Math.min(2, expectations.simpleChoicePatterns.length)) {
      issues.push({ id: 'missing_simple_choices', severity: 'low', details: { matchedChoiceCount } });
    }
  }

  const paymentConfirmed = expectations.paymentConfirmed === true ||
    String(state?.transaction?.paymentStatus || '').toUpperCase() === 'PAID' ||
    !!state?.paymentMethod;
  if (!paymentConfirmed && UNSAFE_PAYMENT_OR_POLICY_REGEX.test(text)) {
    issues.push({ id: 'unsafe_payment_or_policy_confirmation', severity: 'critical' });
  }

  if (expectations.requirePaymentSafetyLanguage && !PAYMENT_SAFETY_REGEX.test(text)) {
    issues.push({ id: 'missing_payment_safety_language', severity: 'high' });
  }

  const unsupportedClaims = findUnsupportedPolicyClaims(text, expectations.allowedPolicyFactClaims || []);
  unsupportedClaims.forEach((claim) => {
    issues.push({
      id: 'unsupported_policy_fact_claim',
      severity: 'high',
      details: claim,
    });
  });

  const repeatedSentences = findRepeatedSentences(text, previousAssistantMessages);
  if (repeatedSentences.length > 0 && !expectations.userAskedRepeat) {
    issues.push({
      id: 'repeated_sentence_recent_turns',
      severity: 'low',
      details: { repeatedSentences },
    });
  }

  return {
    pass: issues.length === 0,
    score: scoreIssues(issues),
    issues,
    issueIds: issues.map((issue) => issue.id),
    questionCount,
    mode: decision?.mode || null,
    responsePattern: turnPlan?.responsePattern || null,
    currentStep: turnPlan?.currentStep || state?.step || null,
    userMessage,
  };
}

export function assertAssistantResponseQuality(result, minimumScore = 8) {
  return result.pass && result.score >= minimumScore;
}

export default evaluateAssistantResponseQuality;
