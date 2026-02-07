"use client";
import { useState, useCallback } from "react";
import SelectedQuoteCard from "@/components/SelectedQuoteCard";
import RoadTaxSection from "@/components/RoadTaxSection";

const SELECTED_QUOTE = {
  id: "ikhlas-1",
  insurer: "Takaful Ikhlas Insurance",
  sumInsured: 34000,
  cover: "Full Cover",
  priceBefore: 995,
  ncdPercent: 20,
  priceAfter: 796,
  logoUrl: "/partners/takaful.svg",
};

const CONFIRMED_ADDONS = [
  {
    id: "windscreen",
    name: "Windscreen Protection",
    price: 100,
  },
];

const ROAD_TAX_OPTIONS = [
  {
    id: "deliver",
    name: "Yes, deliver it to me",
    subtitle: "(3-5 days)",
    price: 100, // 90 + 10 delivery
    displayPrice: "RM 90 + RM 10 delivery",
  },
  {
    id: "digital",
    name: "Yes, digital only",
    price: 90,
    displayPrice: "RM 90",
  },
  {
    id: "no",
    name: "No, just insurance",
    price: null,
    displayPrice: null,
  },
];

export default function TestRoadTax() {
  const [currentRoadTax, setCurrentRoadTax] = useState(null);

  const handleRoadTaxSelectionChange = useCallback((selectedRoadTaxObject) => {
    setCurrentRoadTax(selectedRoadTaxObject);
  }, []);

  const handleConfirm = (selectedOptionId) => {
    const selected = ROAD_TAX_OPTIONS.find((opt) => opt.id === selectedOptionId);
    if (selected) {
      alert(`You selected: ${selected.name}`);
    } else {
      alert("Please select an option first");
    }
  };

  return (
    <main
      style={{
        padding: "40px 20px",
        maxWidth: "600px",
        margin: "0 auto",
        minHeight: "100vh",
        background: "#f9fafb",
      }}
    >
      <h1
        style={{
          fontSize: "28px",
          fontWeight: "700",
          marginBottom: "24px",
          color: "#111827",
        }}
      >
        Step 3/5: Road Tax - Test Page
      </h1>

      <SelectedQuoteCard
        quote={SELECTED_QUOTE}
        selectedAddOns={CONFIRMED_ADDONS}
        selectedRoadTax={currentRoadTax}
      />

      <RoadTaxSection
        heading="(Step 3/5) Would you like to renew your road tax too ?"
        roadTaxOptions={ROAD_TAX_OPTIONS}
        onConfirm={handleConfirm}
        onSelectionChange={handleRoadTaxSelectionChange}
      />
    </main>
  );
}
