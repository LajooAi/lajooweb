# LAJOO Private Car Missing Facts Backlog

Generated: 2026-06-06

These are facts LAJOO users will probably ask, but I did **not** approve them unless the uploaded PDFs or official insurer pages clearly supported them.

Use this as the founder/admin review list. Blank means: do not let LAJOO answer confidently yet.

| Priority | Topic | Insurer | Question LAJOO Should Eventually Answer | Current Status | What To Add Later |
|---:|---|---|---|---|---|
| 1 | Live availability | All insurers | Is this add-on available for this exact car, postcode, sum insured, NCD and quote today? | Not available from PDFs | Must come from live insurer quote/API response |
| 2 | Exact add-on pricing | All insurers | How much is windscreen/flood/betterment/roadside for this exact vehicle? | Not approved from static PDFs | Must come from quote engine or insurer tariff/rating API |
| 3 | Claims quality | All insurers | Which insurer pays claims fastest in real life? | Not approved | Need LAJOO claims data, SLA data, complaint data, user feedback |
| 4 | Panel workshop strength | All insurers | Which insurer has the best panel workshops near the user? | Not approved | Need panel workshop database by postcode + insurer |
| 5 | Tesla eligibility | Allianz | Does Allianz EV Shield apply to this exact Tesla model/year? | Partial | Add current EV Shield eligibility rules by model/year |
| 6 | Tesla eligibility | Etiqa | Does Tesla Ensure apply if the Tesla is used, reconditioned, imported, or not purchased from Tesla Malaysia? | Partial | Add official eligibility confirmation |
| 7 | Tesla eligibility | MSIG | Does MSIG EV Plus cover Tesla-specific battery/charging scenarios beyond charger/cable/towing? | Partial | Add official Tesla/model-specific wording |
| 8 | Tesla eligibility | Tokio Marine | Which Tokio product/version includes EV charger and charging cable cover for Tesla? | Partial | Add product-level mapping from live quote/API |
| 9 | EV battery | All EV-capable insurers | Does the policy cover EV battery damage, battery degradation, fire while charging, or battery theft? | Not approved broadly | Need EV endorsement wording by insurer |
| 10 | EV charger install | All EV-capable insurers | Is the home wall charger covered if installed at condo/shared parking? | Not approved | Need official wording and property-condition rules |
| 11 | Out-of-charge towing | All EV-capable insurers | Is out-of-charge towing unlimited or capped? | Partial | Add exact distance/value limits per insurer |
| 12 | Betterment | Etiqa | Is Etiqa Brand New Spare Parts equivalent to zero betterment for all old cars? | Partial | Need exact terms, age limit, eligible parts, exclusions |
| 13 | Betterment | Generali | What is the exact car age limit for Generali Waiver of Betterment? | Partial | Add endorsement wording and eligibility |
| 14 | Betterment | Allianz | What is the exact eligibility/age limit for Allianz Waiver of Betterment Contribution? | Partial | Add endorsement schedule rules |
| 15 | Betterment | Lonpac | What exact Lonpac product/quote includes Betterment Buyback? | Partial | Map to live product/quote |
| 16 | Betterment | Takaful Ikhlas | Which exact Takaful Ikhlas brand/program includes waiver of betterment and unlimited towing? | Partial | Map Honda/Proton/Perodua/Subaru/normal plans |
| 17 | Betterment | Tokio Marine | Does Tokio AutoPro zero betterment up to 15 years apply automatically to every AutoPro quote? | Partial | Confirm live quote/product flag |
| 18 | Flood | All insurers | Is Special Perils full or limited cover for this quote? | Partial | Quote engine must expose full/limited/flood allowance clearly |
| 19 | Flood | Lonpac | Is user selecting Lonpac Full Cover Special Perils or Limited Cover? | Partial | Quote UI/API must distinguish them |
| 20 | Flood | Tokio Marine | Does AutoPro flood allowance replace or supplement Special Perils? | Partial | Need product wording interpretation/admin confirmation |
| 21 | Flood | Etiqa | Is flood add-on available for every private-car comprehensive quote? | Partial | Confirm by live quote/API |
| 22 | Flood | Takaful Ikhlas | Is IKHLAS Limited Special Perils different from full Special Perils for the selected quote? | Partial | Need exact selected endorsement |
| 23 | Windscreen | All insurers | What windscreen sum insured should this car choose? | Not approved as fact | Need vehicle glass price table or advisor estimate rules |
| 24 | Windscreen | All insurers | Does tinting/film/ADAS camera calibration count under the selected windscreen cover? | Partial | Need endorsement wording per insurer |
| 25 | Windscreen | All insurers | Does windscreen claim affect NCD for this exact product? | Mostly yes, but quote-specific | Confirm exact endorsement before final payment |
| 26 | Towing | Allianz | Does Allianz Road Ranger 150km round-trip apply to accident towing, breakdown towing, or both? | Partial | Clarify by latest Road Ranger T&C |
| 27 | Towing | Etiqa | Is Etiqa 200km towing normal or delayed due to current service notice? | Partial/current notice | Admin should verify current operational notice before public recommendation |
| 28 | Towing | Generali | When does RM300 towing apply versus unlimited towing via MDP+? | Partial | Product/quote must expose selected benefit |
| 29 | Towing | MSIG | Which plan/quote includes unlimited towing versus standard Motor Assist? | Partial | Live quote must expose add-on/bundle |
| 30 | Towing | Takaful Ikhlas | Which private-car products have unlimited towing? | Partial | Map by exact PDS/brand program |
| 31 | Towing | Tokio Marine | Are there Auto Partner towing conditions that limit actual practical availability? | Partial | Add Auto Partner full T&C |
| 32 | E-hailing | Etiqa | Does Etiqa currently offer a private-car e-hailing add-on through LAJOO? | Blank | Need official product/API confirmation |
| 33 | E-hailing | Lonpac | Does Lonpac currently support private-car e-hailing endorsement through LAJOO? | Blank | Need official product/API confirmation |
| 34 | E-hailing | MSIG | Is there any MSIG private-hire/e-hailing product separate from car sharing? | Blank | Need official APAD/CVLB product confirmation |
| 35 | E-hailing | All insurers | Does cover apply only while online, carrying passenger, or all e-hailing use time? | Partial | Need endorsement-specific time-of-cover rules |
| 36 | Road tax | JPJ/Malaysia | Current digital/printed road tax eligibility and exceptions | Not insurer fact | Need official JPJ/MOT source and effective date |
| 37 | NCD | All insurers | Can LAJOO verify exact NCD before quote? | Not from PDF | Need NCD/ISM lookup integration |
| 38 | Sum insured | All insurers | Is agreed value or market value available for this exact car? | Partial | Need live quote/API and valuation service |
| 39 | Excess | All insurers | What excess applies for this exact quote, young driver, unnamed driver, or P licence? | Partial | Need quote/API-level excess details |
| 40 | Cancellation refund | All insurers | What refund applies if user cancels midway? | In policy wording, not yet structured | Extract cancellation facts later |
| 41 | Payment instalment | All insurers/payment provider | Does instalment/pay-later affect issuance timing? | Not approved | Need payment-provider rules |
| 42 | Policy issuance | All insurers | How quickly is e-policy issued after successful payment? | Not approved | Need insurer/API operational SLA |
| 43 | Brand perks | Perodua | Any special Perodua plan perks by insurer? | Partial for Takaful Ikhlas PDS names only | Need brand program mapping |
| 44 | Brand perks | Proton | Any special Proton plan perks by insurer? | Partial for Takaful Ikhlas PDS names only | Need brand program mapping |
| 45 | Brand perks | Honda | Any special Honda plan perks by insurer? | Partial for Takaful Ikhlas PDS names only | Need brand program mapping |
| 46 | Brand perks | Subaru | Any special Subaru plan perks by insurer? | Partial for Takaful Ikhlas PDS names only | Need brand program mapping |
| 47 | Brand perks | BYD | Any EV-specific BYD preferred insurer/product? | Blank | Need official BYD/insurer partnership info |
| 48 | Brand perks | Tesla | Is Etiqa still the preferred/official Tesla Malaysia insurance partner today? | Partial | Verify periodically from Tesla/Etiqa official pages |
| 49 | Claims | All insurers | Does user need police report within 24 hours? | Broadly true, not yet structured per insurer | Add general claims guidance facts later |
| 50 | Claims | All insurers | Can user go to non-panel workshop and still claim? | Partial | Need insurer-specific claim process facts |

