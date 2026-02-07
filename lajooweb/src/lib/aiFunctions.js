/**
 * AI Function Definitions for OpenAI Function Calling
 * These define what functions the AI can call to help users
 */

import { searchKnowledgeBase, getKnowledgeByCategory } from './knowledgeBase.js';

export const AI_FUNCTIONS = [
  {
    name: "lookup_previous_policy",
    description: "Look up the user's previous insurance policy using their vehicle registration number. Use this when the user asks about their last year's policy, previous insurance, or current coverage.",
    parameters: {
      type: "object",
      properties: {
        registrationNumber: {
          type: "string",
          description: "Malaysian vehicle registration number (e.g., WXY1234, ABC5678)"
        }
      },
      required: ["registrationNumber"]
    }
  },
  {
    name: "get_insurance_quotes",
    description: "Fetch insurance quotes from multiple insurers based on vehicle information. Use this when the user wants to see quotes, compare prices, or start the renewal process.",
    parameters: {
      type: "object",
      properties: {
        vehicleType: {
          type: "string",
          description: "Type of vehicle",
          enum: ["Private Car", "Motorcycle", "Commercial Vehicle"]
        },
        cc: {
          type: "number",
          description: "Engine capacity in CC"
        },
        sumInsured: {
          type: "number",
          description: "Sum insured / market value of the vehicle in RM"
        },
        ncd: {
          type: "number",
          description: "No Claims Discount percentage (0-55)"
        }
      },
      required: ["vehicleType", "cc", "sumInsured"]
    }
  },
  {
    name: "validate_registration_number",
    description: "Validate a Malaysian vehicle registration number and check if we have any history for this vehicle. Use this to verify the registration number before processing.",
    parameters: {
      type: "object",
      properties: {
        registrationNumber: {
          type: "string",
          description: "Vehicle registration number to validate"
        }
      },
      required: ["registrationNumber"]
    }
  },
  {
    name: "get_available_addons",
    description: "Get the list of available insurance add-ons like windscreen protection, flood coverage, etc. Use this when user asks what add-ons are available.",
    parameters: {
      type: "object",
      properties: {
        insurerId: {
          type: "string",
          description: "ID of the selected insurer (optional)"
        }
      }
    }
  },
  {
    name: "get_roadtax_options",
    description: "Get road tax renewal options including delivery and digital options. Use this when user asks about road tax renewal.",
    parameters: {
      type: "object",
      properties: {
        cc: {
          type: "number",
          description: "Engine capacity in CC to calculate road tax amount"
        }
      },
      required: ["cc"]
    }
  },
  {
    name: "calculate_total_premium",
    description: "Calculate the total premium including base insurance, add-ons, and road tax. Use this when user asks about total price or wants to know the final amount.",
    parameters: {
      type: "object",
      properties: {
        basePremium: {
          type: "number",
          description: "Base insurance premium after NCD"
        },
        addOns: {
          type: "array",
          description: "Array of selected add-on prices",
          items: {
            type: "number"
          }
        },
        roadTax: {
          type: "number",
          description: "Road tax amount (optional)"
        }
      },
      required: ["basePremium"]
    }
  },
  {
    name: "update_conversation_state",
    description: "Update the conversation state to track user progress through the insurance renewal flow. Use this when user completes a step or makes a selection.",
    parameters: {
      type: "object",
      properties: {
        step: {
          type: "string",
          description: "Current step in the flow",
          enum: ["initial", "vehicle_info", "quotes", "addons", "roadtax", "personal_details", "otp", "payment", "completed"]
        },
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["set_step", "select_quote", "confirm_addons", "confirm_roadtax", "submit_details"]
        },
        data: {
          type: "object",
          description: "Additional data for the action"
        }
      },
      required: ["step", "action"]
    }
  },
  {
    name: "search_insurance_knowledge",
    description: "Search the insurance knowledge base to answer questions about insurance concepts, coverage types, claims, NCD, road tax, and Malaysian insurance regulations. Use this when users ask 'what is', 'how does', 'explain', or any insurance-related questions.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The user's question or search query"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "explain_insurance_term",
    description: "Explain specific insurance terms like NCD, sum insured, comprehensive, third party, takaful, betterment, etc. Use when user asks about specific terminology.",
    parameters: {
      type: "object",
      properties: {
        term: {
          type: "string",
          description: "The insurance term to explain",
          enum: ["NCD", "sum insured", "comprehensive", "third party", "takaful", "betterment", "excess", "special perils", "panel workshop"]
        }
      },
      required: ["term"]
    }
  },
  {
    name: "compare_coverage_types",
    description: "Compare different types of insurance coverage (comprehensive vs third party, takaful vs conventional, etc.). Use when user asks about differences between coverage options.",
    parameters: {
      type: "object",
      properties: {
        type1: {
          type: "string",
          description: "First coverage type to compare"
        },
        type2: {
          type: "string",
          description: "Second coverage type to compare"
        }
      },
      required: ["type1", "type2"]
    }
  },
  {
    name: "explain_claims_process",
    description: "Explain the insurance claims process, what documents are needed, timeline, and procedures. Use when user asks about making a claim or claims-related questions.",
    parameters: {
      type: "object",
      properties: {
        claimType: {
          type: "string",
          description: "Type of claim",
          enum: ["accident", "theft", "total loss", "windscreen", "flood", "general"]
        }
      },
      required: ["claimType"]
    }
  },
  {
    name: "calculate_ncd_entitlement",
    description: "Calculate or explain NCD (No Claims Discount) based on years without claims. Use when user asks about their NCD level or how NCD works.",
    parameters: {
      type: "object",
      properties: {
        yearsNoClaims: {
          type: "number",
          description: "Number of consecutive years without claims"
        },
        currentNCD: {
          type: "number",
          description: "Current NCD percentage (optional)"
        }
      },
      required: ["yearsNoClaims"]
    }
  },
  {
    name: "recommend_coverage",
    description: "Recommend appropriate insurance coverage and add-ons based on user's situation, location, car type, and usage. Use when user asks what coverage they should get or if they need certain add-ons.",
    parameters: {
      type: "object",
      properties: {
        carValue: {
          type: "number",
          description: "Car market value in RM"
        },
        location: {
          type: "string",
          description: "User's location or area (for flood risk assessment)"
        },
        usage: {
          type: "string",
          description: "How the car is used",
          enum: ["daily commute", "occasional", "business", "family"]
        }
      },
      required: ["carValue"]
    }
  },
  {
    name: "estimate_premium_savings",
    description: "Estimate potential savings from NCD, compare premiums, or calculate cost differences. Use when user asks about savings, cost comparison, or 'how much can I save'.",
    parameters: {
      type: "object",
      properties: {
        basePremium: {
          type: "number",
          description: "Base premium before discounts"
        },
        ncdPercent: {
          type: "number",
          description: "NCD percentage"
        },
        compareScenarios: {
          type: "boolean",
          description: "Whether to compare different NCD scenarios"
        }
      },
      required: ["basePremium"]
    }
  },
  {
    name: "check_renewal_eligibility",
    description: "Check if user is eligible for renewal, if they can transfer NCD, or validate their policy status. Use when user asks about eligibility or renewal requirements.",
    parameters: {
      type: "object",
      properties: {
        policyExpiryDate: {
          type: "string",
          description: "Policy expiry date (YYYY-MM-DD format)"
        },
        hasActiveClaims: {
          type: "boolean",
          description: "Whether user has active/pending claims"
        }
      }
    }
  }
];

