"use client";

export default function SelectedQuoteCard({ quote, selectedAddOns = [], selectedRoadTax = null }) {
  // Calculate totals
  const basePrice = quote.priceAfter || 0;
  const addOnsTotal = selectedAddOns.reduce((sum, addon) => sum + (addon.price || 0), 0);
  // Support both 'price' (frontend) and 'totalPrice' (backend) property names
  const roadTaxPrice = selectedRoadTax ? (selectedRoadTax.price || selectedRoadTax.totalPrice || 0) : 0;
  const grandTotal = basePrice + addOnsTotal + roadTaxPrice;

  return (
    <article className="selected-quote-card">
      <div className="selected-quote-body">
        <div className="selected-quote-left">
          <h3 className="selected-insurer-name">{quote.insurer}</h3>

          <p className="selected-detail-line">
            <span className="selected-label">Sum Insured : </span>
            <span className="selected-value">RM {quote.sumInsured?.toLocaleString()}</span>
          </p>

          <p className="selected-detail-line selected-cover">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="check-icon">
              <path d="M13.3334 4L6.00002 11.3333L2.66669 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{quote.cover}</span>
          </p>

          <p className="selected-detail-line">
            <span className="selected-label">Price : </span>
            <span className="selected-value">RM {quote.priceBefore?.toLocaleString()} / year</span>
          </p>

          <p className="selected-detail-line">
            <span className="selected-label">After NCD ({quote.ncdPercent?.toFixed(2)}%) : </span>
            <strong className="selected-price-value">RM {quote.priceAfter?.toLocaleString()}</strong>
          </p>

          {/* Show add-ons if selected */}
          {selectedAddOns.length > 0 && selectedAddOns.map((addon) => (
            <p key={addon.id} className="selected-detail-line selected-addon-line">
              <span className="selected-addon-price">+ {addon.name} : RM {addon.price}</span>
            </p>
          ))}

          {/* Show road tax if selected */}
          {selectedRoadTax && roadTaxPrice > 0 && (
            <p className="selected-detail-line selected-addon-line">
              <span className="selected-addon-price">+ {selectedRoadTax.name} : RM {roadTaxPrice}</span>
            </p>
          )}
        </div>

        <div className="selected-quote-right">
          <div className="selected-logo-wrapper">
            {quote.logoUrl ? (
              <img src={quote.logoUrl} alt={quote.insurer} className="selected-logo-img" />
            ) : (
              <span className="selected-logo-text">{quote.logoText || quote.insurer?.substring(0, 1)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Show grand total - always show by default, spans full width */}
      <div className="selected-grand-total-row">
        <p className="selected-detail-line selected-grand-total-line">
          <span className="selected-label">Grand Total : </span>
          <strong className="selected-grand-total">RM {grandTotal.toLocaleString()}</strong>
        </p>
        <div className="selected-badge">
          Selected
        </div>
      </div>
    </article>
  );
}
