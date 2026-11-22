import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { AutoplayVideo } from "@/components/ui/AutoplayVideo";
import { HeroScene, useSeasonSkin } from "@/components/seasonal/SeasonalDecor";
import { LucerneMark } from "@/components/ui/BrandButterfly";
import {
  optimizeCloudinaryUrl,
  optimizeCloudinaryVideoUrl,
  blurCloudinaryUrl,
} from "@/lib/utils";
import { splitAccent } from "@/lib/storefront";

export interface HeroSlide {
  key: string;
  image: string;
  imagePosition?: string;
  video?: string;
  videoPosition?: string;
  tag?: string;
  title: string;
  subtitle?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

const SLIDE_MS = 6500;

/* Soft panel tints, one per slide, so every slide feels like its own page of a lookbook. */
const TINTS = [
  "linear-gradient(120deg, hsl(var(--blush)) 0%, hsl(var(--blush) / 0.88) 100%)",
];

export function HeroSlider({ slides, isAr }: { slides: HeroSlide[]; isAr: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0); // restarts the progress animation
  const [loadAll, setLoadAll] = useState(false); // defer non-first slide media
  const [firstReady, setFirstReady] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // While the admin has a season on (Christmas / Eid) the text panel wears that season's colours.
  const skin = useSeasonSkin();
  const count = slides.length;
  const safeIndex = count > 0 ? index % count : 0;

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
      setCycle((c) => c + 1);
      setLoadAll(true);
    },
    [count],
  );

  // Autoplay — pauses on hover / touch / keyboard focus and in background tabs.
  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const id = window.setTimeout(() => {
      if (document.visibilityState === "visible") go(safeIndex + 1);
      else setCycle((c) => c + 1);
    }, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [count, paused, reducedMotion, safeIndex, cycle, go]);

  // Let the first slide paint first, then quietly fetch the rest.
  useEffect(() => {
    const id = window.setTimeout(() => setLoadAll(true), 2500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  if (count === 0) return null;

  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
    setPaused(true);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    setPaused(false);
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    // Swipe towards the start edge = next slide (mirrored in RTL).
    const forward = isAr ? dx > 0 : dx < 0;
    go(safeIndex + (forward ? 1 : -1));
  };

  return (
    <section
      className="relative isolate overflow-hidden pt-navbar"
      aria-roledescription="carousel"
      aria-label={isAr ? "العروض الرئيسية" : "Featured collections"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(safeIndex + (isAr ? -1 : 1));
        if (e.key === "ArrowLeft") go(safeIndex + (isAr ? 1 : -1));
      }}
      data-testid="hero-slider"
    >
      <div className="relative h-[80vw] max-h-[400px] min-h-[310px] sm:h-[clamp(320px,30.5vw,470px)] sm:max-h-none">
        {slides.map((slide, i) => {
          const active = i === safeIndex;
          const showMedia = i === 0 || loadAll || active;
          const { lead, accent, tail } = splitAccent(slide.title);
          const TitleTag = i === 0 ? "h1" : "h2";
          const blur = blurCloudinaryUrl(slide.image);
          return (
            <div
              key={slide.key}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${active ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"}`}
              style={{ background: skin ? skin.panel : TINTS[i % TINTS.length] }}
              aria-hidden={!active}
              role="group"
              aria-roledescription="slide"
            >
              {/* Photo / video — fills the slide on phones, takes the start side with a diagonal cut on larger screens */}
              <div
                className="absolute inset-0 sm:inset-y-0 sm:end-auto sm:start-0 sm:w-[61%] overflow-hidden hero-cut [--hero-cut:5rem] lg:[--hero-cut:8.5rem]"
              >
                <div
                  className="absolute inset-0 will-change-transform transition-transform ease-out"
                  style={{
                    transform: active && !reducedMotion ? "scale(1)" : "scale(1.07)",
                    transitionDuration: active ? "7000ms" : "0ms",
                  }}
                >
                  {showMedia && slide.video ? (
                    <AutoplayVideo
                      src={optimizeCloudinaryVideoUrl(slide.video, 1440)}
                      preload={i === 0 ? "auto" : "metadata"}
                      poster={optimizeCloudinaryUrl(slide.image, 1440) || undefined}
                      className="h-full w-full object-cover"
                      style={{ objectPosition: slide.videoPosition || "50% 50%" }}
                    />
                  ) : showMedia && slide.image ? (
                    <>
                      {i === 0 && blur && (
                        <img
                          src={blur}
                          aria-hidden
                          className={`absolute inset-0 h-full w-full scale-110 object-cover transition-opacity duration-700 ${firstReady ? "opacity-0" : "opacity-100"}`}
                          style={{ objectPosition: slide.imagePosition || "center" }}
                        />
                      )}
                      <img
                        src={optimizeCloudinaryUrl(slide.image, 1440) || slide.image}
                        alt={slide.title}
                        className="h-full w-full object-cover"
                        style={{ objectPosition: slide.imagePosition || "center" }}
                        fetchPriority={i === 0 ? "high" : "low"}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        onLoad={i === 0 ? () => setFirstReady(true) : undefined}
                        onError={i === 0 ? () => setFirstReady(true) : undefined}
                      />
                    </>
                  ) : null}
                </div>
              </div>

              {/* Phone only: fade the photo into the panel colour on the text side */}
              <div
                className="absolute inset-0 sm:hidden"
                style={{
                  background: skin
                    ? `linear-gradient(to ${isAr ? "right" : "left"}, ${skin.night}f7 0%, ${skin.night}eb 36%, ${skin.night}8c 54%, transparent 74%)`
                    : `linear-gradient(to ${isAr ? "right" : "left"}, hsl(var(--blush) / 0.97) 0%, hsl(var(--blush) / 0.92) 36%, hsl(var(--blush) / 0.55) 54%, transparent 74%)`,
                }}
              />

              {/* Panel decoration */}
              {!skin && (
                <>
                  <LucerneMark
                    className="soft-float pointer-events-none absolute -end-4 -top-6 hidden h-44 w-auto text-berry/[0.09] sm:block lg:h-64"
                    style={{ ["--float-rot" as any]: isAr ? "10deg" : "-10deg" }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-24 end-[12%] hidden h-56 w-56 rounded-full bg-white/50 blur-3xl sm:block"
                  />
                </>
              )}

              {/* Copy */}
              <div className="absolute inset-y-0 end-0 flex w-[56%] items-center pe-4 ps-1 sm:w-[43%] sm:justify-center sm:pe-8 sm:ps-2 lg:pe-14">
                <div
                  key={active ? `on-${cycle}` : "off"}
                  className={`w-full max-w-[30rem] ${active ? "animate-in fade-in slide-in-from-bottom-3 duration-700" : ""}`}
                >
                  {slide.tag && (
                    <p
                      className="mb-2 inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.28em] text-berry sm:mb-4 sm:text-xs"
                      style={skin ? { color: skin.accent } : undefined}
                    >
                      <span className="h-px w-5 bg-current opacity-60 sm:w-8" />
                      {slide.tag}
                    </p>
                  )}
                  <TitleTag
                    className="text-balance text-[1.85rem] font-medium leading-[1.04] text-foreground sm:text-[clamp(2rem,3.9vw,3.75rem)] rtl:leading-[1.3]"
                    data-testid={i === 0 ? "text-hero-title" : undefined}
                    style={skin ? { color: skin.ink } : undefined}
                  >
                    {lead}
                    {accent && (
                      <em className="text-berry ltr:italic rtl:not-italic" style={skin ? { color: skin.accent } : undefined}>{accent}</em>
                    )}
                    {tail}
                  </TitleTag>
                  {slide.subtitle && (
                    <p
                      className="mt-2.5 line-clamp-3 text-[13px] leading-snug text-foreground/75 sm:mt-4 sm:text-[clamp(0.95rem,1.35vw,1.3rem)] sm:leading-relaxed font-heading"
                      data-testid={i === 0 ? "text-hero-subtitle" : undefined}
                      style={skin ? { color: skin.sub } : undefined}
                    >
                      {slide.subtitle}
                    </p>
                  )}
                  <div className="mt-3.5 flex flex-col items-start gap-2 sm:mt-7 sm:flex-row sm:flex-wrap sm:gap-4">
                    <Link
                      href={slide.primary.href}
                      tabIndex={active ? 0 : -1}
                      className="group inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-berry px-4 text-[12.5px] font-medium text-white shadow-[0_14px_30px_-14px_hsl(var(--berry)/0.9)] transition-all duration-300 hover:bg-[hsl(var(--berry-deep))] hover:shadow-[0_18px_34px_-14px_hsl(var(--berry)/1)] sm:h-[3.25rem] sm:px-8 sm:text-[15px]"
                      data-testid={i === 0 ? "button-shop-collection" : undefined}
                      style={skin ? { background: skin.accent, color: skin.night, boxShadow: "none" } : undefined}
                    >
                      {slide.primary.label}
                      <Arrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                    </Link>
                    {slide.secondary && (
                      <Link
                        href={slide.secondary.href}
                        tabIndex={active ? 0 : -1}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-berry/60 bg-white/55 px-4 text-[12.5px] font-medium text-foreground backdrop-blur-sm transition-colors duration-300 hover:border-berry hover:bg-white hover:text-berry sm:h-[3.25rem] sm:px-8 sm:text-[15px]"
                        style={skin ? { borderColor: `${skin.accent}99`, color: skin.ink, background: "rgba(255,255,255,.08)" } : undefined}
                      >
                        {slide.secondary.label}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Butterflies — or the season's own moving pieces while one is switched on */}
        <div className="pointer-events-none absolute inset-0 z-20">
          <HeroScene />
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(safeIndex - 1)}
              className="absolute start-3 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md transition-all hover:bg-berry hover:text-white sm:flex lg:start-6"
              aria-label={isAr ? "السابق" : "Previous slide"}
              data-testid="button-hero-prev"
            >
              <ChevronLeft className="h-5 w-5 rtl:-scale-x-100" />
            </button>
            <button
              type="button"
              onClick={() => go(safeIndex + 1)}
              className="absolute end-3 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md transition-all hover:bg-berry hover:text-white sm:flex lg:end-6"
              aria-label={isAr ? "التالي" : "Next slide"}
              data-testid="button-hero-next"
            >
              <ChevronRight className="h-5 w-5 rtl:-scale-x-100" />
            </button>

            {/* Dots — the active one is a little progress bar */}
            <div className="absolute bottom-3.5 start-4 z-30 flex items-center gap-2 sm:bottom-6 sm:start-auto sm:end-0 sm:w-[43%] sm:justify-center">
              {slides.map((s, i) => {
                const active = i === safeIndex;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`${isAr ? "الشريحة" : "Slide"} ${i + 1}`}
                    aria-current={active}
                    className={`relative h-2 overflow-hidden rounded-full transition-all duration-500 ${active ? "w-8 bg-berry/25" : "w-2 bg-foreground/25 hover:bg-foreground/45"}`}
                    style={skin ? { background: `${skin.ink}40` } : undefined}
                    data-testid={`button-hero-dot-${i}`}
                  >
                    {active && (
                      <span
                        key={`${cycle}-${paused}`}
                        className={`absolute inset-0 rounded-full bg-berry ${paused || reducedMotion ? "" : "hero-progress"}`}
                        style={{ animationDuration: `${SLIDE_MS}ms`, ...(skin ? { background: skin.accent } : {}) }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
