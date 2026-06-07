import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapConversationMessageForAdmin,
  mapConversationSessionForAdmin,
  sanitizeConversationAuditUpdateInput,
} from '../src/server/admin/conversationAuditAdmin.js';

test('conversation audit masks sensitive user data before admin display', () => {
  const mapped = mapConversationMessageForAdmin({
    id: 'msg_1',
    role: 'user',
    content: 'My IC is 951018145405, phone 0123456789 and email founder@lajoo.com',
    messageOrder: 0,
    createdAt: new Date('2026-06-07T12:00:00Z'),
  });

  assert.equal(mapped.piiMasked, true);
  assert.match(mapped.content, /\[owner-id\]/);
  assert.match(mapped.content, /\[phone\]/);
  assert.match(mapped.content, /\[email\]/);
  assert.doesNotMatch(mapped.content, /951018145405|0123456789|founder@lajoo\.com/);
});

test('conversation audit keeps source trace fields for assistant answers', () => {
  const mapped = mapConversationMessageForAdmin({
    id: 'msg_2',
    role: 'assistant',
    content: 'MSIG and Allianz have betterment waiver options.',
    messageOrder: 1,
    auditStatus: 'needs_review',
    auditNote: 'Check wording before production.',
    auditedAt: new Date('2026-06-07T12:05:00Z'),
    createdAt: new Date('2026-06-07T12:01:00Z'),
    knowledgeTrace: {
      traceId: 'kst_test',
      sourceCount: 1,
      sources: [{
        id: 'db:fact_1',
        insurerName: 'MSIG',
        category: 'betterment',
        sourceLabel: 'msig/private-car/betterment.pdf (p. 1)',
        sourcePage: 1,
        validityStatus: 'active',
      }],
    },
  });

  assert.equal(mapped.hasSourceTrace, true);
  assert.equal(mapped.auditStatus, 'needs_review');
  assert.equal(mapped.knowledgeTrace.traceId, 'kst_test');
  assert.equal(mapped.knowledgeTrace.sources[0].sourceLabel, 'msig/private-car/betterment.pdf (p. 1)');
});

test('conversation audit session summary counts sourced and flagged answers', () => {
  const mapped = mapConversationSessionForAdmin({
    id: 'session_12345678',
    createdAt: new Date('2026-06-07T12:00:00Z'),
    updatedAt: new Date('2026-06-07T12:10:00Z'),
    expiresAt: new Date('2026-06-08T12:00:00Z'),
    metadata: { step: 'quotes', conversationMode: 'quote_comparison' },
    messages: [
      {
        id: 'msg_user',
        role: 'user',
        content: 'which insurer is better?',
        messageOrder: 0,
        createdAt: new Date('2026-06-07T12:00:00Z'),
      },
      {
        id: 'msg_ai',
        role: 'assistant',
        content: 'I recommend Allianz for betterment.',
        messageOrder: 1,
        auditStatus: 'wrong',
        createdAt: new Date('2026-06-07T12:01:00Z'),
        knowledgeTrace: {
          traceId: 'kst_1',
          sourceCount: 1,
          sources: [{ sourceLabel: 'allianz/pds.pdf (p. 1)', insurerName: 'Allianz' }],
        },
      },
    ],
  });

  assert.equal(mapped.sourcedAnswerCount, 1);
  assert.equal(mapped.auditCounts.wrong, 1);
  assert.deepEqual(mapped.sourceLabels, ['allianz/pds.pdf (p. 1)']);
  assert.equal(mapped.messages.length, 2);
});

test('conversation audit update sanitizer accepts review statuses and rejects invalid values', () => {
  assert.deepEqual(sanitizeConversationAuditUpdateInput({
    auditStatus: 'NEEDS_REVIEW',
    auditNote: 'Needs a better source.',
  }), {
    auditStatus: 'needs_review',
    auditNote: 'Needs a better source.',
  });

  assert.deepEqual(sanitizeConversationAuditUpdateInput({
    auditStatus: 'clear',
    auditNote: '',
  }), {
    auditStatus: null,
    auditNote: null,
  });

  assert.throws(() => sanitizeConversationAuditUpdateInput({
    auditStatus: 'approved_forever',
  }), /Invalid message audit status/);
});
