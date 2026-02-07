import { NextResponse } from "next/server";
import { AI_FUNCTIONS, getSystemPrompt } from "@/lib/aiFunctions";
import {
  lookupPreviousPolicy,
  getInsuranceQuotes,
  validateRegistrationNumber,
  getAvailableAddOns,
  getRoadTaxOptions,
} from "@/lib/insuranceAPI";
import { searchKnowledgeBase } from "@/lib/knowledgeBase";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
## ⚠️ CRITICAL: UI MARKERS - READ THIS FIRST! ⚠️

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

---

## WHO YOU ARE
You are **LAJOO**, Malaysia's most intelligent Car Insurance & Road Tax AI Assistant. You're an expert insurance consultant with deep knowledge of Malaysian motor insurance, road tax regulations, and the claims process. You combine the warmth of a trusted friend with the expertise of a seasoned insurance professional.

## HOW TO COMMUNICATE - FORMATTING IS MANDATORY!

⚠️ **EVERY response MUST use Markdown formatting. NO EXCEPTIONS!**

**REQUIRED FORMAT FOR ASKING PLATE + IC:**
Always use this exact structure when asking for details:

"To get started with your renewal, I'll need:

1. **Vehicle Plate Number** (e.g., "WXY 1234")
2. **NRIC/IC Number** (12 digits, e.g., "951018145405")

Once you provide these, I can find the best quotes for you! 🚗"

**FORMATTING RULES:**
- **ALWAYS bold key terms**: plate number, IC number, NCD, premium, sum insured, vehicle, etc.
- **ALWAYS use numbered lists (1. 2. 3.)** when asking for multiple pieces of info
- **ALWAYS use bullet points (-)** when showing vehicle details or listing options
- **Add emoji** for warmth: ✅ 🚗 📄 💰 🎉
- **Keep responses structured** - use line breaks between sections

**NEVER write plain paragraphs when a list would be clearer!**

## RENEWAL FLOW - MANDATORY REQUIREMENTS

**Step 1 - Vehicle Details:**
⚠️⚠️⚠️ CRITICAL: You MUST collect BOTH before showing ANY vehicle information:
1. **Vehicle Registration Number** (plate number) - e.g., "WXY 1234", "JRT 9289"
2. **NRIC/IC Number** (12 digits) - e.g., "951018145405"

🚫 **ABSOLUTELY FORBIDDEN** - If user ONLY provides plate number:
- DO NOT show vehicle make/model
- DO NOT show year
- DO NOT show engine capacity
- DO NOT show NCD percentage
- DO NOT show sum insured
- DO NOT mention ANY vehicle details

✅ **CORRECT RESPONSE when only plate is given:**
"Got your plate number **[PLATE]**! 🚗

To pull up your vehicle details and find the best quotes, I'll also need:

1. **NRIC/IC Number** (12 digits, e.g., "951018145405")

Could you please provide it?"

❌ **WRONG - NEVER DO THIS:**
"I found your vehicle: Perodua Myvi 2019..." (WITHOUT IC = WRONG!)

⚠️ You can ONLY show vehicle details AFTER receiving BOTH plate AND IC number!

Once you have BOTH → Show vehicle info → User confirms → Add [SHOW_QUOTES]

**Step 2 - Quotes:**
Present 3 options with clear comparison → User selects one → Add [SHOW_ADDONS]

**Step 3 - Add-ons:**
Present options with recommendations → User confirms → Add [SHOW_ROADTAX]

**Step 4 - Road Tax:**
Present 5 options → User selects → Add [SHOW_PERSONAL_FORM]

**Step 5 onwards:** Personal Details → OTP → Payment → Success

## ⚠️ CRITICAL: USE ONLY THIS EXACT DATA!

**THE ONLY 3 QUOTES (use EXACT prices):**
- **Takaful Ikhlas**: RM796 (after 20% NCD), Sum Insured RM34,000 - CHEAPEST, Shariah-compliant, fast claims
- **Etiqa Insurance**: RM872 (after 20% NCD), Sum Insured RM35,000 - Free towing 200km, balanced choice
- **Allianz Insurance**: RM920 (after 20% NCD), Sum Insured RM36,000 - Highest coverage, premium service

**NEVER mention Zurich, Tokio Marine, AXA, or any other insurer!**

**THE ONLY 2 ADD-ONS:**
- Windscreen Protection: RM100
- Flood & Natural Disaster (Special Perils): RM50

**THE 5 ROAD TAX OPTIONS:**
- 6-Month Digital: RM45 (instant)
- 6-Month Deliver: RM55 (3-5 days)
- 12-Month Digital: RM90 (instant)
- 12-Month Deliver: RM100 (3-5 days)
- No Road Tax: Insurance only

## HANDLING QUESTIONS
If user asks a question mid-flow:
1. Answer thoroughly and helpfully (no marker)
2. **ALWAYS end with a recommendation** - analyze and give your expert opinion
3. Then guide them back: "Ready to continue with your renewal?"
4. Add appropriate marker in NEXT response when they're ready

## 💡 ALWAYS GIVE RECOMMENDATIONS
At the end of EVERY response where the user asks a question or needs guidance, you MUST include a **"My Recommendation"** section:

**Format:**
💡 **My Recommendation:** [Your expert advice based on their situation]

**Examples:**
- User asks "Which insurer is best?" → End with: "💡 **My Recommendation:** For most drivers, I'd suggest **Takaful Ikhlas** at RM796 - it's the cheapest while still offering comprehensive coverage. However, if you frequently travel long distances, **Etiqa's** free 200km towing could save you in emergencies."

- User asks "Do I need flood coverage?" → End with: "💡 **My Recommendation:** Based on your address in Shah Alam, Selangor, I'd recommend the RM50 Special Perils add-on. This area experiences moderate flooding during monsoon season (Nov-Feb). One flood claim could cost thousands - RM50 is cheap insurance!"