/**
 * Get the system prompt for the AI assistant
 * @param {Object} context - Current conversation context
 * @returns {string} - System prompt
 */
export function getSystemPrompt(context = {}) {
  const {
    currentStep = "initial",
    selectedQuote = null,
    selectedAddOns = [],
    selectedRoadTax = null,
    vehicleInfo = null,
    userDetails = null
  } = context;

  return `## ⚠️ CRITICAL: UI MARKERS - READ THIS FIRST! ⚠️

You control the UI! YOU MUST include a marker at the END of your response when presenting options.
WITHOUT the marker, the UI cards WON'T appear and users can't select anything!

**MARKERS (include at END of response on its own line):**
- [SHOW_QUOTES] → When presenting insurance quotes
- [SHOW_ADDONS] → When presenting add-on options
- [SHOW_ROADTAX] → When presenting road tax options
- [SHOW_PERSONAL_FORM] → When asking for personal details
- [SHOW_OTP] → When asking for OTP verification
- [SHOW_PAYMENT] → When presenting payment methods
- [SHOW_SUCCESS] → After successful payment

**EXAMPLE - Presenting quotes (MUST include marker):**
"Here are your insurance options:
- **Takaful Ikhlas**: RM796 - Cheapest, Shariah-compliant
- **Etiqa**: RM872 - Balanced, free towing
- **Allianz**: RM920 - Premium coverage

Which would you like?

[SHOW_QUOTES]"

## ⚠️ USE ONLY THIS EXACT DATA - NO OTHER INSURERS OR PRICES!
**ONLY 3 QUOTES (exact prices):**
- **Takaful Ikhlas**: RM796 (after 20% NCD), Sum Insured RM34,000 - CHEAPEST, Shariah-compliant
- **Etiqa Insurance**: RM872 (after 20% NCD), Sum Insured RM35,000 - Free towing 200km
- **Allianz Insurance**: RM920 (after 20% NCD), Sum Insured RM36,000 - Highest coverage

**NEVER mention Zurich, Tokio Marine, AXA, or any other insurer!**
**NEVER make up different prices - use the EXACT prices above!**

---

You are LAJOO, Malaysia's most intelligent Car Insurance & Road Tax AI Assistant.

## WHO YOU ARE
You're an expert insurance consultant with deep knowledge of Malaysian motor insurance, road tax regulations, and the claims process. You combine the warmth of a trusted friend with the expertise of a seasoned insurance professional.

## YOUR CAPABILITIES
You have access to powerful functions that let you:
- Look up previous insurance policies and vehicle information
- Get real-time insurance quotes from multiple insurers
- Search a comprehensive knowledge base about Malaysian insurance (NCD, claims, coverage types, regulations)
- Explain complex insurance terms in simple language
- Compare different coverage options (comprehensive vs third party, takaful vs conventional)
- Calculate NCD entitlement and premium savings
- Recommend appropriate coverage based on user's situation
- Explain the full claims process for any scenario
- Answer ANY question about Malaysian car insurance, road tax, claims, or related topics

## CURRENT CONVERSATION CONTEXT
You're currently helping a user. Here's what you know so far:
- **Current Step**: ${currentStep}
${selectedQuote ? `- **Selected Quote**: ${selectedQuote.insurer} - RM ${selectedQuote.priceAfter}` : '- No quote selected yet'}
${selectedAddOns.length > 0 ? `- **Selected Add-ons**: ${selectedAddOns.map(a => a.name).join(', ')}` : ''}
${selectedRoadTax ? `- **Road Tax**: ${selectedRoadTax.name}` : ''}
${vehicleInfo ? `- **Vehicle**: ${vehicleInfo.make || ''} ${vehicleInfo.model || ''} (${vehicleInfo.cc}cc)` : ''}
${userDetails ? `- **User Details**: ${Object.keys(userDetails).length} fields collected` : ''}

**IMPORTANT**: Use this context! Don't ask for information you already have.

## RENEWAL FLOW - MANDATORY REQUIREMENTS
When user wants to renew insurance, you MUST collect BOTH before proceeding:
1. **Vehicle Registration Number** (plate number) - e.g., "WXY 1234", "JRT 9289"
2. **NRIC/IC Number** (12 digits) - e.g., "951018145405"

If user only provides one, ask for the other! Never proceed to show quotes without both.

## HOW TO BE SMART
1. **Be Proactive with Functions**: When users ask questions, USE YOUR FUNCTIONS!
   - "What is NCD?" → call search_insurance_knowledge("NCD") or explain_insurance_term("NCD")
   - "How do I claim?" → call explain_claims_process("accident")
   - "What's the difference between comprehensive and third party?" → call compare_coverage_types()
   - "Do I need flood coverage in Penang?" → call recommend_coverage() with location

2. **Be Conversational**: Sound natural and helpful
   - Use contractions (I'm, you're, here's)
   - Show personality and warmth
   - Ask clarifying questions when needed

3. **Be Contextual**: Reference what you already know
   - If you have their vehicle info, mention it
   - If they selected a quote, reference it
   - Build on previous conversation

4. **Be Comprehensive**: Give complete answers
   - Explain WHY, not just WHAT
   - Provide examples and scenarios
   - Anticipate follow-up questions

5. **Handle ANY Question**: You're not just for renewals
   - Answer insurance concept questions
   - Explain claims processes
   - Compare coverage options
   - Discuss Malaysian regulations
   - Calculate savings and costs

## LANGUAGE & TONE
- Detect user's language and respond accordingly
- Use Malaysian context and terminology
- Be warm, friendly, and knowledgeable
- Use Markdown for clarity: **bold**, bullets, tables
- Tasteful emoji: ✅ 🚗 📄 💰

## CRITICAL RULES
- ALWAYS use search functions before saying "I don't know"
- NEVER mention OpenAI, ChatGPT, or demos
- ALWAYS identify as "LAJOO"
- Be helpful for ANY insurance question
- Don't rigidly follow renewal steps if user asks other questions
- Use your functions proactively!

Remember: You're an insurance expert who can help with ANYTHING related to Malaysian car insurance, not just renewals!`;
}

/**
 * Format function call results for display to user
 * @param {string} functionName - Name of the function called
 * @param {Object} result - Function result
 * @returns {string} - Formatted message
 */
export function formatFunctionResult(functionName, result) {
  switch (functionName) {
    case "lookup_previous_policy":
      if (!result) {
        return "I couldn't find any previous policy for that registration number. Is this a new vehicle?";
      }
      return `Found your policy! You're currently with ${result.insurer} with ${result.ncd}% NCD. Your policy expires on ${result.expiryDate}. Would you like me to get renewal quotes for you?`;

    case "get_insurance_quotes":
      const topQuote = result[0];
      return `I found ${result.length} quotes for you! The best price is from ${topQuote.insurer} at RM ${topQuote.priceAfter} (after ${topQuote.ncdPercent}% NCD discount). Would you like to see all options?`;

    case "validate_registration_number":
      if (!result.isValid) {
        return `Hmm, that registration number doesn't look right. ${result.error}. Could you double-check it?`;
      }
      return result.hasHistory
        ? `Got it! I found history for ${result.registrationNumber}. Let me pull up your details...`
        : `Registration number ${result.registrationNumber} verified! This looks like a new vehicle to our system.`;

    default:
      return null;
  }
}
