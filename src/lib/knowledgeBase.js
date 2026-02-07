/**
 * Insurance Knowledge Base
 * Comprehensive FAQ and information about Malaysian car insurance
 */

export const INSURANCE_KNOWLEDGE_BASE = [
  // NCD (No Claims Discount)
  {
    id: "ncd-basics",
    category: "NCD",
    question: "What is NCD (No Claims Discount)?",
    answer: "NCD stands for No Claims Discount. It's a reward system where you get a discount on your car insurance premium if you don't make any claims during your policy period. In Malaysia, NCD can go up to 55% discount. For example, if your base premium is RM1000 and you have 20% NCD, you only pay RM800.",
    keywords: ["ncd", "no claims discount", "discount", "premium reduction"]
  },
  {
    id: "ncd-accumulation",
    category: "NCD",
    question: "How does NCD accumulate?",
    answer: "NCD accumulates annually when you don't make claims:\n- Year 1 (no claims): 25% NCD\n- Year 2 (no claims): 30% NCD\n- Year 3 (no claims): 38.33% NCD\n- Year 4 (no claims): 45% NCD\n- Year 5+ (no claims): 55% NCD (maximum)\n\nIf you make a claim, your NCD typically drops by one level or resets depending on the claim type.",
    keywords: ["ncd accumulation", "build ncd", "increase ncd", "ncd levels"]
  },
  {
    id: "ncd-transfer",
    category: "NCD",
    question: "Can I transfer my NCD to a new car?",
    answer: "Yes! In Malaysia, your NCD is tied to you as the owner, not the vehicle. When you buy a new car or transfer ownership, you can transfer your NCD entitlement to the new vehicle. You'll need to provide proof of your previous NCD (your last insurance policy document).",
    keywords: ["transfer ncd", "new car ncd", "change car", "ncd portability"]
  },
  {
    id: "ncd-protected",
    category: "NCD",
    question: "What is NCD Protection and is it worth it?",
    answer: "NCD Protection is an add-on that allows you to make one or more claims without losing your NCD discount. It typically costs RM50-150 extra per year. It's worth it if:\n- You have high NCD (45-55%)\n- You drive in high-risk areas\n- You want peace of mind\n\nFor example, if you have 55% NCD on a RM2000 premium, you save RM1100/year. Losing it would cost you significantly more than the protection premium.",
    keywords: ["ncd protection", "protect ncd", "maintain ncd", "ncd add-on"]
  },

  // Coverage Types
  {
    id: "comprehensive-vs-third-party",
    category: "Coverage",
    question: "What's the difference between Comprehensive and Third Party insurance?",
    answer: "**Comprehensive Insurance:**\n- Covers damage to YOUR car (accidents, theft, fire, etc.)\n- Covers damage to OTHER people's property\n- Covers injury to other people\n- Most expensive but best protection\n\n**Third Party Insurance:**\n- Only covers damage to OTHER people's property\n- Only covers injury to other people\n- Does NOT cover your own car damage\n- Cheapest option, legally acceptable\n\n**Third Party, Fire & Theft:**\n- Same as Third Party PLUS\n- Covers your car if stolen or damaged by fire\n- Middle option in terms of price",
    keywords: ["comprehensive", "third party", "coverage type", "insurance type", "difference"]
  },
  {
    id: "sum-insured",
    category: "Coverage",
    question: "What is Sum Insured and how do I choose it?",
    answer: "Sum Insured is the maximum amount your insurer will pay if your car is totally damaged or stolen. It should reflect your car's current market value.\n\n**How to determine:**\n- New cars: Purchase price\n- Used cars: Current market value (check car valuation sites)\n- Rule of thumb: Check similar cars on used car websites\n\n**Important:** If you under-insure (sum insured too low), you're under-protected. If you over-insure (too high), you pay higher premiums but won't get more than market value in claims.",
    keywords: ["sum insured", "market value", "car value", "insured amount"]
  },
  {
    id: "takaful-vs-conventional",
    category: "Coverage",
    question: "What's the difference between Takaful and Conventional insurance?",
    answer: "**Takaful Insurance (Islamic):**\n- Shariah-compliant, based on mutual cooperation\n- No interest (riba), uncertainty (gharar), or gambling (maisir)\n- Surplus distributed among participants\n- Example: Takaful Ikhlas\n\n**Conventional Insurance:**\n- Traditional insurance model\n- Risk transfer to insurance company\n- Examples: Etiqa, Allianz\n\n**Key Point:** Both offer similar coverage and benefits. Choose based on your preference. Takaful is not necessarily cheaper or more expensive - prices vary by insurer.",
    keywords: ["takaful", "conventional", "islamic insurance", "shariah", "halal insurance"]
  },

  // Claims
  {
    id: "how-to-claim",
    category: "Claims",
    question: "How do I make an insurance claim after an accident?",
    answer: "**Step-by-step claims process:**\n\n1. **At the scene:**\n   - Take photos of all damage and the accident scene\n   - Exchange details with other parties (IC, phone, insurance)\n   - Get witness contacts if possible\n   - Make a police report within 24 hours (required for all claims)\n\n2. **Report to your insurer:**\n   - Call your insurer's hotline immediately\n   - Provide your policy number and accident details\n   - They'll assign a claim number\n\n3. **Submit documents:**\n   - Claim form (from insurer)\n   - Copy of police report\n   - Copy of your IC and driving license\n   - Photos of damage\n   - Repair quotations (if required)\n\n4. **Vehicle inspection:**\n   - Insurer will inspect damage\n   - They'll approve repair at their panel workshop or your preferred workshop\n\n5. **Repairs & payment:**\n   - Panel workshop: Usually no upfront payment\n   - Own workshop: You may pay first and get reimbursed\n\nTypical timeline: 7-14 days for approval, 3-7 days for repairs.",
    keywords: ["make claim", "accident claim", "claim process", "how to claim", "insurance claim"]
  },
  {
    id: "police-report",
    category: "Claims",
    question: "Do I need a police report for every claim?",
    answer: "**Yes, you need a police report for:**\n- All accident claims (with other vehicles or property)\n- Theft claims\n- Hit-and-run incidents\n- Vandalism\n\n**You may NOT need a police report for:**\n- Windscreen claims (standalone windscreen coverage)\n- Some minor own damage claims (check with your insurer)\n\n**Important:** Make the police report within 24 hours of the incident. Late reports may be rejected by insurers. You can make reports at any police station in Malaysia.",
    keywords: ["police report", "accident report", "claim requirement", "report needed"]
  },
  {
    id: "claim-settlement",
    category: "Claims",
    question: "How long does it take to settle a claim?",
    answer: "**Typical claim settlement timelines:**\n\n**Simple claims (own damage, panel workshop):**\n- Claim approval: 3-7 working days\n- Repair completion: 3-7 days\n- Total: 1-2 weeks\n\n**Complex claims (total loss, third party disputes):**\n- Investigation: 2-4 weeks\n- Settlement negotiation: 2-6 weeks\n- Total: 1-3 months\n\n**Windscreen claims:**\n- Usually same-day approval\n- Replacement: 1-2 days\n\n**Factors affecting timeline:**\n- Completeness of documents\n- Dispute with third party\n- Availability of parts\n- Workshop schedule\n\n**Tip:** Use insurer's panel workshop for faster processing and no upfront payment.",
    keywords: ["claim duration", "how long claim", "settlement time", "claim processing time"]
  },

  // Add-ons
  {
    id: "windscreen-coverage",
    category: "Add-ons",
    question: "What is Windscreen Coverage and do I need it?",
    answer: "**Windscreen Coverage** protects your car's windscreen, windows, and sunroof from damage (cracks, chips, shattering).\n\n**Benefits:**\n- Covers windscreen replacement/repair without affecting your NCD\n- No need to make a full claim for windscreen damage\n- Typically costs RM80-150/year\n- Coverage limit: Usually RM500-1500\n\n**You should get it if:**\n- You drive on highways frequently (stone chips common)\n- You park outdoors (vandalism risk)\n- Windscreen replacement for your car is expensive (RM800+)\n\n**You can skip it if:**\n- You drive rarely\n- Your car's windscreen is cheap to replace\n- You park in secure locations\n\n**Example:** A Myvi windscreen costs ~RM500. If it cracks, you claim RM500 and only pay RM100/year premium = good value.",
    keywords: ["windscreen", "windshield", "window coverage", "glass coverage", "windscreen add-on"]
  },
  {
    id: "flood-coverage",
    category: "Add-ons",
    question: "What is Flood Coverage (Special Perils) and is it necessary?",
    answer: "**Flood Coverage (Special Perils)** protects your car from damage caused by:\n- Floods\n- Landslides\n- Typhoons/hurricanes\n- Falling objects (trees, debris)\n- Natural disasters\n\n**Cost:** Typically RM50-100/year\n\n**You NEED it if:**\n- You live in flood-prone areas (Penang, Kelantan, parts of Selangor)\n- You park in low-lying areas or basements\n- Malaysia's monsoon season affects your area\n- Your car is valuable (repair costs high)\n\n**You can skip it if:**\n- You live in highlands or non-flood areas\n- You park in elevated, safe locations\n\n**Important:** Standard comprehensive insurance does NOT cover flood damage. You must add this coverage separately. Flood damage can cost RM10,000-50,000+ to repair (engine damage).",
    keywords: ["flood coverage", "special perils", "flood insurance", "natural disaster", "monsoon"]
  },
  {
    id: "legal-liability-passengers",
    category: "Add-ons",
    question: "What is Legal Liability to Passengers coverage?",
    answer: "**Legal Liability to Passengers** covers your legal responsibility if your passengers are injured or killed in an accident.\n\n**What it covers:**\n- Medical expenses for injured passengers\n- Compensation for permanent disability\n- Death benefits to passengers' families\n- Your legal defense costs\n\n**Standard coverage:** RM100,000 per passenger (up to 4-8 passengers depending on car capacity)\n\n**Cost:** Usually RM20-50/year\n\n**You should get it if:**\n- You frequently carry family members or friends\n- You drive for ride-sharing (Grab, etc.)\n- You want comprehensive protection\n\n**Note:** This is different from Personal Accident coverage. Legal Liability covers your responsibility to passengers; Personal Accident covers YOU as the driver.",
    keywords: ["passenger liability", "passenger coverage", "passenger protection", "legal liability"]
  },

  // Road Tax
  {
    id: "road-tax-renewal",
    category: "Road Tax",
    question: "How do I renew my road tax?",
    answer: "**Ways to renew road tax in Malaysia:**\n\n**1. Online (via LAJOO or MyEG):**\n- Fastest method, get digital road tax immediately\n- Can opt for physical delivery (3-5 days)\n- Need: Valid insurance (must be renewed first!)\n\n**2. At JPJ (Road Transport Department):**\n- Walk in with documents\n- Get physical road tax immediately\n- Can be crowded, expect queues\n\n**3. At Post Office (Pos Malaysia):**\n- Available at selected branches\n- Get physical road tax immediately\n- Less crowded than JPJ\n\n**Documents needed:**\n- Original insurance cover note (must be valid)\n- Vehicle grant (for first-time or ownership change)\n- PUSPAKOM inspection report (if required)\n- MyKad/IC\n\n**Important:** You MUST renew insurance before road tax. Road tax cannot be renewed without valid insurance.",
    keywords: ["renew road tax", "road tax renewal", "jpj", "myeg", "road tax process"]
  },
  {
    id: "road-tax-calculation",
    category: "Road Tax",
    question: "How is road tax calculated in Malaysia?",
    answer: "Road tax in Malaysia is based on engine capacity (CC) and vehicle type:\n\n**Private Cars (Peninsular Malaysia):**\n- Up to 1000cc: RM20\n- 1001-1200cc: RM55\n- 1201-1400cc: RM70\n- 1401-1600cc: RM90\n- 1601-1800cc: RM200\n- 1801-2000cc: RM380\n- 2001-2500cc: RM520\n- 2501-3000cc: RM1,020\n- Above 3000cc: Progressive rate\n\n**Example:**\n- Perodua Myvi (1.5L = 1496cc): RM90/year\n- Honda Civic (1.5 Turbo = 1498cc): RM90/year\n- BMW 320i (2.0L = 1998cc): RM380/year\n\n**Note:** Rates are different for Sabah, Sarawak, and Labuan. Commercial vehicles have different rates too.",
    keywords: ["road tax rate", "road tax calculation", "how much road tax", "road tax price", "cc"]
  },
  {
    id: "digital-vs-physical-road-tax",
    category: "Road Tax",
    question: "Is digital road tax accepted everywhere?",
    answer: "**Yes! Digital road tax (e-road tax) is 100% legal and accepted everywhere in Malaysia since 2020.**\n\n**Digital Road Tax:**\n- Stored in MyJPJ app\n- No need for physical sticker\n- Instant delivery\n- Cannot be lost or damaged\n- Environmentally friendly\n- Same legal validity as physical\n\n**Physical Road Tax:**\n- Traditional sticker on windscreen\n- Takes 3-5 days for delivery (if online)\n- Can fade or be damaged by sun\n- Some people prefer for visibility\n\n**Police and JPJ enforcement:**\nOfficers can check your road tax status via their system using your vehicle registration number. You don't need to show physical road tax.\n\n**Recommendation:** Digital is more convenient unless you prefer the traditional sticker for peace of mind.",
    keywords: ["digital road tax", "e-road tax", "physical road tax", "myjpj", "road tax sticker"]
  },

  // General Insurance
  {
    id: "when-to-renew",
    category: "General",
    question: "When should I renew my car insurance?",
    answer: "**Best practice for renewal timing:**\n\n**Recommended: 30-60 days before expiry**\n- Gives you time to compare quotes\n- Avoid last-minute rush\n- Ensure continuous coverage\n\n**Latest: Before expiry date**\n- Insurance MUST be continuous (no gap)\n- Road tax cannot be renewed without valid insurance\n- Driving without insurance is illegal (RM1,000 fine + 3 months jail possible)\n\n**Early renewal benefits:**\n- Some insurers offer early bird discounts\n- More time to review coverage\n- Can negotiate better rates\n\n**Grace period:**\n- Technically, there's NO grace period\n- Your coverage ends at midnight on expiry date\n- But most insurers allow backdated renewal within 30 days (may need inspection)\n\n**Tip:** Set a reminder 60 days before your expiry date to start shopping for quotes.",
    keywords: ["when to renew", "renewal timing", "insurance expiry", "renew early"]
  },
  {
    id: "comparing-quotes",
    category: "General",
    question: "How do I compare insurance quotes effectively?",
    answer: "**Key factors to compare beyond price:**\n\n**1. Coverage Details:**\n- Sum insured (adequate for your car's value?)\n- Excess amount (RM400? RM500? Lower is better)\n- Towing distance (150km? 200km? Unlimited?)\n\n**2. Insurer Reputation:**\n- Claim settlement ratio (how many claims approved?)\n- Settlement speed (days to process?)\n- Customer service quality\n- Panel workshop network size\n\n**3. Additional Benefits:**\n- Free towing\n- Replacement car during repairs\n- 24/7 hotline\n- Online claim submission\n- Mobile app quality\n\n**4. Premium vs Benefits:**\n- Don't just pick cheapest\n- RM100 difference may mean RM1000s difference in claim experience\n- Check reviews online\n\n**5. Add-ons Pricing:**\n- Some insurers bundle add-ons cheaper\n- Compare total package price\n\n**Example:**\nInsurer A: RM750 (90% claim ratio, 150km towing)\nInsurer B: RM800 (95% claim ratio, unlimited towing, replacement car)\n→ Insurer B may be better value despite higher price.",
    keywords: ["compare quotes", "choose insurance", "best insurance", "insurance comparison"]
  },
  {
    id: "what-affects-premium",
    category: "General",
    question: "What factors affect my insurance premium?",
    answer: "**Main factors that determine your premium:**\n\n**1. Vehicle-related:**\n- Car make and model (luxury cars = higher premium)\n- Engine capacity (higher CC = higher premium)\n- Car age (older cars may be cheaper)\n- Car value (sum insured)\n- Modifications (modified cars = higher premium)\n\n**2. Driver-related:**\n- Your age (young drivers pay more)\n- Driving experience\n- NCD level (0% to 55%)\n- Claims history (frequent claims = higher premium)\n- Gender (minor factor)\n\n**3. Coverage-related:**\n- Type (comprehensive vs third party)\n- Add-ons selected\n- Excess amount (higher excess = lower premium)\n\n**4. Location:**\n- Where you live/park (high crime area = higher premium)\n- Urban vs rural\n\n**5. Other:**\n- Insurer's pricing strategy\n- Market competition\n- Economic factors\n\n**Tips to lower premium:**\n- Build your NCD (don't claim for minor damage)\n- Choose appropriate sum insured (not too high)\n- Install anti-theft devices\n- Park in secure locations\n- Compare multiple insurers",
    keywords: ["premium factors", "why expensive", "reduce premium", "lower price", "expensive insurance"]
  },
  {
    id: "betterment-charges",
    category: "Claims",
    question: "What are betterment charges in insurance claims?",
    answer: "**Betterment** refers to charges you pay when old damaged parts are replaced with brand new parts during repairs.\n\n**Why betterment exists:**\n- Insurance compensates for loss, not improvement\n- Replacing a 5-year-old part with new improves your car's value\n- You pay the difference (depreciation)\n\n**Common betterment items:**\n- Tires (wear and tear items)\n- Brake pads\n- Batteries\n- Wiper blades\n- Upholstery/seats\n\n**How it's calculated:**\n- Based on depreciation rate\n- Example: 5-year-old tire replaced\n  - New tire cost: RM300\n  - Depreciation 50%: You pay RM150\n  - Insurer pays: RM150\n\n**Parts NOT subject to betterment:**\n- Body panels (doors, bumpers, fenders)\n- Windscreen\n- Lights\n- Engine components (in accident claims)\n\n**Tip:** Some premium policies have \"zero betterment\" coverage where insurer pays 100% even for wear items. Ask your agent about this option.",
    keywords: ["betterment", "betterment charges", "claim deduction", "depreciation", "wear and tear"]
  },
  {
    id: "panel-vs-own-workshop",
    category: "Claims",
    question: "Should I use panel workshop or my own workshop for repairs?",
    answer: "**Panel Workshop (Insurer's approved workshops):**\n\n**Pros:**\n- Direct billing (no upfront payment)\n- Faster claim approval (3-7 days)\n- Insurer guarantees repair quality\n- Established relationship with insurer\n- Hassle-free process\n\n**Cons:**\n- Limited choice of workshop\n- May be far from your location\n- Quality varies by workshop\n- May use non-original parts (check policy)\n\n**Own Workshop:**\n\n**Pros:**\n- Choose your trusted mechanic\n- May get better quality repairs\n- Can insist on original parts\n- Convenient location\n\n**Cons:**\n- You pay first, claim reimbursement later\n- Longer approval process (7-14 days)\n- May need multiple quotations\n- Insurer may dispute repair costs\n- More paperwork and follow-up\n\n**Recommendation:**\n- **Panel workshop:** For major repairs, total loss, or if you don't have trusted mechanic\n- **Own workshop:** For minor repairs if you have a reliable, honest workshop and don't mind the hassle\n\n**Important:** If you choose own workshop, get insurer's approval BEFORE repairs start, or they may reject excessive charges.",
    keywords: ["panel workshop", "own workshop", "where to repair", "workshop choice", "claim workshop"]
  },
  {
    id: "total-loss-claim",
    category: "Claims",
    question: "What happens in a total loss claim?",
    answer: "**Total Loss** is when repair costs exceed 75% of your car's market value, or the car is stolen and not recovered.\n\n**Total loss claim process:**\n\n**1. Assessment:**\n- Insurer inspects damage\n- Compares repair costs vs car value\n- If repair > 75% of value = total loss\n\n**2. Valuation:**\n- Insurer determines market value\n- Based on: age, mileage, condition, market prices\n- You can negotiate if you disagree\n\n**3. Settlement options:**\n\n**Option A - Claim full payout:**\n- Insurer pays market value (sum insured or lower)\n- You surrender the car to insurer\n- Car becomes insurer's property (salvage)\n\n**Option B - Keep the salvage:**\n- Insurer pays market value MINUS salvage value\n- You keep the damaged car\n- Can sell parts or repair yourself\n\n**4. Payment:**\n- Settlement within 14-30 days after agreement\n- Minus any outstanding loan (paid to bank first)\n- You receive the balance\n\n**Example:**\n- Car market value: RM40,000\n- Sum insured: RM40,000\n- Outstanding loan: RM15,000\n- Salvage value: RM8,000\n\n**Option A:** You get RM25,000 (RM40,000 - RM15,000 loan)\n**Option B:** You get RM17,000 (RM40,000 - RM15,000 loan - RM8,000 salvage) + keep damaged car\n\n**Important:** After total loss claim, your NCD is typically lost unless you have NCD Protection.",
    keywords: ["total loss", "car totaled", "write off", "total loss claim", "car stolen"]
  }
];

/**
 * Search knowledge base by keywords
 * @param {string} query - User's question
 * @returns {Array} - Relevant knowledge base entries
 */
export function searchKnowledgeBase(query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  const results = INSURANCE_KNOWLEDGE_BASE.map(entry => {
    let score = 0;

    // Check if query words match keywords
    queryWords.forEach(word => {
      if (word.length < 3) return; // Skip short words

      entry.keywords.forEach(keyword => {
        if (keyword.includes(word) || word.includes(keyword)) {
          score += 2;
        }
      });

      // Check question and answer
      if (entry.question.toLowerCase().includes(word)) {
        score += 1.5;
      }
      if (entry.answer.toLowerCase().includes(word)) {
        score += 0.5;
      }
    });

    return { ...entry, score };
  });

  // Return top 3 results with score > 0
  return results
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Get knowledge by category
 * @param {string} category - Category name
 * @returns {Array} - Knowledge base entries in that category
 */
export function getKnowledgeByCategory(category) {
  return INSURANCE_KNOWLEDGE_BASE.filter(
    entry => entry.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get all categories
 * @returns {Array} - List of unique categories
 */
export function getAllCategories() {
  return [...new Set(INSURANCE_KNOWLEDGE_BASE.map(entry => entry.category))];
}
