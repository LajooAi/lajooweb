"use client";

import { useState } from "react";

function ReviewNavIcon({ direction = "next" }) {
  const path = direction === "prev" ? "M12.5 4.5L7 10l5.5 5.5" : "M7.5 4.5L13 10l-5.5 5.5";

  return (
    <span className="reviews-control__icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" focusable="false">
        <path d={path} />
      </svg>
    </span>
  );
}

export default function ReviewsCarousel({ reviews = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeReview = reviews[activeIndex] ?? reviews[0];
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < reviews.length - 1;

  if (!activeReview) {
    return null;
  }

  return (
    <div className="reviews-carousel">
      <article className="review-card review-card--featured">
        <div className="review-card__head">
          <div className="review-card__avatar" aria-hidden="true" />
          <div className="review-card__identity">
            <p className="review-card__author">{activeReview.author}</p>
            <p className="review-card__date">{activeReview.time}</p>
          </div>
        </div>

        <p className="review-card__body">{activeReview.text}</p>

        <div className="review-card__footer">
          <div className="review-card__stars" role="img" aria-label="Rating 5 out of 5">
            ★★★★★
          </div>
          <button type="button" className="review-card__view">
            View <span aria-hidden="true">&gt;</span>
          </button>
        </div>
      </article>

      <div className="reviews-controls" aria-label="Review navigation">
        <button
          type="button"
          className="reviews-control reviews-control--prev"
          onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
          disabled={!hasPrev}
          aria-label="Previous review"
        >
          <ReviewNavIcon direction="prev" />
        </button>
        <button
          type="button"
          className="reviews-control reviews-control--next"
          onClick={() => setActiveIndex((index) => Math.min(reviews.length - 1, index + 1))}
          disabled={!hasNext}
          aria-label="Next review"
        >
          <ReviewNavIcon direction="next" />
        </button>
      </div>
    </div>
  );
}
