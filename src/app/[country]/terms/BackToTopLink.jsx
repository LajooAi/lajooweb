"use client";

export default function BackToTopLink() {
  const scrollToTop = (behavior = "smooth") => {
    const options = { top: 0, left: 0, behavior };
    const targets = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector(".content-col"),
      document.querySelector(".app-frame"),
    ];

    targets.forEach((target) => {
      if (!target) return;

      if (typeof target.scrollTo === "function") {
        target.scrollTo(options);
      } else {
        target.scrollTop = 0;
        target.scrollLeft = 0;
      }
    });

    window.scrollTo(options);
  };

  const handleClick = (event) => {
    event.preventDefault();

    if (window.history?.replaceState) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#top`);
    }

    scrollToTop("smooth");
    window.setTimeout(() => scrollToTop("auto"), 450);
  };

  return (
    <a href="#top" onClick={handleClick}>
      Back to top <span aria-hidden="true">↑</span>
    </a>
  );
}
