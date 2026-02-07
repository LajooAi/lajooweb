"use client";

export default function QuoteCard({ quote, onSelect }) {
  return (
    <article className="quote-card">
      <div className="quote-card-body">
        <div className="quote-card-left">
          <h3 className="quote-insurer-name">{quote.insurer}</h3>

          <p className="quote-detail-line">
            <span className="quote-label">Sum Insured : </span>
            <span className="quote-value-text">RM {quote.sumInsured?.toLocaleString()}</span>
          </p>

          <p className="quote-detail-line quote-cover">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="check-icon">
              <path d="M13.3334 4L6.00002 11.3333L2.66669 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{quote.cover}</span>
          </p>

          <p className="quote-detail-line">
            <span className="quote-label">Price : </span>
            <span className="quote-value-text">RM {quote.priceBefore?.toLocaleString()} / year</span>
          </p>

          <p className="quote-detail-line quote-ncd">
            <span className="quote-label">After NCD ({quote.ncdPercent?.toFixed(2)}%) : </span>
            <strong className="quote-final-price">RM {quote.priceAfter?.toLocaleString()}</strong>
          </p>
        </div>

        <div className="quote-card-right">
          <div className="quote-logo-wrapper">
            {quote.logoUrl ? (
              <img src={quote.logoUrl} alt={quote.insurer} className="quote-logo-img" />
            ) : (
              <span className="quote-logo-text">{quote.logoText || quote.insurer?.substring(0, 1)}</span>
            )}
          </div>

          <button
            className="quote-select-button"
            type="button"
            onClick={() => onSelect && onSelect(quote)}
          >
            Select
          </button>
        </div>
      </div>
    </article>
  );
}

export function QuoteStack({ heading, quotes = [], onSelectQuote, stepIndicator }) {
  return (
    <div className="quote-stack">
      {stepIndicator && <p className="step-indicator">{stepIndicator}</p>}
      {heading && <p className="quote-stack-heading">{heading}</p>}
      <div className="quote-cards-container">
        {quotes.map((quote, index) => (
          <QuoteCard
            key={quote.id || quote.insurer || index}
            quote={quote}
            onSelect={onSelectQuote}
          />
        ))}
      </div>
    </div>
  );
}
