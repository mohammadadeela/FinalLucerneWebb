import { useEffect, useState } from "react";
import { Link } from "wouter";
import { optimizeCloudinaryUrl } from "@/lib/utils";
import { AutoplayVideo } from "@/components/ui/AutoplayVideo";

export interface PromoSlide {
  key: string;
  image: string;
  title: string;
  href: string;
  /** A video plays instead of the photo when there is one (the photo is its poster). */
  video?: string;
  imagePosition?: string;
  videoPosition?: string;
  subtitle?: string;
}

/**
 * Wide photo slider for the middle of the landing page: one photo at a time,
 * cross-fading every few seconds, with arrows, dots and swipe.
 * The admin sets the photos, titles and links in Content → Home.
 */
export function PromoSlider({ slides, isAr, eager }: { slides: PromoSlide[]; isAr: boolean; /** Top-of-page banner: load the first photo at once. */ eager?: boolean }) {
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

  return (
    <div
      className="relative overflow-hidden rounded-[1.5rem] bg-blush sm:rounded-[2rem]"
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
            {slide.video ? (
              <AutoplayVideo
                src={slide.video}
                preload={n === i ? "auto" : "metadata"}
                poster={slide.image || undefined}
                className="h-full w-full object-cover"
                style={{ objectPosition: slide.videoPosition || "50% 50%" }}
              />
            ) : (
              <img
                src={optimizeCloudinaryUrl(slide.image, 1600) || slide.image}
                alt={slide.title}
                loading={eager && n === 0 ? "eager" : "lazy"}
                fetchPriority={eager && n === 0 ? "high" : undefined}
                decoding="async"
                className={`h-full w-full object-cover transition-transform duration-[6000ms] ease-out ${n === i ? "scale-100" : "scale-105"}`}
                style={{ objectPosition: slide.imagePosition || "center" }}
              />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
            {(slide.title || slide.subtitle) && (
              <span className="absolute bottom-8 start-3.5 max-w-[85%] text-white sm:bottom-12 sm:start-9">
                {slide.title && <span className="font-heading block truncate text-xl font-medium leading-tight sm:text-4xl">{slide.title}</span>}
                {slide.subtitle && <span className="mt-1 hidden max-w-xl text-[15px] leading-snug text-white/85 sm:line-clamp-2 sm:block">{slide.subtitle}</span>}
              </span>
            )}
          </Link>
        ))}
      </div>

      {count > 1 && (
        <>
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