## Additional Suitability Facts To Build Next

These are the facts that make LAJOO feel like a real consultant instead of a PDF search bot. They should become structured, approved facts only when supported by insurer wording, live quote data, operational data, or founder/admin approval.

| Priority | Theme | Question LAJOO Should Answer | Why It Matters | Current Action |
|---:|---|---|---|---|
| 51 | Brand/model suitability | Which insurer/product is best for Perodua, Proton, Honda, Toyota, Mazda, Nissan, BMW, Mercedes, Volvo, BYD, Tesla, Chery, GWM/Ora, Smart, MG and why? | Users think by car brand/model, not policy wording. | Add brand-program evidence and quote eligibility flags. |
| 52 | Dealer-program eligibility | Was the car bought through an authorised franchise/dealer, and does the quote show the matching brand programme? | Many brand perks only apply to specific programmes. | Must come from quote/API or user confirmation. |
| 53 | Exact brand-program benefits | What exact benefits apply for each brand programme: betterment, towing, flood allowance, key care, replacement car, PA, excess waiver? | Prevents LAJOO from overclaiming perks. | Extract PDS benefit tables into structured facts. |
| 54 | Workshop network by postcode | Which insurer has strong panel/authorised repair support near the user's postcode? | Claims convenience can matter more than RM50 premium difference. | Build panel workshop database by insurer/postcode. |
| 55 | Parts and repair speed | Which insurers/products are safer for models with expensive/slow parts? | Useful for EVs, continental cars, new Chinese brands, rare models. | Need claims/repair ops data, not PDFs only. |
| 56 | ADAS windscreen cost | Does this car have camera/sensor calibration cost after windscreen replacement? | Windscreen sum insured can be too low for modern cars. | Add glass price/ADAS table by model. |
| 57 | Flood postcode risk | Does the user live/work/park in a known flood-risk area? | Makes Special Perils recommendation much smarter. | Add postcode/flood-zone data. |
| 58 | Usage pattern | Is the car daily commute, weekend only, highway/outstation, family shared, e-hailing, company use, or modified? | Changes recommendation logic dramatically. | Add one smart question when uncertain. |
| 59 | Older-car surprise cost | For a 5+ year car, which quote avoids betterment and high excess best? | Older-car owners hate surprise repair bills. | Combine car age + betterment facts + live quote flags. |
| 60 | Young/unnamed driver risk | Does the user have under-21, P-licence, or unnamed drivers? | Excess and claim conditions can surprise users. | Structure excess facts by insurer/product. |
| 61 | EV battery/fire/charging | Which EV covers battery damage, charging cable, wallbox, public charging incidents, flat battery towing and thermal/fire scenarios? | EV users need specialised explanation. | Extract EV endorsement wording by insurer. |
| 62 | Tesla-specific support | Which current Tesla products are official/preferred, what purchase channel qualifies, and what happens for used/imported Tesla? | Tesla users are high-value and highly specific. | Periodically verify Etiqa/Tesla and insurer EV pages. |
| 63 | Claim process clarity | What exactly should the user do after accident: call hotline, police report, workshop, documents, timeline? | Builds trust and reduces support burden. | Add general claim assistant facts. |
| 64 | Policy issuance SLA | How long after payment until cover note/e-policy is issued for each insurer? | Payment confidence depends on speed and certainty. | Need insurer/API ops data. |
| 65 | Cancellation/refund | Can user cancel and how refund is calculated? | Important before payment and disputes. | Extract cancellation terms into approved facts. |
| 66 | Add-on incompatibility | Which add-ons cannot be combined, are only available for certain vehicle age/sum insured, or require inspection? | Prevents impossible recommendations. | Must come from quote/API eligibility. |
| 67 | Promotion validity | Which promos are active today and when do they expire? | Promotions are highly time-sensitive. | Admin-managed promotion table with expiry dates. |
| 68 | Bahasa Malaysia wording | Can LAJOO explain each concept in BM using official Malay wording? | Malaysian users may switch language mid-chat. | Add BM facts linked to EN equivalents. |
| 69 | Regulatory wording | What exact disclaimers must be shown before quote/payment? | Compliance safety. | Add compliance-approved response templates. |
| 70 | Human escalation triggers | When must AI stop and ask human ops to verify? | Prevents confident wrong answers. | Add hard rules for missing eligibility, claim, payment, and issuance facts. |

## Founder Rule

If a fact affects price, payment, eligibility, policy issuance, or claim payout, LAJOO should not rely on static PDF text alone. It needs either:

- live insurer API confirmation,
- admin-approved structured fact with source and effective date,
- or human handoff.
