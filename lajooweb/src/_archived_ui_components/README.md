# Archived UI Components

These UI components were archived on 2026-01-05 as part of simplifying LAJOO to focus on AI conversation quality.

## Components

- **QuoteCard.jsx** - Individual insurance quote card display
- **SelectedQuoteCard.jsx** - Shows the selected quote with add-ons and road tax
- **AddOnsSection.jsx** - Add-on selection UI with checkboxes
- **RoadTaxSection.jsx** - Road tax option selection UI
- **PersonalDetailsForm.jsx** - Form for email, phone, address
- **OTPVerification.jsx** - 4-digit OTP input component
- **PaymentSelection.jsx** - Payment method selection UI
- **PaymentSuccess.jsx** - Payment success confirmation

## Why Archived

Decision to simplify LAJOO to a pure AI chat assistant without UI cards:
- Focus on AI conversation quality and stability
- More reliable for business/insurer partnerships
- Simpler maintenance and testing
- AI handles the full conversation flow naturally

## To Restore

If needed, copy these files back to `/src/components/` and update `page.js` to import and render them.
