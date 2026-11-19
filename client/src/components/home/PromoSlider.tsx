import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { optimizeCloudinaryUrl } from "@/lib/utils";

export interface PromoSlide {
  key: string;
  image: string;
  title: string;
  href: string;
}

/**
 * Wide photo slider for the middle of the landing page: one photo at a time,
 * cross-fading every few seconds, with arrows, dots and swipe.
 * The admin sets the photos, titles and links in Content → Home.
 */
export function PromoSlider({ slides, isAr }: { slides: PromoSlide[]; isAr: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const count = slides.length;
  const i = count ? index % count : 0;

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = window.setTimeout(() => setIndex((v) => (v + 1) % count), 5500);
    return () => window.clearTimeout(id);
  }, [count, paused, i]);

  if (count === 0) return null;
  const go = (n: number) => setIndex(((n % count) + count) % count);
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <div
      className="relative overflow-hidden rounded-[1.5rem] bg-sand sm:rounded-[2rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        setTouchX(null);
        if (Math.abs(dx) < 45) return;
        go(i + ((isAr ? dx > 0 : dx < 0) ? 1 : -1));
      }}
      data-testid="promo-slider"
    >
      <div className="relative aspect-[16/9] sm:aspect-[4/1]">
        {slides.map((slide, n) => (
          <Link
            key={slide.key}
            href={slide.href}
            tabIndex={n === i ? 0 : -1}
            aria-hidden={n !== i}
            className={`group absolute inset-0 block transition-opacity duration-700 ${n === i ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"}`}
          >
            <img
              src={optimizeCloudinaryUrl(slide.image, 1600) || slide.image}
              alt={slide.title}
              loading="lazy"
              decoding="async"
              className={`h-full w-full object-cover transition-transform duration-[6000ms] ease-out ${n === i ? "scale-100" : "scale-105"}`}
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
            <span className="absolute inset-x-4 bottom-10 flex items-end justify-between gap-3 text-white sm:inset-x-9 sm:bottom-12">
              {slide.title && (
                <span className="font-heading min-w-0 text-2xl font-medium leading-tight sm:text-4xl">
                  {slide.title}
                </span>
              )}
              <span className="ms-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium text-foreground transition-colors duration-300 group-hover:bg-berry group-hover:text-white sm:h-11 sm:px-6 sm:text-sm">
                {isAr ? "تسوقي الآن" : "Shop now"}
                <Arrow className="h-4 w-4" />
              </span>
            </span>
          </Link>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(i - 1)}
            className="absolute start-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow transition-colors hover:bg-berry hover:text-white sm:flex"
            aria-label={isAr ? "السابق" : "Previous"}
          >
            <ChevronLeft className="h-5 w-5 rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => go(i + 1)}
            className="absolute end-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow transition-colors hover:bg-berry hover:text-white sm:flex"
            aria-label={isAr ? "التالي" : "Next"}
          >
            <ChevronRight className="h-5 w-5 rtl:-scale-x-100" />
          </button>
          <div className="absolute inset-x-0 bottom-3.5 z-20 flex justify-center gap-2 sm:bottom-5">
            {slides.map((s, n) => (
              <button
                key={s.key}
                type="button"
                onClick={() => go(n)}
                aria-label={`${n + 1}`}
                className={`h-2 rounded-full transition-all duration-500 ${n === i ? "w-7 bg-white" : "w-2 bg-white/55 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
