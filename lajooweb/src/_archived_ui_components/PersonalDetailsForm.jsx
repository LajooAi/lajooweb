"use client";
import { useState, useEffect } from "react";

export default function PersonalDetailsForm({ heading, onSubmit, prefilledData = {}, stepIndicator, disabled = false }) {
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    address: "",
  });

  const [autoFilledFields, setAutoFilledFields] = useState({
    email: false,
    phone: false,
    address: false,
  });

  // Update form data when prefilled data changes
  useEffect(() => {
    if (prefilledData.email || prefilledData.phone || prefilledData.address) {
      setFormData((prev) => ({
        email: prefilledData.email || prev.email,
        phone: prefilledData.phone || prev.phone,
        address: prefilledData.address || prev.address,
      }));

      setAutoFilledFields({
        email: !!prefilledData.email,
        phone: !!prefilledData.phone,
        address: !!prefilledData.address,
      });
    }
  }, [prefilledData]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Mark as manually edited (no longer auto-filled)
    setAutoFilledFields((prev) => ({ ...prev, [field]: false }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit && formData.email && formData.phone && formData.address) {
      onSubmit(formData);
    }
  };

  return (
    <div className="personal-details-section">
      {stepIndicator && <p className="step-indicator">{stepIndicator}</p>}
      {heading && <p className="personal-details-heading">{heading}</p>}

      <form className="personal-details-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">
            1. Email Address
            {autoFilledFields.email && !disabled && <span className="auto-filled-badge">✓ Auto-filled</span>}
          </label>
          <input
            type="email"
            className={`form-input ${autoFilledFields.email ? 'auto-filled' : ''} ${disabled ? 'form-input-disabled' : ''}`}
            placeholder="Enter your email"
            value={formData.email}
            onChange={(e) => handleChange("email", e.target.value)}
            required
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className="form-label">
            2. Phone Number
            {autoFilledFields.phone && !disabled && <span className="auto-filled-badge">✓ Auto-filled</span>}
          </label>
          <input
            type="tel"
            className={`form-input ${autoFilledFields.phone ? 'auto-filled' : ''} ${disabled ? 'form-input-disabled' : ''}`}
            placeholder="Enter your phone number"
            value={formData.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            required
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className="form-label">
            3. RoadTax Delivery Address
            {autoFilledFields.address && !disabled && <span className="auto-filled-badge">✓ Auto-filled</span>}
          </label>
          <textarea
            className={`form-textarea ${autoFilledFields.address ? 'auto-filled' : ''} ${disabled ? 'form-input-disabled' : ''}`}
            placeholder="Enter your delivery address"
            value={formData.address}
            onChange={(e) => handleChange("address", e.target.value)}
            rows={3}
            required
            disabled={disabled}
          />
        </div>

        <button type="submit" className="form-submit-button" disabled={disabled}>
          {disabled ? "Submitted ✓" : "Submit"}
        </button>
      </form>
    </div>
  );
}
