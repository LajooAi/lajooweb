#!/usr/bin/env node

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 45_000;

const CHECK = '✓';
const CROSS = '✕';

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

function assertState(condition, label, details = null) {
  if (!condition) fail(label, details);
}

async function clearSession(baseUrl, sessionId) {
  await fetch(`${baseUrl}/api/chat/session?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
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

async function postChat(baseUrl, sessionId, messages, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messages,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();

      if (response.status === 401 && /vercel|login|sso/i.test(rawText)) {
        fail('Deployment is protected by Vercel login/SSO before LAJOO code runs.', {
          status: response.status,
          baseUrl,
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

async function run() {
  const baseUrl = normalizeBaseUrl(process.env.CHAT_SMOKE_BASE_URL || process.argv[2]);
  const sessionId = process.env.CHAT_SMOKE_SESSION_ID || makeSessionId();
  const messages = [];
  const results = [];

  console.log(`LAJOO chat smoke test`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Session: ${sessionId}`);
  console.log('');

  await clearSession(baseUrl, sessionId);

  async function send(userMessage) {
    messages.push({ role: 'user', content: userMessage });
    const result = await postChat(baseUrl, sessionId, messages);
    messages.push({ role: 'assistant', content: result.reply || '' });
    results.push({ userMessage, result });
    displayStep(results.length, userMessage, result);
    return result;
  }

  const start = await send('Renew car insurance');
  assertIncludes(start.reply, 'Vehicle', 'renewal start prompt');
  assertIncludes(start.reply, 'Owner Identification Number', 'renewal start prompt');

  const vehicle = await send('JRT 9289 951018145405');
  assertIncludes(vehicle.reply, 'Found your vehicle', 'vehicle lookup');
  assertIncludes(vehicle.reply, 'Perodua Myvi', 'vehicle lookup');
  assertState(vehicle.state?.vehicleInfo?.sampleId === 'CAR01', 'Vehicle lookup did not return Mockoon CAR01 sample.', vehicle.state?.vehicleInfo);

  const quotes = await send('yes');
  assertIncludes(quotes.reply, 'option', 'quote options');
  assertState(quotes.state?.step === 'quotes', 'Confirming vehicle should keep user at quote selection.', quotes.state);

  const recommendation = await send('Which insurer do you recommend?');
  assertIncludes(recommendation.reply, 'recommend', 'quote recommendation');
  assertState(recommendation.state?.step === 'quotes', 'Recommendation question should not advance the flow.', recommendation.state);

  const insurer = await send('Takaful');
  assertIncludes(insurer.reply, 'Takaful', 'insurer selection');
  assertState(Boolean(insurer.state?.selectedQuote), 'Insurer selection should set selectedQuote.', insurer.state);

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
