/**
 * System Prompts Loader
 * Loads and combines all prompt files for the LAJOO AI assistant
 */

import fs from 'fs';
import path from 'path';

// Load files at build time
const promptsDir = path.join(process.cwd(), 'src/prompts');

// Load markdown files
const insuranceAssistantPrompt = fs.readFileSync(
  path.join(promptsDir, 'insurance-assistant.md'),
  'utf-8'
);

const customerRetentionPrompt = fs.readFileSync(
  path.join(promptsDir, 'customer-retention.md'),
  'utf-8'
);

// Load pricing data
import pricingData from './pricing-data.json';

/**
 * Format pricing data as text for the AI prompt
 */
function formatPricingData(data) {
  const { insurers, addOns, roadTax, deliveryTimes } = data;

  let text = '## PRICES (Use exact amounts)\n\n';

  // Insurers
  text += '**Insurance (after 20% NCD):**\n';
  for (const ins of insurers) {
    const features = ins.features.join(', ');
    text += `- ${ins.name}: RM${ins.priceAfter} (was RM${ins.priceBefore}) — Sum Insured RM${(ins.sumInsured / 1000).toFixed(0)}k, ${features}\n`;
  }

  // Add-ons
  text += '\n**Add-Ons:**\n';
  for (const addon of addOns) {
    text += `- ${addon.name}: RM${addon.price} — ${addon.description}\n`;
  }

  // Road Tax
  text += '\n**Road Tax:**\n';
  text += `- 6 months digital: RM${roadTax['6months'].digital} | delivered: RM${roadTax['6months'].delivered}\n`;
  text += `- 12 months digital: RM${roadTax['12months'].digital} | delivered: RM${roadTax['12months'].delivered}\n`;

  // Delivery Times
  text += '\n**Delivery Times (for physical road tax):**\n';
  text += `- Klang Valley: ${deliveryTimes.klangValley}\n`;
  text += `- Peninsular Malaysia (Town): ${deliveryTimes.peninsularTown}\n`;
  text += `- Peninsular Malaysia (Rural): ${deliveryTimes.peninsularRural}\n`;
  text += `- Sarawak: ${deliveryTimes.sarawak}\n`;

  return text;
}

/**
 * Build the complete system prompt with state and vehicle info
 */
export function buildSystemPrompt(state, vehicleProfile) {
  const pricing = formatPricingData(pricingData);

  const stateContext = `## CURRENT STATE
${state.getAIContext()}
${vehicleProfile ? `Vehicle: ${vehicleProfile.make} ${vehicleProfile.model} ${vehicleProfile.year} | ${vehicleProfile.engineCC}cc | ${vehicleProfile.address.city} | NCD: ${vehicleProfile.ncdPercent}%` : ''}`;

  // Combine all prompts
  return `${insuranceAssistantPrompt}

${stateContext}

${pricing}

${customerRetentionPrompt}`;
}

// Export pricing data for use elsewhere
export { pricingData };