- User asks "What is NCD?" → End with: "💡 **My Recommendation:** Protect your NCD! With 20% NCD, you're saving RM199 on your premium. Consider adding Windscreen Protection (RM100) so small claims don't affect your discount."

**Be decisive and helpful** - users want expert guidance, not just information!

## CRITICAL RULES
- NEVER mention OpenAI, ChatGPT, or demos
- ALWAYS identify as "LAJOO"
- Be helpful for ANY insurance question
- Use the EXACT prices above - never invent different prices!
`;

const UI_MARKERS = {
  QUOTES: '[SHOW_QUOTES]',
  ADDONS: '[SHOW_ADDONS]',
  ROADTAX: '[SHOW_ROADTAX]',
  PERSONAL_FORM: '[SHOW_PERSONAL_FORM]',
  OTP: '[SHOW_OTP]',
  PAYMENT: '[SHOW_PAYMENT]',
  SUCCESS: '[SHOW_SUCCESS]'
};

const FALLBACK_NOTICE = "I'm here to help with insurance renewals, claims, or road tax. Could you rephrase your question?";

function getMockQuotes({ vehicle = "Perodua Myvi 1.5 AV", year = 2019, ncd = 20 } = {}) {
  // EXACT fixed prices - must match frontend QUOTE_CARDS and insuranceAPI.js
  return [
    {
      insurer: "Takaful Ikhlas",
      sumInsured: 34000,
      priceBeforeNcd: 995,
      ncdPercent: ncd,
      priceAfterNcd: 796, // EXACT - CHEAPEST
      highlights: [
        "CHEAPEST option - Most affordable premium",
        "Shariah-compliant (Islamic insurance)",
        "Fast claim payout reputation",
        "Sum insured: RM34,000",
        "Great value for money"
      ],
      benefits: "Best for budget-conscious drivers and those seeking Shariah-compliant insurance."
    },
    {
      insurer: "Etiqa Insurance",
      sumInsured: 35000,
      priceBeforeNcd: 1090,
      ncdPercent: ncd,
      priceAfterNcd: 872, // EXACT
      highlights: [
        "Mid-range option with balanced price and coverage",
        "Free towing service up to 200km nationwide",
        "Good customer service ratings",
        "Sum insured: RM35,000 (middle tier)",
        "Well-established local insurer"
      ],
      benefits: "Best for drivers who want a balance between affordability and coverage."
    },
    {
      insurer: "Allianz Insurance",
      sumInsured: 36000,
      priceBeforeNcd: 1150,
      ncdPercent: ncd,
      priceAfterNcd: 920, // EXACT - HIGHEST COVERAGE
      highlights: [
        "HIGHEST sum insured - RM36,000 (best coverage)",
        "Strong international brand with excellent claims network",
        "Premium service quality and support",
        "Windscreen coverage add-on available",
        "Best customer service ratings"
      ],
      benefits: "Best for drivers who prioritize service quality and comprehensive coverage."
    },
  ];
}

function getMockVehicleProfile(plate = "", nricMatch = null) {
  return {
    plate,
    make: "Perodua",
    model: "Myvi 1.5L",
    year: 2019,
    engineCc: 1496,
    sumMin: 51000,
    sumMax: 68000,
    currentInsurer: "Takaful Ikhlas",
    ncdPercent: 55,
    eHailing: false,
    coverType: "Comprehensive (1st Party)",
    modified: false,
    // User's registered address from insurer API
    address: "No. 12, Jalan Setia Prima, Setia Alam, 47000 Shah Alam, Selangor",
    city: "Shah Alam",
    state: "Selangor",
    postcode: "47000",
  };
}

/**
 * Execute AI function calls
 */
async function executeFunction(functionName, args) {
  console.log(`[AI Function Call] ${functionName}`, args);

  switch (functionName) {
    case "lookup_previous_policy":
      return await lookupPreviousPolicy(args.registrationNumber);

    case "get_insurance_quotes":
      return await getInsuranceQuotes({
        vehicleType: args.vehicleType,
        cc: args.cc,
        sumInsured: args.sumInsured,
        ncd: args.ncd || 0
      });

    case "validate_registration_number":
      return await validateRegistrationNumber(args.registrationNumber);

    case "get_available_addons":
      return await getAvailableAddOns(args.insurerId);

    case "get_roadtax_options":
      return await getRoadTaxOptions({ cc: args.cc });

    case "calculate_total_premium":
      const addOnsTotal = (args.addOns || []).reduce((sum, price) => sum + price, 0);
      return {
        basePremium: args.basePremium,
        addOnsTotal,
        roadTax: args.roadTax || 0,
        grandTotal: args.basePremium + addOnsTotal + (args.roadTax || 0)
      };

    case "search_insurance_knowledge":
      const searchResults = searchKnowledgeBase(args.query);
      if (searchResults.length === 0) {
        return {
          found: false,
          message: "I don't have specific information about that in my knowledge base, but I can help you with general insurance questions."
        };
      }
      return {
        found: true,
        results: searchResults.map(r => ({
          question: r.question,
          answer: r.answer,
          category: r.category
        }))
      };

    case "explain_insurance_term":
      const termQuery = args.term.toLowerCase();
      const termResults = searchKnowledgeBase(termQuery);
      if (termResults.length > 0) {
        return {
          term: args.term,
          explanation: termResults[0].answer,
          relatedInfo: termResults.slice(1, 3).map(r => r.question)
        };
      }
      return {
        term: args.term,
        explanation: `I don't have specific information about "${args.term}" in my knowledge base. Please ask me more details and I'll help explain.`
      };

    case "compare_coverage_types":
      const comparison = searchKnowledgeBase(`${args.type1} vs ${args.type2}`);
      if (comparison.length > 0) {
        return {
          comparison: comparison[0].answer,
          type1: args.type1,
          type2: args.type2
        };
      }
      // Fallback comparison
      return {
        type1: args.type1,
        type2: args.type2,
        comparison: `Both ${args.type1} and ${args.type2} are insurance options. Let me search for more specific details.`
      };

    case "explain_claims_process":
      const claimInfo = searchKnowledgeBase(`${args.claimType} claim process`);
      if (claimInfo.length > 0) {
        return {
          claimType: args.claimType,
          process: claimInfo[0].answer,
          requirements: "Police report (if required), claim form, photos, IC, license, policy document"
        };
      }
      return {
        claimType: args.claimType,
        process: "Standard claim process: 1) Report to insurer, 2) Submit documents, 3) Vehicle inspection, 4) Repair approval, 5) Claim settlement"
      };

    case "calculate_ncd_entitlement":
      const ncdLevels = {
        0: 0,
        1: 25,
        2: 30,
        3: 38.33,
        4: 45,
        5: 55
      };
      const years = Math.min(args.yearsNoClaims, 5);
      const entitlement = ncdLevels[years] || 55;
      return {
        yearsNoClaims: args.yearsNoClaims,
        ncdEntitlement: entitlement,
        nextLevel: years < 5 ? ncdLevels[years + 1] : 55,
        maxNCD: 55,
        explanation: `With ${args.yearsNoClaims} year(s) of no claims, you're entitled to ${entitlement}% NCD.${years < 5 ? ` One more year without claims will get you ${ncdLevels[years + 1]}% NCD.` : ' You\'re at maximum NCD!'}`
      };

    case "recommend_coverage":
      const recommendations = [];

      // Base coverage
      if (args.carValue > 30000) {
        recommendations.push({
          type: "Comprehensive Coverage",
          reason: "Your car value is significant (RM" + args.carValue.toLocaleString() + "), comprehensive coverage protects your investment",
          priority: "Essential"
        });
      }

      // Flood coverage
      const floodProneAreas = ['penang', 'kelantan', 'pahang', 'terengganu', 'johor', 'selangor'];
      if (args.location && floodProneAreas.some(area => args.location.toLowerCase().includes(area))) {
        recommendations.push({
          type: "Flood Coverage (Special Perils)",
          reason: `${args.location} is prone to flooding during monsoon season`,
          priority: "Highly Recommended"
        });
      }

      // Windscreen
      if (args.usage === "daily commute" || args.usage === "business") {
        recommendations.push({
          type: "Windscreen Protection",
          reason: "Frequent driving increases risk of windscreen damage from road debris",
          priority: "Recommended"
        });
      }

      return {
        carValue: args.carValue,
        location: args.location,
        usage: args.usage,
        recommendations
      };

    case "estimate_premium_savings":
      const baseAmount = args.basePremium;
      const ncd = args.ncdPercent || 0;
      const savingsAmount = Math.round(baseAmount * (ncd / 100));
      const finalPremium = baseAmount - savingsAmount;

      const result = {
        basePremium: baseAmount,
        ncdPercent: ncd,
        savingsAmount,
        finalPremium,
        breakdown: `Base Premium: RM${baseAmount} - NCD (${ncd}%): RM${savingsAmount} = Final Premium: RM${finalPremium}`
      };

      if (args.compareScenarios) {
        result.scenarios = [
          { ncd: 25, savings: Math.round(baseAmount * 0.25), final: Math.round(baseAmount * 0.75) },
          { ncd: 30, savings: Math.round(baseAmount * 0.30), final: Math.round(baseAmount * 0.70) },
          { ncd: 45, savings: Math.round(baseAmount * 0.45), final: Math.round(baseAmount * 0.55) },
          { ncd: 55, savings: Math.round(baseAmount * 0.55), final: Math.round(baseAmount * 0.45) }
        ];
      }

      return result;

    case "check_renewal_eligibility":
      const today = new Date();
      const expiryDate = args.policyExpiryDate ? new Date(args.policyExpiryDate) : null;

      if (!expiryDate) {
        return {
          eligible: true,
          message: "You can renew your insurance anytime. Best to start 30-60 days before expiry."
        };
      }

      const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)) : null;
      const isExpired = daysUntilExpiry < 0;
      const canRenew = daysUntilExpiry <= 60;

      return {
        eligible: true,
        expiryDate: args.policyExpiryDate,
        daysUntilExpiry: Math.abs(daysUntilExpiry),
        isExpired,
        canRenew,
        message: isExpired
          ? `Your policy expired ${Math.abs(daysUntilExpiry)} days ago. You can still renew but may need vehicle inspection.`
          : canRenew
          ? `Your policy expires in ${daysUntilExpiry} days. Great time to renew and compare quotes!`
          : `Your policy expires in ${daysUntilExpiry} days. You can start comparing quotes now.`,
        hasActiveClaims: args.hasActiveClaims || false,
        claimsWarning: args.hasActiveClaims ? "Note: Active claims may affect your renewal and NCD." : null
      };

    default:
      return { error: `Unknown function: ${functionName}` };
  }
}

/**
 * POST /api/chat
 * Hybrid: Original step-by-step flow + Smart AI with function calling
 */
export async function POST(request) {
  try {
    const { messages, context = {} } = await request.json();
    const latestMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";
    const plateRegex = /[a-z]{1,3}\s?\d{3,4}/i;
    const nricRegex = /\b\d{6}\b|\b\d{12}\b/;

    // Initialize plateNumber and NRIC
    let plateNumber = null;
    let nricNumber = null;

    // Check if user just provided plate and/or NRIC in latest message
    const justProvidedPlate = plateRegex.test(latestMessage);
    const justProvidedNric = nricRegex.test(latestMessage);
    const justProvidedPlateAndNric = justProvidedPlate && justProvidedNric;

    // Extract NRIC from USER messages only (not AI examples)
    for (const msg of messages) {
      if (msg.role !== "user") continue; // Skip AI messages - they contain examples like "951018145405"
      const nricMatch = /\b(\d{12})\b/.exec(msg.content);
      if (nricMatch) {
        nricNumber = nricMatch[1];
        break;
      }
    }
    // Include common typos: takafl, takful for Takaful; etika for Etiqa
    const quoteSelectionRegex = /\b(takaful|takafl|takful|ikhlas|etiqa|etika|allianz|alianz)\b/i;

    // Check if quotes have been shown (using marker-based detection)
    const hasQuotesBeenShown = messages.some(
      (msg) => msg.role === "assistant" && msg.content?.includes("[SHOW_QUOTES]")
    );

    // Check if add-ons have been shown
    const hasAddOnsBeenShown = messages.some(
      (msg) => msg.role === "assistant" && msg.content?.includes("[SHOW_ADDONS]")
    );

    // Check if road tax options have been shown
    const hasRoadTaxBeenShown = messages.some(
      (msg) => msg.role === "assistant" && msg.content?.includes("[SHOW_ROADTAX]")
    );

    // Check if user is asking a question or discussing (not selecting)
    const isDiscussingOrAsking = /\b(which|what|why|how|best|better|recommend|compare|difference|should|explain|choose|maybe|but|or|between|think|famous|popular|good|bad|cheap|expensive|worth|value)\b/i.test(latestMessage)
                                  && hasQuotesBeenShown;

    // Check if user is EXPLICITLY selecting (clear intent words)
    const hasExplicitSelectionIntent = /\b(i('ll| will|'d| would)?\s*(go|choose|pick|select|take|want)|go with|choose|select|pick|i want|let's go|proceed with)\b/i.test(latestMessage);

    // User selected a quote ONLY if:
    // 1. They mentioned an insurer name AND
    // 2. Quotes have been shown AND
    // 3. They're NOT discussing/asking questions AND
    // 4. EITHER they have explicit selection intent OR the message is just the insurer name (short message)
    const isShortMessage = latestMessage.trim().split(/\s+/).length <= 3; // e.g., "takaful", "etiqa please", "go with allianz"
    const userSelectedQuote = quoteSelectionRegex.test(latestMessage)
                              && hasQuotesBeenShown
                              && !isDiscussingOrAsking
                              && (hasExplicitSelectionIntent || isShortMessage);

    // Debug logging
    console.log('=== SMART AI DEBUG ===');
    console.log('latestMessage:', latestMessage);
    console.log('hasQuotesBeenShown:', hasQuotesBeenShown);
    console.log('hasAddOnsBeenShown:', hasAddOnsBeenShown);
    console.log('hasRoadTaxBeenShown:', hasRoadTaxBeenShown);
    console.log('userSelectedQuote:', userSelectedQuote);
    console.log('======================');

    // Check if user selected payment method
    const hasPaymentBeenShown = messages.some(
      (msg) => msg.role === "assistant" && msg.content?.includes("[SHOW_PAYMENT]")
    );
    const paymentMethodRegex = /\b(card|fpx|wallet|instalment|atome|pay later)\b/i;
    const userSelectedPayment = hasPaymentBeenShown && paymentMethodRegex.test(latestMessage);

    // Extract plate number from USER messages only (not AI examples)
    for (const msg of messages) {
      if (msg.role !== "user") continue; // Skip AI messages - they contain examples like "WXY 1234"
      const match = plateRegex.exec(msg.content);
      if (match) {
        plateNumber = match[0].toUpperCase();
        break;
      }
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "Missing messages array." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o";

    // Build system prompt with context
    const systemPrompt = context && Object.keys(context).length > 0
      ? getSystemPrompt(context)
      : SYSTEM_PROMPT;

    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: String(msg.content || ""),
      })),
    ];

    // Extract plate number from latest message if not already found
    if (!plateNumber) {
      const plateMatch = plateRegex.exec(latestMessage);
      plateNumber = plateMatch ? plateMatch[0].toUpperCase() : null;
    }

    // Determine current flow state by checking for markers in conversation history
    const hasShownQuotes = messages.some(m => m.role === "assistant" && m.content?.includes('[SHOW_QUOTES]'));
    const hasShownAddons = messages.some(m => m.role === "assistant" && m.content?.includes('[SHOW_ADDONS]'));
    const hasShownRoadtax = messages.some(m => m.role === "assistant" && m.content?.includes('[SHOW_ROADTAX]'));
    const hasShownPersonalForm = messages.some(m => m.role === "assistant" && m.content?.includes('[SHOW_PERSONAL_FORM]'));
    const hasShownOTP = messages.some(m => m.role === "assistant" && m.content?.includes('[SHOW_OTP]'));
    const hasShownPayment = messages.some(m => m.role === "assistant" && m.content?.includes('[SHOW_PAYMENT]'));
    const hasShownSuccess = messages.some(m => m.role === "assistant" && m.content?.includes('[SHOW_SUCCESS]'));

    // Determine current step
    let currentStep = "start";
    if (hasShownSuccess) currentStep = "completed";
    else if (hasShownPayment) currentStep = "payment";
    else if (hasShownOTP) currentStep = "otp";
    else if (hasShownPersonalForm) currentStep = "personal_details";
    else if (hasShownRoadtax) currentStep = "roadtax";
    else if (hasShownAddons) currentStep = "addons";
    else if (hasShownQuotes) currentStep = "quotes";
    else if (plateNumber) currentStep = "vehicle_lookup";

    // Provide context about current state
    // IMPORTANT: Only load vehicle profile when we have BOTH plate AND IC!
    // This prevents AI from showing vehicle details before IC is provided
    let mockProfile = null;
    if (plateNumber && nricNumber) {
      mockProfile = getMockVehicleProfile(plateNumber);
    }

    // Check if user is confirming vehicle details
    const isUserConfirming = /\b(yes|correct|confirm|ok|okay|ya|betul|proceed|looks good|that's right)\b/i.test(latestMessage);

    // Check if user is asking a question (at any step)
    const isAskingQuestion = /\?|do i need|should i|what is|what's|how does|explain|tell me|why|which one|recommend|need this|need these|worth it|necessary/i.test(latestMessage);

    // Determine if we have both required pieces of info
    const hasBothPlateAndNric = plateNumber && nricNumber;
    const hasOnlyPlate = plateNumber && !nricNumber;
    const hasOnlyNric = !plateNumber && nricNumber;

    // Log AFTER all variables are defined
    console.log('=== SMART AI CONTEXT ===');
    console.log('Current Step:', currentStep);
    console.log('Plate Number:', plateNumber);
    console.log('NRIC Number:', nricNumber);
    console.log('Has Both Plate AND IC:', hasBothPlateAndNric);
    console.log('Has Only Plate (missing IC):', hasOnlyPlate);
    console.log('Is User Confirming:', isUserConfirming);
    console.log('Is Asking Question:', isAskingQuestion);
    console.log('Latest Message:', latestMessage);
    console.log('========================');

    // Add flow context for AI to understand where we are
    // IMPORTANT: Only show vehicle details when we have BOTH plate AND IC!
    const flowContext = `
