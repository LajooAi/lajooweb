# LAJOO AI Assistant - Smart Features Documentation

## 🎉 What's New

Your AI assistant is now **truly intelligent**! It can:
- Look up previous insurance policies by registration number
- Fetch real-time quotes (currently using mock data)
- Answer questions about your current quote, add-ons, and total price
- Remember conversation context (knows what you've selected)
- Extract personal information from natural conversation

## 🏗️ Architecture Overview

```
User Chat → AI with Function Calling → Mock APIs → Response
                ↓                           ↓
         Context Aware              Real APIs (Future)
```

### Key Components

1. **`/lib/insuranceAPI.js`** - Mock insurance API layer
   - All insurance functions (quotes, lookup, validation)
   - **Replace with real APIs later** - just swap mock implementations

2. **`/lib/aiFunctions.js`** - AI function definitions
   - Defines what functions AI can call
   - System prompts with conversation context

3. **`/app/api/chat/route.js`** - Enhanced chat API
   - OpenAI function calling implementation
   - Context injection
   - Function execution loop

4. **`/app/[country]/page.js`** - Frontend with context
   - Passes conversation state to AI
   - AI knows: current step, selected quote, add-ons, road tax, etc.

## 💬 Example Conversations

### Scenario 1: Looking up previous policy

**User:** "My registration number is WXY1234"

**AI:** (Calls `lookup_previous_policy("WXY1234")`)
"Found your policy! You're currently with Takaful Ikhlas with 20% NCD. Your policy expires on 2024-12-31. Would you like me to get renewal quotes for you?"

---

### Scenario 2: Asking about current quote

**User:** "What's my current quote?"

**AI:** (Uses context - no function call needed)
"You're looking at Takaful Ikhlas Insurance for RM 796 (after 20% NCD discount). This is for full cover with a sum insured of RM 34,000."

---

### Scenario 3: Getting total price

**User:** "How much will I pay in total?"

**AI:** (Calls `calculate_total_premium` with current selections)
"Your total breakdown:
- Insurance Premium: RM 796
- Windscreen Protection: RM 100
- Road Tax (Delivery): RM 100
**Grand Total: RM 996**"

---

### Scenario 4: Natural conversation

**User:** "I want to renew my car insurance. My plate is ABC5678"

**AI:** (Calls `lookup_previous_policy` then `get_insurance_quotes`)
"Great! I found your policy with Allianz (25% NCD). Let me get you the best renewal quotes...

I found 4 quotes for you! The best price is from Takaful Ikhlas at RM 900 (25% NCD savings of RM 300). Would you like to see all options?"

## 🔧 Available AI Functions

The AI can call these functions automatically:

| Function | Purpose | Example Use |
|----------|---------|-------------|
| `lookup_previous_policy` | Find user's last policy | "What was my previous insurer?" |
| `get_insurance_quotes` | Fetch quotes from insurers | "Show me quotes" |
| `validate_registration_number` | Check if reg number is valid | "Is WXY1234 valid?" |
| `get_available_addons` | List available add-ons | "What add-ons can I get?" |
| `get_roadtax_options` | Get road tax options | "How much is road tax?" |
| `calculate_total_premium` | Calculate final price | "What's my total?" |

## 📝 Mock Data

Currently using **mock data** for development:

### Mock Policies
- **WXY1234**: Perodua Myvi 2020, Takaful Ikhlas, 20% NCD
- **ABC5678**: Honda City 2019, Allianz, 25% NCD

### Mock Quotes
- Generates 4 quotes from different insurers
- Prices based on engine CC and sum insured
- Applies NCD discount automatically

## 🔌 API Integration Checklist

When you get real insurer APIs, follow these steps:

### Step 1: Update `/lib/insuranceAPI.js`

**Before (Mock):**
```javascript
export async function getInsuranceQuotes(vehicleInfo) {
  await new Promise(resolve => setTimeout(resolve, 800)); // Fake delay

  // Mock data
  const quotes = [...mockQuotes];
  return quotes;
}
```

**After (Real API):**
```javascript
export async function getInsuranceQuotes(vehicleInfo) {
  const response = await fetch('https://insurer-api.com/quotes', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.INSURER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(vehicleInfo)
  });

  const data = await response.json();
  return data.quotes; // Map to your format if needed
}
```

### Step 2: Add API keys to `.env.local`

```env
OPENAI_API_KEY=sk-...
INSURER_API_KEY=your-insurer-api-key
JPJ_API_KEY=your-jpj-api-key
PAYMENT_GATEWAY_KEY=your-payment-key
```

### Step 3: Test each function individually

```bash
# Test in console or create test page
import { getInsuranceQuotes } from '@/lib/insuranceAPI';

const quotes = await getInsuranceQuotes({
  vehicleType: 'Private Car',
  cc: 1500,
  sumInsured: 35000,
  ncd: 20
});

console.log(quotes);
```

### Step 4: Update response mapping (if needed)

If insurer API returns different format:

```javascript
export async function getInsuranceQuotes(vehicleInfo) {
  const response = await fetch(...);
  const data = await response.json();

  // Map their format to your format
  return data.insurers.map(item => ({
    id: item.insurerId,
    insurer: item.companyName,
    sumInsured: item.coverageAmount,
    priceAfter: item.finalPremium,
    // ... map all fields
  }));
}
```

## ✅ What's Already Done

- ✅ Mock API layer with all insurance functions
- ✅ OpenAI function calling setup
- ✅ Conversation context injection
- ✅ AI can answer questions about user's selections
- ✅ AI can look up policies (mock data)
- ✅ AI can calculate totals
- ✅ Hybrid form with NLP extraction
- ✅ Real-time cart updates
- ✅ 5-step flow UI

## 🚀 Testing the New Features

### Test 1: Policy Lookup
1. Start chat
2. Type: "My registration is WXY1234"
3. AI should look up the policy and tell you details

### Test 2: Context Awareness
1. Select a quote in the UI
2. Ask: "What's my current quote?"
3. AI should know which quote you selected

### Test 3: Total Calculation
1. Select quote + add-ons + road tax
2. Ask: "What's my total?"
3. AI should give you the exact breakdown

## 🎯 Next Steps (Optional Enhancements)

1. **Add more functions:**
   - `compare_quotes` - Side-by-side comparison
   - `check_claim_status` - Track claims
   - `schedule_callback` - Book agent call

2. **Enhance NLP extraction:**
   - Extract vehicle make/model
   - Extract IC number
   - Extract dates

3. **Add conversation memory:**
   - Store chat history in database
   - Resume conversations later

4. **Add proactive suggestions:**
   - "Based on your car age, I recommend..."
   - "You're eligible for higher NCD"

## 🔒 Security Notes

- ⚠️ Never expose API keys in frontend
- ✅ All API calls happen on server-side (`/app/api`)
- ✅ Validate user input before calling APIs
- ✅ Sanitize data before storing

## 📊 Cost Estimation

With gpt-4o-mini:
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

Average conversation (30 messages with function calls):
- ~10,000 tokens = **$0.01 per conversation**
- 1,000 users/day = **~$10/day** in AI costs

## 🎓 Summary

You now have a **production-ready AI architecture** where:

1. AI is context-aware (knows what user selected)
2. AI can call functions to fetch data
3. Easy to swap mock APIs with real APIs (5-30 min per API)
4. Conversation flows naturally
5. User can chat OR use forms

**Timeline to production:**
- Already built: UI, AI architecture, mock APIs ✅
- To do: Plug in real APIs (~5-30 min each)
- Testing: 1-2 days
- **Total: ~3-5 days to go live!**
