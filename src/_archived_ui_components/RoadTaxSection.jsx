"use client";
import { useState, useEffect, useRef } from "react";

export default function RoadTaxSection({ heading, roadTaxOptions = [], onConfirm, onSelectionChange, preSelectedRoadTax = null, stepIndicator }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const isInitialMount = useRef(true);

  // Sync with preSelectedRoadTax when it changes
  useEffect(() => {
    if (preSelectedRoadTax && preSelectedRoadTax.id) {
      setSelectedOption(prev => prev === preSelectedRoadTax.id ? prev : preSelectedRoadTax.id);
    }
  }, [preSelectedRoadTax]);

  const selectOption = (optionId) => {
    setSelectedOption(optionId);
  };

  // Notify parent of selection changes in real-time (but skip on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (onSelectionChange) {
      const selectedOptionObject = roadTaxOptions.find((opt) => opt.id === selectedOption);
      onSelectionChange(selectedOptionObject || null);
    }
  }, [selectedOption]);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(selectedOption);
    }
  };

  return (
    <div className="roadtax-section">
      {stepIndicator && <p className="step-indicator">{stepIndicator}</p>}
      {heading && <p className="roadtax-heading">{heading}</p>}

      <div className="roadtax-list">
        {roadTaxOptions.map((option) => (
          <div
            key={option.id}
            className={`roadtax-item ${selectedOption === option.id ? "roadtax-selected" : ""}`}
            onClick={() => selectOption(option.id)}
          >
            <div className="roadtax-content">
              <span className="roadtax-name">{option.name}</span>

              {/* Features list with tick symbols */}
              {option.features && option.features.length > 0 && (
                <div className="roadtax-features">
                  {option.features.map((feature, idx) => (
                    <p key={idx} className="roadtax-feature-line">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="check-icon">
                        <path d="M13.3334 4L6.00002 11.3333L2.66669 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>{feature}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Legacy subtitle support */}
              {option.subtitle && !option.features && (
                <span className="roadtax-subtitle">{option.subtitle}</span>
              )}

              {option.displayPrice && (
                <span className="roadtax-price">{option.displayPrice}</span>
              )}
            </div>
            <div className={`roadtax-checkbox ${selectedOption === option.id ? "checked" : ""}`}>
              {selectedOption === option.id && (
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

      <button className="roadtax-confirm-button" onClick={handleConfirm}>
        Confirm
      </button>
    </div>
  );
}