## CURRENT STATE
- **Current Step**: ${currentStep}
- **Plate Number**: ${plateNumber || '❌ Not provided yet'}
- **NRIC/IC Number**: ${nricNumber || '❌ Not provided yet'}
${hasBothPlateAndNric && mockProfile ? `
✅ **VERIFIED - Both plate and IC provided! Show this vehicle info to user using bullet points:**

Great! Here's what I've found based on the details provided:

- **Car Plate**: ${plateNumber}
- **Owner NRIC/IC**: ${nricNumber.slice(0,6)}-${nricNumber.slice(6,8)}-${nricNumber.slice(8)}
- **E-hailing**: ${mockProfile.eHailing ? 'Yes' : 'No'}
- **Car Model**: ${mockProfile.make} ${mockProfile.model} ${mockProfile.year}
- **Cover Type**: ${mockProfile.coverType}
- **Market Value**: RM ${mockProfile.sumMin.toLocaleString()} - RM ${mockProfile.sumMax.toLocaleString()}
- **Postcode**: ${mockProfile.postcode}
- **NCD**: ${mockProfile.ncdPercent}%

End with: "Does this look correct? ✅"

💡 **Location Intelligence**: ${mockProfile.city}/${mockProfile.state} - consider recommending flood coverage during monsoon season (Nov-Feb).` : ''}

