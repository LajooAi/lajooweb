"use client";

import { useCallback, useEffect, useRef } from "react";

function classNames(...tokens) {
  return tokens.filter(Boolean).join(" ");
}

export default function EqualWidthTitle({
  tag = "h1",
  className = "",
  lineClassName = "",
  secondaryLineClassName = "",
  primaryText = "",
  secondaryText = "",
}) {
  const titleRef = useRef(null);
  const primaryRef = useRef(null);
  const secondaryRef = useRef(null);

  const syncWidth = useCallback(() => {
    const titleEl = titleRef.current;
    const primaryEl = primaryRef.current;
    const secondaryEl = secondaryRef.current;
    if (!titleEl || !primaryEl || !secondaryEl) return;

    secondaryEl.style.fontSize = "";
    secondaryEl.style.transform = "";
    secondaryEl.style.transformOrigin = "";
    titleEl.style.width = "";

    const primaryWidth = primaryEl.getBoundingClientRect().width;
    const secondaryWidth = secondaryEl.getBoundingClientRect().width;
    if (primaryWidth <= 0 || secondaryWidth <= 0) return;

    const secondarySize = Number.parseFloat(window.getComputedStyle(secondaryEl).fontSize);
    if (!Number.isFinite(secondarySize) || secondarySize <= 0) return;

    let nextSize = (secondarySize * primaryWidth) / secondaryWidth;
    const maxSecondarySize = Number.parseFloat(
      window.getComputedStyle(titleEl).getPropertyValue("--equal-width-secondary-max-size")
    );

    if (Number.isFinite(maxSecondarySize) && maxSecondarySize > 0 && nextSize > maxSecondarySize) {
      secondaryEl.style.fontSize = `${maxSecondarySize}px`;
      const cappedWidth = secondaryEl.getBoundingClientRect().width;
      if (cappedWidth > 0) {
        secondaryEl.style.transformOrigin = "center center";
        secondaryEl.style.transform = `scaleX(${primaryWidth / cappedWidth})`;
      }
      titleEl.style.width = `${primaryWidth}px`;
      return;
    }

    secondaryEl.style.fontSize = `${nextSize}px`;

    // Converge width over a few tiny passes to avoid residual mismatch from font rounding.
    for (let i = 0; i < 4; i += 1) {
      const measuredWidth = secondaryEl.getBoundingClientRect().width;
      if (measuredWidth <= 0) break;

      const delta = Math.abs(measuredWidth - primaryWidth);
      if (delta <= 0.25) break;

      nextSize = (nextSize * primaryWidth) / measuredWidth;
      secondaryEl.style.fontSize = `${nextSize}px`;
    }

    titleEl.style.width = `${primaryWidth}px`;
  }, []);

  useEffect(() => {
    let rafId = 0;
    let observer;

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => syncWidth());
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    if (typeof ResizeObserver !== "undefined" && titleRef.current) {
      observer = new ResizeObserver(schedule);
      observer.observe(titleRef.current);
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(schedule).catch(() => {});
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      observer?.disconnect();
    };
  }, [syncWidth]);

  const Tag = tag;

  return (
    <Tag ref={titleRef} className={className}>
      <span ref={primaryRef} className={lineClassName}>
        {primaryText}
      </span>
      <span ref={secondaryRef} className={classNames(lineClassName, secondaryLineClassName)}>
        {secondaryText}
      </span>
    </Tag>
  );
}
