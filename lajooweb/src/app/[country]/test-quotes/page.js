"use client";
import { QuoteStack } from "@/components/QuoteCard";

const QUOTE_CARDS = [
  {
    id: "etiqa-1",
    insurer: "Etiqa Insurance",
    sumInsured: 35000,
    cover: "Full Cover",
    priceBefore: 1090,
    ncdPercent: 20,
    priceAfter: 872,
    logoUrl: "/partners/etiqa.svg",
  },
  {
    id: "ikhlas-1",
    insurer: "Takaful Ikhlas Insurance",
    sumInsured: 34000,
    cover: "Full Cover",
    priceBefore: 995,
    ncdPercent: 20,
    priceAfter: 796,
    logoUrl: "/partners/takaful.svg",
  },
  {
    id: "allianz-1",
    insurer: "Allianz Insurance",
    sumInsured: 36000,
    cover: "Full Cover",
    priceBefore: 1150,
    ncdPercent: 20,
    priceAfter: 920,
    logoUrl: "/partners/allianz.svg",
  },
  {
    id: "tokio-1",
    insurer: "Tokio Marine Insurance",
    sumInsured: 35000,
    cover: "Full Cover",
    priceBefore: 1075,
    ncdPercent: 20,
    priceAfter: 860,
    logoUrl: "/partners/tokio-marine.svg",
  },
];

export default function TestQuotes() {
  const handleSelect = (quote) => {
    alert(`You selected: ${quote.insurer} - RM ${quote.priceAfter}`);
  };

  return (
    <main style={{
      padding: "40px 20px",
      maxWidth: "600px",
      margin: "0 auto",
      minHeight: "100vh",
      background: "#f9fafb"
    }}>
      <h1 style={{
        fontSize: "28px",
        fontWeight: "700",
        marginBottom: "24px",
        color: "#111827"
      }}>
        Insurance Quote Cards - Test Page
      </h1>

      <QuoteStack
        heading="(Step 1/5) Here are the best quotes for JRT 9289 :-"
        quotes={QUOTE_CARDS}
        onSelectQuote={handleSelect}
      />
    </main>
  );
}