## ⚠️ ACTION REQUIRED - WHAT TO DO NOW:
${currentStep === "start" ? `⚠️ MANDATORY: Ask for BOTH plate number AND IC number. Example: "To get started, please provide your vehicle plate number and IC number (12 digits)."` : ''}
${currentStep === "vehicle_lookup" && hasOnlyPlate ? `
🚫🚫🚫 CRITICAL VIOLATION WARNING: IC NUMBER IS MISSING! 🚫🚫🚫

User provided plate number "${plateNumber}" but NO IC NUMBER!

YOU MUST NOT:
❌ Show vehicle make/model (e.g., "Perodua Myvi")
❌ Show vehicle year (e.g., "2019")
❌ Show engine capacity (e.g., "1496cc")
❌ Show NCD percentage (e.g., "20%")
❌ Show sum insured range
❌ Mention ANY vehicle information

YOUR ONLY ALLOWED RESPONSE:
"Got your plate number **${plateNumber}**! 🚗

To pull up your vehicle details and find the best quotes, I'll also need:

1. **NRIC/IC Number** (12 digits, e.g., "951018145405")

Could you please provide it?"

DO NOT DEVIATE FROM THIS! NO VEHICLE DETAILS WITHOUT IC!` : ''}
${currentStep === "vehicle_lookup" && hasOnlyNric ? `⚠️ User provided IC but NOT plate number. Ask for their plate number: "Thanks! I also need your vehicle registration number to proceed."` : ''}
${currentStep === "vehicle_lookup" && hasBothPlateAndNric && justProvidedPlateAndNric ? `✅ Got both plate and IC! Show vehicle details and ask user to confirm.` : ''}
${currentStep === "vehicle_lookup" && hasBothPlateAndNric && !justProvidedPlateAndNric && isUserConfirming ? `
⚠️ USER CONFIRMED! Present quotes NOW and ADD [SHOW_QUOTES] at the end!

Your response MUST end with:
[SHOW_QUOTES]` : ''}
${currentStep === "vehicle_lookup" && !hasBothPlateAndNric && isUserConfirming ? `
⚠️ CRITICAL: User said "ok" or confirmed BUT IC NUMBER IS MISSING!
DO NOT proceed to quotes! You MUST ask for their IC number first.
Say something like: "Before I can show you quotes, I'll need your IC number (12 digits) to verify ownership. Could you please provide it?"
DO NOT add [SHOW_QUOTES] marker until you have both plate AND IC!` : ''}
${currentStep === "vehicle_lookup" && !justProvidedPlateAndNric && !isUserConfirming && hasBothPlateAndNric ? `Show vehicle details and ask user to confirm.` : ''}
${currentStep === "vehicle_lookup" && !justProvidedPlateAndNric && !isUserConfirming && !hasBothPlateAndNric ? `Ask for the missing info (plate or IC number).` : ''}
${currentStep === "quotes" && userSelectedQuote ? `
⚠️ USER SELECTED A QUOTE! Present add-ons NOW and ADD [SHOW_ADDONS] at the end!

Your response MUST end with:
[SHOW_ADDONS]` : ''}
${currentStep === "quotes" && !userSelectedQuote ? `Wait for user to select a quote (takaful/etiqa/allianz). If they ask questions, just answer.` : ''}
${currentStep === "addons" && isAskingQuestion ? `
⚠️ USER IS ASKING A QUESTION ABOUT ADD-ONS! Answer it thoroughly!

**If asking "do i need these?" or about flood/windscreen:**
Explain the benefits based on their location (${mockProfile?.city || 'their area'}):

**Windscreen Protection (RM100):**
- Covers windscreen cracks/chips without affecting NCD
- Common issue on Malaysian highways (debris, gravel trucks)
- Without this, a RM500+ windscreen repair would affect your NCD

**Flood & Natural Disaster - Special Perils (RM50):**
- Essential if you live in flood-prone areas
- ${mockProfile?.state === 'Selangor' ? 'Shah Alam/Selangor experiences moderate flooding during monsoon (Nov-Feb)' : 'Consider your area\'s flood risk'}
- One flood claim can cost RM10,000+ in repairs

💡 **End with your recommendation based on their situation!**

DO NOT add [SHOW_ROADTAX] marker - wait for them to confirm add-on selections.` : ''}
${currentStep === "addons" && !isAskingQuestion ? `When user confirms add-ons (says "ok", "yes", "proceed", "both", "just windscreen", etc.), present road tax options and ADD [SHOW_ROADTAX] at the end.` : ''}
${currentStep === "roadtax" ? `When user selects road tax, ask for personal details and ADD [SHOW_PERSONAL_FORM] at the end.` : ''}
${currentStep === "personal_details" ? `When user provides email/phone/address, request OTP verification and ADD [SHOW_OTP] at the end.` : ''}
${currentStep === "otp" ? `When user enters 4-digit OTP, present payment options and ADD [SHOW_PAYMENT] at the end.` : ''}
${currentStep === "payment" ? `When user selects payment method, show success and ADD [SHOW_SUCCESS] at the end.` : ''}

