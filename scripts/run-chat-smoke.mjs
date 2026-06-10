#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 45_000;
const PRICE_WITHOUT_CENTS_REGEX = /RM\s+\d{1,3}(?:,\d{3})*(?!\.\d{2}|[A-Za-z\d,])/gi;
const LOCAL_ENV_KEYS = new Set([
  'CHAT_SMOKE_VERCEL_BYPASS_SECRET',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
]);

const CHECK = '✓';
const CROSS = '✕';

function unquoteEnvValue(value) {
  const trimmed = String(value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadLocalSmokeEnv() {
  const path = '.env.local';
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!LOCAL_ENV_KEYS.has(key) || process.env[key]) continue;
    process.env[key] = unquoteEnvValue(rawValue);
  }
}

loadLocalSmokeEnv();

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function makeSessionId() {
  return `chat-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fail(message, details = null) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assertIncludes(text, needle, label) {
  if (!String(text || '').toLowerCase().includes(String(needle || '').toLowerCase())) {
    fail(`Expected reply to include "${needle}" for ${label}.`, {
      reply: String(text || '').slice(0, 1200),
    });
  }
}

function assertNotIncludes(text, needle, label) {
  if (String(text || '').toLowerCase().includes(String(needle || '').toLowerCase())) {
    fail(`Expected reply not to include "${needle}" for ${label}.`, {
      reply: String(text || '').slice(0, 1200),
    });
  }
}

function assertMatches(text, pattern, label) {
  if (!pattern.test(String(text || ''))) {
    fail(`Expected reply to match ${pattern} for ${label}.`, {
      reply: String(text || '').slice(0, 1200),
    });
  }
}

function assertState(condition, label, details = null) {
  if (!condition) fail(label, details);
}

function assertNoIntegerPrices(text, label) {
  const matches = String(text || '').match(PRICE_WITHOUT_CENTS_REGEX) || [];
  if (matches.length > 0) {
    fail(`Expected all RM prices to show 2 decimal places for ${label}.`, {
      matches,
      reply: String(text || '').slice(0, 1200),
    });
  }

  const malformedMatches = String(text || '').match(/\bRM\s+\d{1,3}(?:,\d{3})*\.\d{2}\.\d{2}\b/gi) || [];
  if (malformedMatches.length > 0) {
    fail(`Expected RM prices not to contain duplicated decimal parts for ${label}.`, {
      matches: malformedMatches,
      reply: String(text || '').slice(0, 1200),
    });
  }
}

async function clearSession(baseUrl, sessionId) {
  await fetch(`${baseUrl}/api/chat/session?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: buildRequestHeaders(),
    body: '{}',
  }).catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSseResult(rawText) {
  let donePayload = null;
  let errorPayload = null;
  const events = String(rawText || '').split(/\n\n+/);
  for (const event of events) {
    const line = event.split('\n').find((item) => item.startsWith('data:'));
    if (!line) continue;
    const dataText = line.slice(5).trim();
    if (!dataText || dataText === '[DONE]') continue;
    let parsed = null;
    try {
      parsed = JSON.parse(dataText);
    } catch {
      continue;
    }
    if (parsed?.type === 'done') donePayload = parsed;
    if (parsed?.type === 'error') errorPayload = parsed;
  }
  return { donePayload, errorPayload };
}

function getVercelBypassSecret() {
  return (
    process.env.CHAT_SMOKE_VERCEL_BYPASS_SECRET ||
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    ''
  ).trim();
}

function buildRequestHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const bypassSecret = getVercelBypassSecret();
  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
  }
  return headers;
}

