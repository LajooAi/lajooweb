"use client";
import { useState, useEffect, useRef } from "react";

export default function AddOnsSection({ heading, addOns = [], onConfirm, onSelectionChange, preSelectedAddOns = [], stepIndicator }) {
  // Log every render to debug
  console.log('[AddOnsSection] Render - preSelectedAddOns:', preSelectedAddOns);

  // Initialize with preSelectedAddOns if provided
  const [selectedAddOns, setSelectedAddOns] = useState(() => {
    if (preSelectedAddOns && Array.isArray(preSelectedAddOns)) {
      const ids = preSelectedAddOns.map(addon => addon?.id).filter(Boolean);
      console.log('[AddOnsSection] Initial state from preSelectedAddOns:', ids);
      return ids;
    }
    return [];
  });
  const isInitialMount = useRef(true);

  // Sync with preSelectedAddOns when they change (from parent or AI selection)
  useEffect(() => {
    if (preSelectedAddOns && Array.isArray(preSelectedAddOns)) {
      const preSelectedIds = preSelectedAddOns.map(addon => addon?.id).filter(Boolean);
      console.log('[AddOnsSection] preSelectedAddOns changed:', preSelectedIds);
      // Force update when preSelectedAddOns changes
      setSelectedAddOns(preSelectedIds);
    }
  }, [JSON.stringify(preSelectedAddOns?.map(a => a?.id))]); // Use JSON.stringify to detect array content changes

  const toggleAddOn = (addOnId) => {
    setSelectedAddOns((prev) => {
      const newSelection = prev.includes(addOnId)
        ? prev.filter((id) => id !== addOnId)
        : [...prev, addOnId];
      return newSelection;
    });
  };

  // Notify parent of selection changes in real-time (but skip on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (onSelectionChange) {
      const selectedAddOnObjects = addOns.filter((addon) => selectedAddOns.includes(addon.id));
      onSelectionChange(selectedAddOnObjects);
    }
  }, [selectedAddOns]);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(selectedAddOns);
    }
  };

  return (
    <div className="addons-section">
      {stepIndicator && <p className="step-indicator">{stepIndicator}</p>}
      {heading && <p className="addons-heading">{heading}</p>}

      <div className="addons-list">
        {addOns.map((addon) => (
          <div
            key={addon.id}
            className={`addon-item ${selectedAddOns.includes(addon.id) ? "addon-selected" : ""}`}
            onClick={() => toggleAddOn(addon.id)}
          >
            <div className="addon-content">
              <span className="addon-name">{addon.name}</span>
              <span className="addon-price">RM {addon.price}</span>
            </div>
            <div className={`addon-checkbox ${selectedAddOns.includes(addon.id) ? "checked" : ""}`}>
              {selectedAddOns.includes(addon.id) && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M13.3334 4L6.00002 11.3333L2.66669 8"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="addons-confirm-button" onClick={handleConfirm}>
        Confirm
      </button>
    </div>
  );
}