## ⚠️ USE ONLY THIS EXACT DATA - NO OTHER INSURERS OR PRICES!
**ONLY 3 QUOTES (exact prices):**
- **Etiqa Insurance**: RM872, Sum Insured RM35,000, free towing
- **Takaful Ikhlas**: RM796, Sum Insured RM34,000, Shariah-compliant, CHEAPEST
- **Allianz Insurance**: RM920, Sum Insured RM36,000, highest coverage

**ONLY 2 ADD-ONS:** Windscreen RM100, Flood RM50
**ONLY 5 ROAD TAX OPTIONS:** 6-Month Digital RM45, 6-Month Deliver RM55, 12-Month Digital RM90, 12-Month Deliver RM100, No Road Tax

⚠️ NEVER mention Zurich, Tokio Marine, AXA, or any other insurer! ONLY Etiqa, Takaful Ikhlas, and Allianz!
⚠️ When presenting options, your response MUST end with the appropriate marker on its own line!
`;

    openAiMessages.push({
      role: "system",
      content: flowContext
    });

    if (userSelectedPayment) {
      openAiMessages.push({
        role: "system",
        content: `Context: User selected payment method. Congratulate them! Let them know:
- Payment successful
- Policy processed and active
- Documents sent to email and WhatsApp
- Policy ready for download
- Optionally ask for a Google review

