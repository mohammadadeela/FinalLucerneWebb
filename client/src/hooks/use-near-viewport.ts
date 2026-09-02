import { useEffect, useRef, useState } from "react";

/**
 * Reports true once the element has scrolled within `rootMargin` of the
 * viewport, and stays true forever after (images don't need to "unload").
 *
 * Why this exists: native `loading="lazy"` uses the browser's own lookahead
 * distance, which is deliberately SMALL on slower connections (Chrome can
 * shrink it to near-zero to save data). That's exactly backwards for a
 * product grid, where the goal is for images to already be loaded — or well
 * underway — by the time the customer's scroll actually reaches them. This
 * hook lets us start the real image request ~1200px before it's visible
 * instead, which is what actually removes the "blank card while scrolling"
 * flash and the felt delay when a photo pops in late.
 */
export function useNearViewport<T extends HTMLElement>(rootMargin = "1200px 0px") {
  const ref = useRef<T | null>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    if (isNear) return; // already triggered — no need to keep observing
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver support (very old browsers) — just load it.
    if (typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isNear, rootMargin]);

  return { ref, isNear };
}
