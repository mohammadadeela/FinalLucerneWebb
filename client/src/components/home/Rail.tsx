import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal, swipeable rail with snap points and arrow buttons.
 * Works in both LTR and RTL, hides its arrows when there is nothing to scroll,
 * and bleeds to the screen edge on phones so the next card peeks in.
 */
export function Rail({
  children,
  className = "",
  scrollClassName = "",
  ariaLabel,
  testId,
}: {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  ariaLabel?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setAtStart(pos <= 4);
    setAtEnd(pos >= max - 4);
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Rows fill in after their products load — re-check the arrows whenever the content changes.
  useEffect(() => {
    measure();
  });

  // Arrow clicks run their own short eased scroll (about a third of a second) instead of the
  // browser's "smooth" scroll, which waits a beat before moving and felt laggy on long rows.
  const anim = useRef(0);
  const scrollByDir = (dir: "prev" | "next") => {
    const el = ref.current;
    if (!el) return;
    const rtl = window.getComputedStyle(el).direction === "rtl";
    const sign = rtl ? -1 : 1;
    const first = el.firstElementChild as HTMLElement | null;
    const gap = parseFloat(window.getComputedStyle(el).columnGap || "0") || 0;
    const step = first ? first.offsetWidth + gap : 240;
    // Move by whole cards so the row always lands cleanly.
    const amount = Math.max(1, Math.floor((el.clientWidth + gap) / step) - (el.clientWidth < 640 ? 0 : 1)) * step;
    const from = el.scrollLeft;
    const delta = (dir === "next" ? 1 : -1) * sign * amount;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(anim.current);
    el.style.scrollSnapType = "none";
    if (reduce) {
      el.scrollLeft = from + delta;
      el.style.scrollSnapType = "";
      return;
    }
    const t0 = performance.now();
    const D = 340;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / D);
      el.scrollLeft = from + delta * (1 - Math.pow(1 - k, 3));
      if (k < 1) anim.current = requestAnimationFrame(tick);
      else el.style.scrollSnapType = "";
    };
    anim.current = requestAnimationFrame(tick);
  };

  const arrow =
    "hidden sm:flex absolute top-[38%] z-20 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#E8257D] text-white shadow-[0_8px_24px_-10px_rgba(232,37,125,0.7)] transition-all duration-200 hover:bg-[#B3125C]";

  return (
    <div className={`relative ${className}`}>
      {!atStart && (
        <button
          type="button"
          onClick={() => scrollByDir("prev")}
          className={`${arrow} -start-3 lg:-start-5`}
          aria-label="Previous"
          data-testid={testId ? `${testId}-prev` : undefined}
        >
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          onClick={() => scrollByDir("next")}
          className={`${arrow} -end-3 lg:-end-5`}
          aria-label="Next"
          data-testid={testId ? `${testId}-next` : undefined}
        >
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      )}
      <div
        ref={ref}
        onScroll={measure}
        role="list"
        aria-label={ariaLabel}
        data-testid={testId}
        className={`scrollbar-hide flex snap-x snap-proximity overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scroll-px-4 sm:scroll-px-0 ${scrollClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
