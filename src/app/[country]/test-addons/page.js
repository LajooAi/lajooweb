"use client";
import { useState, useCallback } from "react";
import SelectedQuoteCard from "@/components/SelectedQuoteCard";
import AddOnsSection from "@/components/AddOnsSection";

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

const ADD_ONS = [
  {
    id: "windscreen",
    name: "Windscreen Protection",
    price: 100,
  },
  {
    id: "flood",
    name: "Flood & Natural Disaster (Special Perils)",
    price: 50,
  },
];

export default function TestAddOns() {
  const [currentAddOns, setCurrentAddOns] = useState([]);

  const handleAddOnsSelectionChange = useCallback((selectedAddOnsObjects) => {
    setCurrentAddOns(selectedAddOnsObjects);
  }, []);

  const handleConfirm = (selectedAddOnIds) => {
    const selected = ADD_ONS.filter((addon) => selectedAddOnIds.includes(addon.id));
    const total = selected.reduce((sum, addon) => sum + addon.price, 0);
    alert(`Selected add-ons:\n${selected.map((a) => `- ${a.name}: RM ${a.price}`).join("\n")}\n\nTotal: RM ${total + SELECTED_QUOTE.priceAfter}`);
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
        Step 2/5: Add-ons - Test Page
      </h1>

      <SelectedQuoteCard
        quote={SELECTED_QUOTE}
        selectedAddOns={currentAddOns}
        selectedRoadTax={null}
      />

      <AddOnsSection
        heading="(Step 2/5) Would you like to have the below add-ons ?"
        addOns={ADD_ONS}
        onConfirm={handleConfirm}
        onSelectionChange={handleAddOnsSelectionChange}
      />
    </main>
  );
}