async function postChat(baseUrl, sessionId, messages, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: buildRequestHeaders(),
        body: JSON.stringify({
          sessionId,
          messages,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();

      if (response.status === 401 && /vercel|login|sso/i.test(rawText)) {
        const hasBypassSecret = Boolean(getVercelBypassSecret());
        fail('Deployment is protected by Vercel login/SSO before LAJOO code runs.', {
          status: response.status,
          baseUrl,
          bypassSecretConfigured: hasBypassSecret,
          nextStep: hasBypassSecret
            ? 'Confirm the Vercel automation bypass secret is enabled for this project.'
            : 'Set VERCEL_AUTOMATION_BYPASS_SECRET or CHAT_SMOKE_VERCEL_BYPASS_SECRET locally.',
        });
      }

      if (!response.ok) {
        fail(`Chat API returned HTTP ${response.status}.`, {
          status: response.status,
          body: rawText.slice(0, 1600),
        });
      }

      const { donePayload, errorPayload } = parseSseResult(rawText);
      if (donePayload) return donePayload;

      if (errorPayload?.retryable && attempt < maxAttempts) {
        const delayMs = 4_000 * attempt;
        console.log(`  retryable chat error (${errorPayload.code || 'unknown'}); retrying in ${delayMs / 1000}s...`);
        await sleep(delayMs);
        continue;
      }

      if (errorPayload) {
        fail(`Chat API returned error event: ${errorPayload.message || 'Unknown error'}`, errorPayload);
      }

      fail('Chat API stream ended without a done payload.', {
        body: rawText.slice(0, 1600),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  fail('Chat API retry attempts exhausted.');
}

function displayStep(index, userMessage, result) {
  const reply = String(result?.reply || '').replace(/\s+/g, ' ').trim();
  const stateStep = result?.state?.step || 'unknown';
  console.log(`${CHECK} ${index}. "${userMessage}" -> step=${stateStep}; reply="${reply.slice(0, 110)}${reply.length > 110 ? '...' : ''}"`);
}

function getPaymentHref(reply) {
  const match = String(reply || '').match(/\]\((\/my\/payment\/[^)]+)\)/);
  return match?.[1] || null;
}

function getPaymentIdFromHref(href) {
  const match = String(href || '').match(/\/payment\/([^?/#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function getPaymentStatus(baseUrl, paymentId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/payment/status/${encodeURIComponent(paymentId)}`, {
      headers: buildRequestHeaders(),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      fail(`Payment status API returned HTTP ${response.status}.`, {
        status: response.status,
        body,
      });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const baseUrl = normalizeBaseUrl(process.env.CHAT_SMOKE_BASE_URL || process.argv[2]);
  const sessionId = process.env.CHAT_SMOKE_SESSION_ID || makeSessionId();
  const mode = String(process.env.CHAT_SMOKE_MODE || 'full').trim().toLowerCase();
  const messages = [];
  const results = [];

  console.log(`LAJOO chat smoke test`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Mode: ${mode}`);
  console.log(`Vercel bypass: ${getVercelBypassSecret() ? 'configured' : 'not configured'}`);
  console.log('');

  await clearSession(baseUrl, sessionId);

  async function send(userMessage) {
    messages.push({ role: 'user', content: userMessage });
    const result = await postChat(baseUrl, sessionId, messages);
    messages.push({ role: 'assistant', content: result.reply || '' });
    results.push({ userMessage, result });
    displayStep(results.length, userMessage, result);
    assertNoIntegerPrices(result.reply, `turn ${results.length}`);
    return result;
  }

  const start = await send('Renew car insurance');
  assertIncludes(start.reply, 'Vehicle', 'renewal start prompt');
  assertIncludes(start.reply, 'Owner Identification Number', 'renewal owner ID prompt');
  assertState(!/I agree/i.test(start.reply || ''), 'Renewal start should not show the old PDPA consent gate.', {
    reply: String(start.reply || '').slice(0, 1200),
  });

  const vehicle = await send('JRT 9289 951018145405');
  assertIncludes(vehicle.reply, 'Found your vehicle', 'vehicle lookup');
  assertIncludes(vehicle.reply, 'Perodua Myvi', 'vehicle lookup');
  assertMatches(
    vehicle.reply,
    /Market Value\s*:<\/strong>\s*RM\s*\d[\d,]*\.\d{2}\s*-\s*RM\s*\d[\d,]*\.\d{2}/i,
    'vehicle market value range'
  );
  assertState(vehicle.state?.vehicleInfo?.sampleId === 'CAR01', 'Vehicle lookup did not return Mockoon CAR01 sample.', vehicle.state?.vehicleInfo);

  const quotes = await send('yes');
  assertIncludes(quotes.reply, 'option', 'quote options');
  assertState(quotes.state?.step === 'quotes', 'Confirming vehicle should keep user at quote selection.', quotes.state);

  if (mode === 'core') {
    const insurer = await send('Takaful');
    assertIncludes(insurer.reply, 'Takaful', 'insurer selection');
    assertState(Boolean(insurer.state?.selectedQuote), 'Insurer selection should set selectedQuote.', insurer.state);

    const addOns = await send('skip add-ons');
    assertState(
      Array.isArray(addOns.state?.selectedAddOns) && addOns.state.selectedAddOns.length === 0,
      'Skipping add-ons should keep selectedAddOns empty.',
      addOns.state?.selectedAddOns
    );
    assertState(addOns.state?.step === 'roadtax', 'Skipping add-ons should advance to road tax.', addOns.state);

    const roadTax = await send('yes digital road tax');
    assertState(
      roadTax.state?.selectedRoadTax?.name && /digital/i.test(roadTax.state.selectedRoadTax.name),
      'Digital road tax selection should update selectedRoadTax.',
      roadTax.state?.selectedRoadTax
    );
    assertState(roadTax.state?.step === 'personal_details', 'Road tax selection should advance to personal details.', roadTax.state);

    const details = await send('email ali@example.com, phone 0123456789, address No 1 Jalan Test, 47000 Shah Alam Selangor');
    assertIncludes(details.reply, 'Does everything look', 'personal details confirmation');
    assertState(details.state?.step === 'otp', 'Complete personal details should move to OTP confirmation.', details.state);

    const otpPrompt = await send('yes');
    assertIncludes(otpPrompt.reply, 'OTP', 'OTP prompt');
    assertState(otpPrompt.state?.step === 'otp', 'Confirming personal details should stay on OTP entry.', otpPrompt.state);

    const payment = await send('1234');
    assertIncludes(payment.reply, 'Pay securely', 'payment step');
    assertState(payment.state?.step === 'payment', 'Valid OTP should move to payment.', payment.state);

    const paymentHref = getPaymentHref(payment.reply);
    assertState(Boolean(paymentHref), 'Payment reply should include a checkout link.', payment.reply);
    const paymentId = getPaymentIdFromHref(paymentHref);
    assertState(Boolean(paymentId), 'Payment checkout link should include a paymentId.', paymentHref);

    const paymentStatus = await getPaymentStatus(baseUrl, paymentId);
    assertState(paymentStatus?.found === true, 'Payment snapshot should exist server-side.', paymentStatus);
    assertState(
      paymentStatus?.payment?.paymentId === paymentId && Number(paymentStatus?.payment?.total || 0) > 0,
      'Payment status should return the locked server-side snapshot.',
      paymentStatus
    );

    console.log('');
    console.log(`${CHECK} Core smoke test passed: ${results.length} turns verified; payment snapshot ${paymentId} found.`);
    return;
  }

  const recommendation = await send('Which insurer do you recommend?');
  assertMatches(recommendation.reply, /\*\*My pick:\*\*/i, 'quote recommendation');
  assertMatches(recommendation.reply, /\*\*Why:\*\*/i, 'quote recommendation');
  assertMatches(recommendation.reply, /\*\*Trade-off:\*\*/i, 'quote recommendation');
  assertMatches(
    recommendation.reply,
    /\?(?=[^?]*$)/,
    'quote recommendation should end with a next-step question'
  );
  assertMatches(
    recommendation.reply,
    /\b(go with|choose|choice|select|proceed)\b/i,
    'quote recommendation should ask for an insurer decision'
  );
  assertState(recommendation.state?.step === 'quotes', 'Recommendation question should not advance the flow.', recommendation.state);

  const ambiguousRecommendationAck = await send('ok');
  assertMatches(
    ambiguousRecommendationAck.reply,
    /proceed with \*\*[^*]+Insurance\*\*|proceed with \*\*[^*]+\*\*/i,
    'ambiguous recommendation acknowledgement'
  );
  assertMatches(ambiguousRecommendationAck.reply, /other insurers|explain the other/i, 'ambiguous recommendation acknowledgement');
  assertNotIncludes(ambiguousRecommendationAck.reply, 'Choose Insurer', 'ambiguous recommendation acknowledgement');
  assertState(!ambiguousRecommendationAck.state?.selectedQuote, 'Ambiguous recommendation acknowledgement should not select a quote.', ambiguousRecommendationAck.state);
  assertState(ambiguousRecommendationAck.state?.step === 'quotes', 'Ambiguous recommendation acknowledgement should stay at quote selection.', ambiguousRecommendationAck.state);

  const insurer = await send('Takaful');
  assertIncludes(insurer.reply, 'Takaful', 'insurer selection');
  assertState(Boolean(insurer.state?.selectedQuote), 'Insurer selection should set selectedQuote.', insurer.state);

  const addOnAdvice = await send('which do i need ? or i can skip');
  assertMatches(addOnAdvice.reply, /Special Perils|Flood/i, 'add-on advice should mention flood/Special Perils');
  assertMatches(addOnAdvice.reply, /Windscreen/i, 'add-on advice should mention windscreen');
  assertMatches(addOnAdvice.reply, /Betterment|repair cost|older/i, 'add-on advice should mention betterment context');
  assertMatches(addOnAdvice.reply, /skip/i, 'add-on advice should explain skip is allowed');
  assertState(addOnAdvice.state?.step === 'addons', 'Add-on advice question should not advance to road tax.', addOnAdvice.state);
  assertState(
    Array.isArray(addOnAdvice.state?.selectedAddOns) && addOnAdvice.state.selectedAddOns.length === 0,
    'Add-on advice question should not select or skip add-ons.',
    addOnAdvice.state?.selectedAddOns
  );

  const windscreenQuestion = await send('What is windscreen cover?');
  assertIncludes(windscreenQuestion.reply, 'windscreen', 'windscreen question');
  assertState(
    ['addons', 'roadtax'].includes(windscreenQuestion.state?.step),
    'Windscreen question should stay inside the renewal flow.',
    windscreenQuestion.state
  );

  const addOns = await send('Add windscreen RM 1000 and flood');
  assertState(
    Array.isArray(addOns.state?.selectedAddOns) && addOns.state.selectedAddOns.length >= 2,
    'Selecting windscreen and flood should update selectedAddOns.',
    addOns.state?.selectedAddOns
  );

  const changeInsurer = await send('Actually change insurer to Etiqa');
  assertIncludes(changeInsurer.reply, 'Etiqa', 'change insurer request');
  assertState(
    changeInsurer.state?.pendingAction?.type === 'confirm_quote_change',
    'Change insurer should ask for confirmation before clearing downstream choices.',
    changeInsurer.state?.pendingAction
  );

  const confirmInsurerChange = await send('yes');
  assertIncludes(confirmInsurerChange.reply, 'Etiqa', 'confirm insurer change');
  assertState(
    /etiqa/i.test(confirmInsurerChange.state?.selectedQuote?.insurer || ''),
    'Confirming insurer change should update selectedQuote to Etiqa.',
    confirmInsurerChange.state?.selectedQuote
  );
  assertState(
    (confirmInsurerChange.state?.selectedAddOns || []).length === 0 && !confirmInsurerChange.state?.selectedRoadTax,
    'Confirming insurer change should clear add-ons and road tax.',
    {
      selectedAddOns: confirmInsurerChange.state?.selectedAddOns,
      selectedRoadTax: confirmInsurerChange.state?.selectedRoadTax,
    }
  );

  const changeAddOns = await send('Flood only please');
  assertState(
    /flood|special perils|natural disaster/i.test(changeAddOns.reply || ''),
    'Add-on reply should acknowledge flood/special perils selection.',
    { reply: String(changeAddOns.reply || '').slice(0, 1200) }
  );
  const selectedAddOnIds = (changeAddOns.state?.selectedAddOns || []).map((item) => item.id);
  assertState(
    selectedAddOnIds.includes('flood') && !selectedAddOnIds.includes('windscreen'),
    'Add-on selection should keep flood only.',
    selectedAddOnIds
  );

  const roadTax = await send('yes digital road tax');
  assertState(
    roadTax.state?.selectedRoadTax?.name && /digital/i.test(roadTax.state.selectedRoadTax.name),
    'Digital road tax selection should update selectedRoadTax.',
    roadTax.state?.selectedRoadTax
  );

  const paymentSafety = await send('payment done');
  assertIncludes(paymentSafety.reply, 'not', 'payment safety');
  assertState(
    !paymentSafety.state?.transaction?.policyNumber,
    'Payment claim should not issue policy without confirmed payment provider state.',
    paymentSafety.state?.transaction
  );

  console.log('');
  console.log(`${CHECK} Smoke test passed: ${results.length} turns verified.`);
}

run().catch((error) => {
  console.error(`${CROSS} Smoke test failed: ${error.message}`);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
});
