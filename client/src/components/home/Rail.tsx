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
    Array.from(el.children).forEach((c) => ro?.observe(c));
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, children]);

  const scrollByDir = (dir: "prev" | "next") => {
    const el = ref.current;
    if (!el) return;
    const rtl = window.getComputedStyle(el).direction === "rtl";
    const sign = rtl ? -1 : 1;
    const amount = Math.max(240, el.clientWidth * 0.85);
    el.scrollBy({ left: (dir === "next" ? 1 : -1) * sign * amount, behavior: "smooth" });
  };

  const arrow =
    "hidden sm:flex absolute top-[38%] z-20 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-[0_8px_24px_-10px_rgba(74,24,43,0.45)] transition-all duration-200 hover:bg-berry hover:text-white hover:border-berry";

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
        className={`scrollbar-hide flex snap-x snap-proximity overflow-x-auto scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0 scroll-px-4 sm:scroll-px-0 ${scrollClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
