"use client";

export default function PaymentSuccess({ heading, plateNumber, policyPdfUrl, googleReviewUrl }) {
  return (
    <div className="payment-success-section">
      {heading && <p className="payment-success-heading">{heading}</p>}

      <div className="payment-success-badge">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="success-icon">
          <circle cx="24" cy="24" r="24" fill="#10B981"/>
          <path d="M34 16L20 30L14 24" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h3 className="payment-success-title">Payment Successful!</h3>
        <p className="payment-success-status">Status: <span className="paid-badge">Paid ✓</span></p>
      </div>

      <div className="payment-success-content">
        <div className="success-message">
          <p>🎉 Your insurance policy has been successfully processed.</p>
          <p>📧 Policy documents have been sent to your email and WhatsApp.</p>
        </div>

        {policyPdfUrl && (
          <div className="policy-download">
            <div className="policy-download-card">
              <div className="policy-icon">📄</div>
              <div className="policy-info">
                <span className="policy-filename">{plateNumber ? `${plateNumber} Policy.pdf` : 'Policy.pdf'}</span>
                <span className="policy-size">PDF Document</span>
              </div>
              <div className="policy-actions">
                <a href={policyPdfUrl} download className="policy-download-btn">
                  Download
                </a>
                <button className="policy-share-btn" onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Insurance Policy',
                      text: 'My insurance policy document',
                      url: policyPdfUrl,
                    });
                  }
                }}>
                  Share
                </button>
              </div>
            </div>
          </div>
        )}

        {googleReviewUrl && (
          <div className="google-review-section">
            <p className="review-request">💝 Enjoying LAJOO? We'd love to hear from you!</p>
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="google-review-button"
            >
              ⭐ Leave a Google Review
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
