import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecommendedInsurerFromAssistantMessage,
  isVehicleDetailsRejectionMessage,
  wasLastAssistantVehicleConfirmation,
  canUseDeliveredRoadTaxByOwnerType,
} from '../src/lib/flowGuards.js';

test('should only parse a single explicit recommendation', () => {
  assert.equal(
    parseRecommendedInsurerFromAssistantMessage("I'd go with Takaful Ikhlas at RM 796. Want to proceed?"),
    'takaful'
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage("I'd recommend Takaful Ikhlas at RM 796 - best value. Want to proceed with this?"),
    'takaful'
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage(
      '**My pick:** **Tokio Marine Insurance** — **RM 800**\n\n**Why:** Balanced value.\n\n**Trade-off:** Takaful is cheaper.'
    ),
    'tokio'
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage(
      'Just to confirm - do you want to proceed with **Tokio Marine Insurance**, or would you like me to explain the other insurers first?'
    ),
    'tokio'
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage('Pick Takaful, Tokio Marine, Etiqa, Allianz, Lonpac, MSIG, Generali, or say recommend for me.'),
    null
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage(
      "Here's the difference: Takaful is Shariah-compliant. Conventional includes Etiqa and Allianz. Considering value and features, I'd recommend Takaful Ikhlas at RM 796. Want to proceed with this?"
    ),
    'takaful'
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage(
      'Takaful: RM 796. Etiqa: RM 872. Allianz: RM 920. Which option would you like to go with?'
    ),
    null
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage("Best option here is Generali Insurance for maximum sum insured."),
    'generali'
  );

  assert.equal(
    parseRecommendedInsurerFromAssistantMessage(
      'Shall I select **Tokio Marine Insurance - RM 800.00** first, then we review the Betterment waiver option at add-ons?'
    ),
    'tokio'
  );
});

test('vehicle rejection detector should catch negative confirmations', () => {
  assert.equal(isVehicleDetailsRejectionMessage('no'), true);
  assert.equal(isVehicleDetailsRejectionMessage("that's wrong"), true);
  assert.equal(isVehicleDetailsRejectionMessage('this is not my vehicle'), true);
  assert.equal(isVehicleDetailsRejectionMessage('ok thanks'), false);
});

test('vehicle confirmation context should detect the latest assistant context only', () => {
  const contextTrue = wasLastAssistantVehicleConfirmation([
    { role: 'assistant', content: 'Found your vehicle! 🚗\n**Vehicle Reg.Num**: JRT9289\nIs this correct?' },
  ]);
  assert.equal(contextTrue, true);

  const contextFalse = wasLastAssistantVehicleConfirmation([
    { role: 'assistant', content: 'Found your vehicle! 🚗\nIs this correct?' },
    { role: 'user', content: 'ok' },
    { role: 'assistant', content: 'Pick Takaful, Tokio Marine, Etiqa, Allianz, Lonpac, MSIG, Generali, or say recommend for me.' },
  ]);
  assert.equal(contextFalse, false);
});

test('road tax delivered eligibility should allow only foreign/company ownership', () => {
  assert.equal(canUseDeliveredRoadTaxByOwnerType('foreign_id'), true);
  assert.equal(canUseDeliveredRoadTaxByOwnerType('company_reg'), true);
  assert.equal(canUseDeliveredRoadTaxByOwnerType('nric'), false);
  assert.equal(canUseDeliveredRoadTaxByOwnerType('other_id'), false);
  assert.equal(canUseDeliveredRoadTaxByOwnerType(null), false);
});