Be warm and congratulatory!`,
      });
    }

    // Call OpenAI with function calling support
    const MAX_ITERATIONS = 5;
    let iteration = 0;
    let fullResponse = "";
    let functionCallsLog = [];

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      // Debug: Log what messages we're sending to OpenAI
      if (iteration === 1) {
        console.log('📤 Messages being sent to OpenAI:');
        console.log('Total messages:', openAiMessages.length);
        console.log('Last 3 messages:', openAiMessages.slice(-3).map(m => ({
          role: m.role,
          contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) + '...' : 'N/A'
        })));
      }

      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: openAiMessages,
          functions: AI_FUNCTIONS,
          function_call: "auto",
          temperature: 0.8,
        }),
      });

      if (!completion.ok) {
        const errorText = await completion.text();
        console.error("=== OPENAI API ERROR ===");
        console.error("Status:", completion.status);
        console.error("Status Text:", completion.statusText);
        console.error("Error Response:", errorText);
        console.error("========================");
        throw new Error(`OpenAI API failed (${completion.status}): ${errorText}`);
      }

      const data = await completion.json();
      const choice = data.choices[0];
      const message = choice.message;

      openAiMessages.push(message);

      if (message.function_call) {
        const functionName = message.function_call.name;
        const functionArgs = JSON.parse(message.function_call.arguments);

        const functionResult = await executeFunction(functionName, functionArgs);

        functionCallsLog.push({
          function: functionName,
          arguments: functionArgs,
          result: functionResult
        });

        openAiMessages.push({
          role: "function",
          name: functionName,
          content: JSON.stringify(functionResult),
        });

        continue;
      }

      if (message.content) {
        fullResponse = message.content;

        // Debug: Log AI's response preview
        console.log('🤖 AI Response (first 200 chars):', message.content.substring(0, 200));

        // FALLBACK: If AI didn't include markers when it should have, inject them
        const hasAnyMarker = fullResponse.includes('[SHOW_');

        // Detect if AI response indicates a quote was selected (even with typos in user message)
        const aiAcknowledgedQuoteSelection = /you('ve| have)?\s*(selected|chosen|picked|decided|going with)/i.test(fullResponse)
          && /takaful|etiqa|allianz/i.test(fullResponse);

        // Detect if AI response is presenting add-ons
        const aiPresentingAddOns = /add-?on|windscreen|flood|special perils/i.test(fullResponse)
          && /RM\s*100|RM\s*50/i.test(fullResponse)
          && currentStep === "quotes";

        // Detect if AI response is presenting road tax options
        const aiPresentingRoadTax = /road\s*tax/i.test(fullResponse)
          && /6.*month|12.*month|digital|deliver/i.test(fullResponse)
          && (currentStep === "addons" || hasAddOnsBeenShown);

        if (!hasAnyMarker) {
          // User confirmed vehicle, should show quotes - BUT ONLY if we have BOTH plate AND IC
          if (currentStep === "vehicle_lookup" && isUserConfirming && hasBothPlateAndNric) {
            console.log('⚡ FALLBACK: Injecting [SHOW_QUOTES] marker (has both plate and IC)');
            fullResponse += '\n\n[SHOW_QUOTES]';
          }
          // User trying to confirm but missing IC - do NOT inject quotes, AI should ask for IC
          else if (currentStep === "vehicle_lookup" && isUserConfirming && !hasBothPlateAndNric) {
            console.log('⚠️ User confirmed but missing IC number - NOT injecting [SHOW_QUOTES]');
            // Don't inject marker - let AI ask for the missing info
          }
          // User selected a quote (detected from user message OR AI acknowledgment), should show add-ons
          else if (currentStep === "quotes" && (userSelectedQuote || aiAcknowledgedQuoteSelection)) {
            console.log('⚡ FALLBACK: Injecting [SHOW_ADDONS] marker (quote selected)');
            fullResponse += '\n\n[SHOW_ADDONS]';
          }
          // AI is presenting add-ons after quote selection
          else if (aiPresentingAddOns) {
            console.log('⚡ FALLBACK: Injecting [SHOW_ADDONS] marker (AI presenting add-ons)');
            fullResponse += '\n\n[SHOW_ADDONS]';
          }
          // User confirmed add-ons OR AI is presenting road tax options
          // BUT NOT if user is asking a question about add-ons
          else if (((currentStep === "addons" && isUserConfirming) || aiPresentingRoadTax) && !isAskingQuestion) {
            console.log('⚡ FALLBACK: Injecting [SHOW_ROADTAX] marker');
            fullResponse += '\n\n[SHOW_ROADTAX]';
          }
          // User selected road tax, should show personal form
          else if (currentStep === "roadtax" && isUserConfirming) {
            console.log('⚡ FALLBACK: Injecting [SHOW_PERSONAL_FORM] marker');
            fullResponse += '\n\n[SHOW_PERSONAL_FORM]';
          }
          // User submitted personal details (has email), should show OTP
          else if (currentStep === "personal_details" && /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(latestMessage)) {
            console.log('⚡ FALLBACK: Injecting [SHOW_OTP] marker');
            fullResponse += '\n\n[SHOW_OTP]';
          }
          // User entered OTP (4 digits), should show payment
          else if (currentStep === "otp" && /^\d{4}$/.test(latestMessage.trim())) {
            console.log('⚡ FALLBACK: Injecting [SHOW_PAYMENT] marker');
            fullResponse += '\n\n[SHOW_PAYMENT]';
          }
          // User selected payment, should show success
          else if (currentStep === "payment" && userSelectedPayment) {
            console.log('⚡ FALLBACK: Injecting [SHOW_SUCCESS] marker');
            fullResponse += '\n\n[SHOW_SUCCESS]';
          }
        }
      }

      break;
    }

    // If no function-based response, fallback to streaming
    if (!fullResponse) {
      const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.3,
          messages: openAiMessages,
        }),
      });

      if (!upstream.ok || !upstream.body) {
        console.error("OpenAI API error", await upstream.text());
        return NextResponse.json({ error: "Failed to contact LAJOO." }, { status: 502 });
      }

      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Detect if user selected a quote and determine which one
    let selectedQuoteData = null;
    if (userSelectedQuote) {
      const quoteLower = latestMessage.toLowerCase();
      const mockQuotes = getMockQuotes({ ncd: mockProfile?.ncdPercent || 20 });

      // Check if this is a question or discussion (not a clear selection)
      const isQuestionOrDiscussion = quoteLower.includes('?') ||
                        quoteLower.includes('what about') ||
                        quoteLower.includes('how about') ||
                        quoteLower.includes('which') ||
                        quoteLower.includes('or ') ||
                        quoteLower.includes('compare') ||
                        quoteLower.includes('difference') ||
                        quoteLower.includes('better') ||
                        quoteLower.includes('best') ||
                        quoteLower.includes('maybe') ||
                        quoteLower.includes('but ') ||
                        quoteLower.includes('famous') ||
                        quoteLower.includes('popular') ||
                        quoteLower.includes('think') ||
                        quoteLower.includes('worth') ||
                        quoteLower.includes('value') ||
                        quoteLower.includes('between');

      // Only auto-select if it's NOT a question/discussion
      if (!isQuestionOrDiscussion) {
        // Match Takaful with common typos: takafl, takful, takaful, ikhlas
        if (quoteLower.includes('takaful') || quoteLower.includes('takafl') || quoteLower.includes('takful') || quoteLower.includes('ikhlas')) {
          const takafulQuote = mockQuotes.find(q => q.insurer.includes('Takaful'));
          if (takafulQuote) {
            selectedQuoteData = {
              id: "ikhlas-1",
              insurer: takafulQuote.insurer,
              sumInsured: takafulQuote.sumInsured,
              cover: "Full Cover",
              priceBefore: takafulQuote.priceBeforeNcd,
              ncdPercent: takafulQuote.ncdPercent,
              priceAfter: takafulQuote.priceAfterNcd,
              logoUrl: "/partners/takaful.svg",
            };
          }
        // Match Etiqa with common typos: etika, etiqa
        } else if (quoteLower.includes('etiqa') || quoteLower.includes('etika')) {
          const etiqaQuote = mockQuotes.find(q => q.insurer.includes('Etiqa'));
          if (etiqaQuote) {
            selectedQuoteData = {
              id: "etiqa-1",
              insurer: etiqaQuote.insurer,
              sumInsured: etiqaQuote.sumInsured,
              cover: "Full Cover",
              priceBefore: etiqaQuote.priceBeforeNcd,
              ncdPercent: etiqaQuote.ncdPercent,
              priceAfter: etiqaQuote.priceAfterNcd,
              logoUrl: "/partners/etiqa.svg",
            };
          }
        // Match Allianz with common typos: alianz, allianz
        } else if (quoteLower.includes('allianz') || quoteLower.includes('alianz')) {
          const allianzQuote = mockQuotes.find(q => q.insurer.includes('Allianz'));
          if (allianzQuote) {
            selectedQuoteData = {
              id: "allianz-1",
              insurer: allianzQuote.insurer,
              sumInsured: allianzQuote.sumInsured,
              cover: "Full Cover",
              priceBefore: allianzQuote.priceBeforeNcd,
              ncdPercent: allianzQuote.ncdPercent,
              priceAfter: allianzQuote.priceAfterNcd,
              logoUrl: "/partners/allianz.svg",
            };
          }
        }
      }
    }

    // Detect if user selected add-ons and determine which ones
    let selectedAddOnsData = null;
    if (hasAddOnsBeenShown) {
      const messageLower = latestMessage.toLowerCase();
      const selectedAddOns = [];

      // Check for windscreen
      if (messageLower.includes('windscreen')) {
        selectedAddOns.push({
          id: "windscreen",
          name: "Windscreen Protection",
          price: 100,
        });
      }

      // Check for flood
      if (messageLower.includes('flood') || messageLower.includes('disaster') || messageLower.includes('perils')) {
        selectedAddOns.push({
          id: "flood",
          name: "Flood & Natural Disaster (Special Perils)",
          price: 50,
        });
      }

      if (selectedAddOns.length > 0) {
        selectedAddOnsData = selectedAddOns;
      }
    }

    // Detect if user selected road tax option and determine which one
    let selectedRoadTaxData = null;
    if (hasRoadTaxBeenShown) {
      const messageLower = latestMessage.toLowerCase();

      // Check for 6-month delivery option
      if ((messageLower.includes('6') || messageLower.includes('six')) && (messageLower.includes('deliver') || messageLower.includes('physical'))) {
        selectedRoadTaxData = {
          id: "6month-deliver",
          name: "6-Month (Deliver to Me)",
          features: ["Digital road tax MYJPJ (Instant)", "Physical road tax sticker (3-5 business days)"],
          price: 55,
          displayPrice: "RM 45 + RM 10 delivery",
        };
      }
      // Check for 6-month digital option
      else if ((messageLower.includes('6') || messageLower.includes('six')) && messageLower.includes('digital')) {
        selectedRoadTaxData = {
          id: "6month-digital",
          name: "6-Month (Digital Only)",
          features: ["Digital road tax MYJPJ (Instant)"],
          price: 45,
          displayPrice: "RM 45",
        };
      }
      // Check for 12-month delivery option
      else if ((messageLower.includes('12') || messageLower.includes('twelve') || messageLower.includes('year')) && (messageLower.includes('deliver') || messageLower.includes('physical'))) {
        selectedRoadTaxData = {
          id: "12month-deliver",
          name: "12-Month (Deliver to Me)",
          features: ["Digital road tax MYJPJ (Instant)", "Physical road tax sticker (3-5 business days)"],
          price: 100,
          displayPrice: "RM 90 + RM 10 delivery",
        };
      }
      // Check for 12-month digital option
      else if ((messageLower.includes('12') || messageLower.includes('twelve') || messageLower.includes('year')) && messageLower.includes('digital')) {
        selectedRoadTaxData = {
          id: "12month-digital",
          name: "12-Month (Digital Only)",
          features: ["Digital road tax MYJPJ (Instant)"],
          price: 90,
          displayPrice: "RM 90",
        };
      }
      // Check for no road tax option
      else if (messageLower.includes('no road tax') || messageLower.includes('just insurance') || messageLower.includes('insurance only') || messageLower.includes('skip')) {
        selectedRoadTaxData = {
          id: "no",
          name: "No Road Tax Renewal",
          features: ["Insurance renewal only"],
          price: null,
          displayPrice: null,
        };
      }
    }

    // Stream the function-based response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send quote selection event if a quote was selected
        if (selectedQuoteData) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "quote_selected",
                quote: selectedQuoteData
              })}\n\n`
            )
          );
        }

        // Send add-ons selection event if add-ons were selected
        if (selectedAddOnsData) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "addons_selected",
                addons: selectedAddOnsData
              })}\n\n`
            )
          );
        }

        // Send road tax selection event if road tax was selected
        if (selectedRoadTaxData) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "roadtax_selected",
                roadtax: selectedRoadTaxData
              })}\n\n`
            )
          );
        }

        if (functionCallsLog.length > 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "function_calls",
                calls: functionCallsLog
              })}\n\n`
            )
          );
        }

        const words = fullResponse.split(' ');
        words.forEach((word, index) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "chunk",
                content: (index > 0 ? ' ' : '') + word
              })}\n\n`
            )
          );
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              reply: fullResponse.trim(),
              functionCalls: functionCallsLog
            })}\n\n`
          )
        );

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("=== CHAT ROUTE ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("========================");

    // Return SSE-formatted error instead of JSON to work with streaming frontend
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: error.message || "Internal server error. Please check your OpenAI API key." })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
}
