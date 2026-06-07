import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTurnInstruction,
  addTurnInstructions,
  buildTurnInstructionMessages,
  createTurnInstructionStack,
  getTurnInstructionStackDebug,
  TURN_INSTRUCTION_PRIORITY,
} from '../src/server/ai/turnInstructionStack.js';

function messageIndex(messages, text) {
  return messages.findIndex((message) => String(message.content || '').includes(text));
}

test('turn instruction stack orders safety and grounding before advisor style', () => {
  const stack = createTurnInstructionStack();

  addTurnInstruction(stack, {
    id: 'advisor',
    priority: TURN_INSTRUCTION_PRIORITY.ADVISOR,
    category: 'advisor',
    content: 'Advisor instruction',
  });
  addTurnInstruction(stack, {
    id: 'safety',
    priority: TURN_INSTRUCTION_PRIORITY.SAFETY,
    category: 'safety',
    content: 'Safety instruction',
  });
  addTurnInstruction(stack, {
    id: 'knowledge',
    priority: TURN_INSTRUCTION_PRIORITY.KNOWLEDGE,
    category: 'knowledge',
    content: 'Knowledge instruction',
  });

  const messages = buildTurnInstructionMessages(stack);

  assert.match(messages[0].content, /LAJOO TURN INSTRUCTION STACK/i);
  assert.ok(messageIndex(messages, 'Safety instruction') < messageIndex(messages, 'Knowledge instruction'));
  assert.ok(messageIndex(messages, 'Knowledge instruction') < messageIndex(messages, 'Advisor instruction'));
});

test('turn instruction stack removes duplicate content and replaces same id', () => {
  const stack = createTurnInstructionStack({ includePriorityHeader: false });

  addTurnInstruction(stack, {
    id: 'policy',
    priority: TURN_INSTRUCTION_PRIORITY.SAFETY,
    content: 'Old policy instruction',
  });
  addTurnInstruction(stack, {
    id: 'policy',
    priority: TURN_INSTRUCTION_PRIORITY.SAFETY,
    content: 'New policy instruction',
  });
  addTurnInstruction(stack, {
    id: 'duplicate',
    priority: TURN_INSTRUCTION_PRIORITY.QUALITY,
    content: 'New policy instruction',
  });

  const messages = buildTurnInstructionMessages(stack);
  const joined = messages.map((message) => message.content).join('\n');

  assert.equal(messages.length, 1);
  assert.doesNotMatch(joined, /Old policy instruction/);
  assert.match(joined, /New policy instruction/);
});

test('turn instruction stack supports explicit replacement hooks', () => {
  const stack = createTurnInstructionStack({ includePriorityHeader: false });

  addTurnInstruction(stack, {
    id: 'general-flow',
    priority: TURN_INSTRUCTION_PRIORITY.FLOW_CONTRACT,
    content: 'General flow instruction',
  });
  addTurnInstruction(stack, {
    id: 'specific-flow',
    replaces: ['general-flow'],
    priority: TURN_INSTRUCTION_PRIORITY.FLOW_CONTRACT,
    content: 'Specific flow instruction',
  });

  const messages = buildTurnInstructionMessages(stack);

  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /Specific flow instruction/);
  assert.doesNotMatch(messages[0].content, /General flow instruction/);
});

test('turn instruction stack ignores empty instructions and can add arrays', () => {
  const stack = createTurnInstructionStack({ includePriorityHeader: false });

  assert.equal(addTurnInstruction(stack, { id: 'empty', content: '' }), false);
  const added = addTurnInstructions(stack, [
    'First instruction',
    null,
    { content: 'Second instruction' },
  ], {
    id: 'batch',
    priority: TURN_INSTRUCTION_PRIORITY.QUALITY,
  });

  assert.equal(added, 2);
  assert.deepEqual(
    getTurnInstructionStackDebug(stack).map((item) => item.id),
    ['batch-1', 'batch-3']
  );
});
