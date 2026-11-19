import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { BrandButterfly } from "@/components/ui/BrandButterfly";
import { useLanguage } from "@/i18n";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { SEASONS, SEASON_FONT_URL, getActiveTheme, daysUntil, type SeasonalTheme, type SeasonInfo } from "@/lib/seasonal";

/* Seasonal atmospheres. Each season is a palette, a light and ONE signature object drawn in fine line-work that
   matches the boutique's hairline typography:
     Christmas  — Bethlehem night: a glowing star and olive branches
     Eid al-Fitr — dusk: a thin hilal, hanging fanous lanterns, a star-pattern border
     Eid al-Adha — a pointed-arch arcade and a saffron sun rising behind a domed skyline
   Everything is decoration only: pointer-events-none, aria-hidden, animated with transforms/opacity (cheap on
   phones), kept below the navigation so it never covers a link, and switched off for reduced motion. */

const CSS = `
@keyframes sx-fall { 0%{transform:translate3d(0,0,0)} 50%{transform:translate3d(14px,34vh,0)} 100%{transform:translate3d(-8px,72vh,0)} }
@keyframes sx-sway { 0%{transform:rotate(-3.5deg)} 100%{transform:rotate(3.5deg)} }
@keyframes sx-twinkle { 0%,100%{opacity:1} 50%{opacity:.18} }
@keyframes sx-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes sx-breathe { 0%,100%{opacity:.72;transform:scale(.95)} 50%{opacity:1;transform:scale(1.05)} }
@keyframes sx-flake { 0%{transform:translate3d(0,0,0) rotate(0)} 100%{transform:translate3d(46px,640px,0) rotate(260deg)} }
@keyframes sx-lift { 0%{transform:translate3d(0,0,0);opacity:0} 10%{opacity:.95} 82%{opacity:.8} 100%{transform:translate3d(28px,-620px,0);opacity:0} }
@keyframes sx-run { from{transform:translate3d(-14vw,0,0)} to{transform:translate3d(112vw,0,0)} }
@keyframes sx-hop { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3.5px)} }
@keyframes sx-leg { 0%,100%{transform:rotate(26deg)} 50%{transform:rotate(-26deg)} }
@keyframes sx-rise { 0%{transform:translateY(0);opacity:0} 18%{opacity:.85} 100%{transform:translateY(-110px);opacity:0} }
.sx-sway{transform-origin:50% 0;animation:sx-sway 5.5s ease-in-out infinite alternate}
.sx-float{animation:sx-float 8s ease-in-out infinite}
.sx-ar{font-family:'Aref Ruqaa','Noto Sans Arabic',serif}
.sx-en{font-family:var(--font-display,'Cormorant Garamond',serif);font-style:italic}
@media (prefers-reduced-motion: reduce){ .sx-anim,.sx-sway,.sx-float{animation:none!important} }
`;

/** Loads the calligraphic greeting font — only while a season is actually on, so it costs nothing the rest of the year. */
function useSeasonFont() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("sx-font")) return;
    const l = document.createElement("link");
    l.id = "sx-font";
    l.rel = "stylesheet";
    l.href = SEASON_FONT_URL;
    document.head.appendChild(l);
  }, []);
}

const uid = () => useId().replace(/:/g, "");

/* ── Shared ornaments ─────────────────────────────────────────────────────── */

/** Eight-pointed star (khatam): two squares, one turned 45°. Used inside <svg> only. */
function Star8({ s, fill }: { s: number; fill: string }) {
  return (
    <g fill={fill}>
      <rect x={-s} y={-s} width={s * 2} height={s * 2} />
      <rect x={-s} y={-s} width={s * 2} height={s * 2} transform="rotate(45)" />
    </g>
  );
}

function Flourish({ color }: { color: string }) {
  return (
    <svg width="150" height="14" viewBox="0 0 150 14" aria-hidden>
      <line x1="2" y1="7" x2="58" y2="7" stroke={color} strokeOpacity=".6" strokeWidth="1" />
      <line x1="92" y1="7" x2="148" y2="7" stroke={color} strokeOpacity=".6" strokeWidth="1" />
      <circle cx="64" cy="7" r="1.3" fill={color} />
      <circle cx="86" cy="7" r="1.3" fill={color} />
      <g transform="translate(75 7)"><Star8 s={3.6} fill={color} /></g>
    </svg>
  );
}

/* ── Christmas: Bethlehem night ───────────────────────────────────────────── */

/** The Star of Bethlehem: four long rays, four short ones, a breathing halo. */
export function BethlehemStar({ size, glow, core }: { size: number; glow: string; core: string }) {
  const id = uid();
  const RAYS = "M0,-56 L3.6,-3.6 L56,0 L3.6,3.6 L0,56 L-3.6,3.6 L-56,0 L-3.6,-3.6Z";
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`h${id}`}>
          <stop offset="0" stopColor={glow} stopOpacity=".85" />
          <stop offset=".3" stopColor={glow} stopOpacity=".26" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`r${id}`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor={core} />
          <stop offset=".5" stopColor="#ffffff" />
          <stop offset="1" stopColor={core} />
        </linearGradient>
      </defs>
      <circle r="60" fill={`url(#h${id})`} className="sx-anim" style={{ animation: "sx-breathe 5s ease-in-out infinite", transformOrigin: "0 0" }} />
      <path d={RAYS} fill={`url(#r${id})`} />
      <path d={RAYS} fill={core} opacity=".85" transform="rotate(45) scale(.5)" className="sx-anim" style={{ animation: "sx-twinkle 3.4s ease-in-out infinite" }} />
      <circle r="5" fill="#ffffff" />
    </svg>
  );
}

/** An olive branch (a local nod): leaves along a drooping stem, a few candle-lit berries. */
function OliveBranch({ width, leafA, leafB, berry, fluid }: { width: number; leafA: string; leafB: string; berry: string; fluid?: boolean }) {
  const { leaves, berries } = useMemo(() => {
    const P0 = [6, 4], P1 = [96, 2], P2 = [162, 66];
    const pt = (t: number) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
    const tan = (t: number) => [2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])];
    const leaves: { x: number; y: number; a: number; s: number; c: number }[] = [];
    const berries: { x: number; y: number }[] = [];
    for (let i = 0; i < 11; i++) {
      const t = 0.07 + i * 0.088;
      const [x, y] = pt(t);
      const [dx, dy] = tan(t);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const s = 1.15 - 0.55 * t;
      leaves.push({ x, y, a: ang - 52, s, c: i % 2 });
      leaves.push({ x, y, a: ang + 52, s, c: (i + 1) % 2 });
      if (i % 4 === 2) {
        const len = Math.hypot(dx, dy) || 1;
        berries.push({ x: x + (-dy / len) * 9 * s, y: y + (dx / len) * 9 * s });
      }
    }
    const [tx, ty] = pt(1);
    leaves.push({ x: tx, y: ty, a: Math.atan2(...(tan(1).reverse() as [number, number])) * 180 / Math.PI, s: 0.6, c: 0 });
    return { leaves, berries };
  }, []);
  return (
    <svg width={fluid ? "100%" : width} height={fluid ? undefined : width * 0.53} viewBox="0 0 190 100" aria-hidden style={{ overflow: "visible", display: "block" }}>
      <path d="M6 4 Q96 2 162 66" fill="none" stroke="#8a7650" strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.a.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
          <ellipse cx="10" cy="0" rx="10" ry="3.4" fill={l.c ? leafB : leafA} />
          <path d="M0 0 L19 0" stroke="#ffffff" strokeOpacity=".22" strokeWidth=".8" />
        </g>
      ))}
      {berries.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r="5" fill={berry} opacity=".22" />
          <circle cx={b.x} cy={b.y} r="2.6" fill={berry} />
        </g>
      ))}
    </svg>
  );
}

/** Soft warm lights near the bottom — bokeh, not cartoon bulbs. */
function Bokeh({ color }: { color: string }) {
  const dots = [[6, 8, 46], [15, 3, 30], [27, 12, 38], [41, 2, 26], [58, 9, 42], [71, 4, 30], [84, 11, 48], [93, 2, 28]];
  return (
    <>
      {dots.map(([left, bottom, size], i) => (
        <span
          key={i}
          className="sx-anim absolute rounded-full"
          style={{
            left: `${left}%`, bottom: `${bottom}%`, width: size, height: size,
            background: `radial-gradient(circle, ${color}cc 0%, ${color}52 36%, ${color}00 70%)`,
            mixBlendMode: "screen",
            animation: `sx-breathe ${4 + (i % 4)}s ease-in-out ${i * 0.5}s infinite`,
          }}
        />
      ))}
    </>
  );
}

function Snow({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const size = 2 + (i % 3);
        return (
          <span
            key={i}
            className="sx-anim absolute rounded-full bg-white"
            style={{
              left: `${(i * 37) % 100}%`, top: 0, width: size, height: size,
              opacity: 0.4 + ((i * 13) % 40) / 100,
              animation: `sx-fall ${9 + ((i * 7) % 9)}s linear ${-((i * 5) % 12)}s infinite`,
            }}
          />
        );
      })}
    </>
  );
}

/* ── Eid pieces ───────────────────────────────────────────────────────────── */

/** A thin hilal (crescent) with its star. */
export function Hilal({ size, gold, glow }: { size: number; gold: string; glow: string }) {
  const id = uid();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ filter: `drop-shadow(0 0 14px ${glow}b3)` }}>
      <defs>
        <mask id={`m${id}`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="63" cy="43" r="33" fill="#000" />
        </mask>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="1" stopColor={gold} />
        </linearGradient>
      </defs>
      <circle cx="48" cy="54" r="37" fill={`url(#g${id})`} mask={`url(#m${id})`} />
      <g transform="translate(79 27)"><Star8 s={5.4} fill="#fff3cf" /></g>
    </svg>
  );
}

/** A fanous: line-art lantern with a warm light inside. */
function Fanous({ size, gold, glow }: { size: number; gold: string; glow: string }) {
  const id = uid();
  return (
    <svg width={size} height={size * 2.2} viewBox="0 0 60 132" aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`f${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={glow} stopOpacity=".9" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1cc" stopOpacity=".95" />
          <stop offset="1" stopColor={glow} stopOpacity=".7" />
        </linearGradient>
      </defs>
      <circle cx="30" cy="74" r="40" fill={`url(#f${id})`} className="sx-anim" style={{ animation: "sx-breathe 3.6s ease-in-out infinite", transformOrigin: "30px 74px" }} />
      <line x1="30" y1="0" x2="30" y2="24" stroke={gold} strokeOpacity=".8" strokeWidth="1.2" />
      <circle cx="30" cy="26" r="2.6" fill="none" stroke={gold} strokeWidth="1.2" />
      <path d="M17 45 Q17 32 30 28 Q43 32 43 45 Z" fill={gold} fillOpacity=".92" />
      <path d="M16 46 H44 L50 80 Q50 94 42 100 H18 Q10 94 10 80 Z" fill={`url(#b${id})`} stroke={gold} strokeWidth="1.3" />
      <path d="M30 46 V100 M23 46 L19 100 M37 46 L41 100" stroke={gold} strokeOpacity=".45" strokeWidth="1" fill="none" />
      <path d="M12 66 H48" stroke={gold} strokeOpacity=".7" strokeWidth="1.1" />
      <g transform="translate(30 83)"><Star8 s={4.5} fill="#7c4a03" /></g>
      <g transform="translate(30 55)"><Star8 s={3} fill="#7c4a03" /></g>
      <path d="M16 100 H44 L40 110 H20 Z" fill={gold} />
      <line x1="30" y1="110" x2="30" y2="124" stroke={gold} strokeWidth="1.2" />
      <circle cx="30" cy="127" r="2.8" fill={gold} />
    </svg>
  );
}

/** Hangs something from the top edge on a visible chain; the whole thing sways gently. */
function Hanging({ chain, delay, gold, className, children }: { chain: number; delay: string; gold: string; className: string; children: ReactNode }) {
  return (
    <div className={`sx-sway absolute -top-1 flex flex-col items-center ${className}`} style={{ animationDelay: delay }}>
      <div style={{ width: 1, height: chain, background: `linear-gradient(to bottom, transparent, ${gold}aa)` }} />
      {children}
    </div>
  );
}

function Twinkles({ count, color }: { count: number; color: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          className="sx-anim absolute"
          width={7 + (i % 3) * 4}
          height={7 + (i % 3) * 4}
          viewBox="-9 -9 18 18"
          aria-hidden
          style={{
            // Only the outer margins, so a sparkle never lands on the headline or the buttons.
            left: i % 2 ? `${3 + ((i * 7) % 19)}%` : `${78 + ((i * 5) % 19)}%`,
            top: `${(i * 29 + 6) % 70}%`,
            animation: `sx-twinkle ${2.2 + (i % 4) * 0.7}s ease-in-out ${(i % 5) * 0.5}s infinite`,
          }}
        >
          <path d="M0,-8 Q1,-1 8,0 Q1,1 0,8 Q-1,1 -8,0 Q-1,-1 0,-8Z" fill={color} />
        </svg>
      ))}
    </>
  );
}

/** A band of eight-pointed stars along the bottom edge, fading upwards. */
function KhatamBand({ gold }: { gold: string }) {
  const id = uid();
  return (
    <svg className="absolute bottom-0 inset-x-0 w-full h-10" aria-hidden>
      <defs>
        <pattern id={`p${id}`} width="34" height="34" patternUnits="userSpaceOnUse">
          <g transform="translate(17 17)" fill="none" stroke={gold} strokeWidth="1">
            <rect x="-8" y="-8" width="16" height="16" />
            <rect x="-8" y="-8" width="16" height="16" transform="rotate(45)" />
            <circle r="2" fill={gold} stroke="none" />
          </g>
        </pattern>
        <linearGradient id={`f${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`k${id}`}><rect width="100%" height="100%" fill={`url(#f${id})`} /></mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p${id})`} mask={`url(#k${id})`} opacity=".7" />
    </svg>
  );
}

/* ── Eid al-Adha: arcade + sunrise ────────────────────────────────────────── */

/** A row of pointed arches with a small lamp under each apex. */
export function Arcade({ gold, glow, height = 56 }: { gold: string; glow: string; height?: number }) {
  const id = uid();
  return (
    <svg className="absolute top-0 inset-x-0 w-full" height={height} aria-hidden>
      <defs>
        <pattern id={`p${id}`} width="112" height="58" patternUnits="userSpaceOnUse">
          <path d="M6 58 V30 C6 16 34 8 56 0 C78 8 106 16 106 30 V58" fill="rgba(5,47,42,.34)" stroke={gold} strokeOpacity=".62" strokeWidth="1.2" />
          <path d="M17 58 V32 C17 23 38 16 56 10 C74 16 95 23 95 32 V58" fill="none" stroke={gold} strokeOpacity=".28" strokeWidth="1" />
          <line x1="56" y1="10" x2="56" y2="19" stroke={gold} strokeOpacity=".7" strokeWidth="1" />
          <circle cx="56" cy="23" r="6" fill={glow} fillOpacity=".25" />
          <circle cx="56" cy="23" r="2.6" fill={glow} />
        </pattern>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`m${id}`}><rect width="100%" height="100%" fill={`url(#f${id})`} /></mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p${id})`} mask={`url(#m${id})`} />
    </svg>
  );
}

/** Two layers of domes and minarets for depth. */
function Skyline({ back, front, edge }: { back: string; front: string; edge: string }) {
  return (
    <svg className="absolute bottom-0 inset-x-0 w-full h-16 sm:h-auto sm:max-h-44" viewBox="0 0 1200 120" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path
        d="M0 120 V100 H80 V92 H150 V100 H240 V84 Q272 44 304 84 V100 H380 V50 L385 38 L390 50 V100 H470 V94 H520 V80 Q548 42 576 80 V94 H650 V100 H720 V70 Q752 26 784 70 V100 H870 V46 L875 36 L880 46 V100 H950 V88 Q980 52 1010 88 V100 H1090 V94 H1150 V104 H1200 V120 Z"
        fill={back}
      />
      <path
        d="M0 120 V98 H70 V88 H130 V98 H210 V80 Q240 38 270 80 V98 H330 V40 L336 28 L342 40 V98 H420 V90 H470 V74 Q500 30 530 74 V90 H610 V98 H660 V60 Q690 16 720 60 V98 H790 V40 L796 28 L802 40 V98 H870 V84 Q900 46 930 84 V98 H1010 V92 H1080 V82 H1140 V98 H1200 V120 Z"
        fill={front}
        stroke={edge}
        strokeOpacity=".4"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** A saffron sun with thin rings, half hidden behind the skyline. */
function SunDisc({ glow, gold }: { glow: string; gold: string }) {
  return (
    <div className="absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2 bottom-[-120px] sm:bottom-[-150px] w-[300px] h-[300px] sm:w-[400px] sm:h-[400px]">
      <div className="absolute inset-0 rounded-full sx-anim" style={{ background: `radial-gradient(circle, ${glow}cc 0%, ${glow}55 38%, ${glow}00 68%)`, animation: "sx-breathe 7s ease-in-out infinite" }} />
      <div className="absolute inset-[22%] rounded-full border" style={{ borderColor: `${gold}55` }} />
      <div className="absolute inset-[10%] rounded-full border" style={{ borderColor: `${gold}2e` }} />
    </div>
  );
}

/** Slow golden motes drifting up through the scene. */
function Motes({ color }: { color: string }) {
  return (
    <>
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className="sx-anim absolute rounded-full"
          style={{
            left: `${(i * 41 + 8) % 94}%`, bottom: `${6 + ((i * 17) % 30)}%`,
            width: 3 + (i % 3), height: 3 + (i % 3), background: color,
            animation: `sx-rise ${7 + (i % 5)}s ease-out ${-(i * 1.3)}s infinite`,
          }}
        />
      ))}
    </>
  );
}

/* ── Countdown ────────────────────────────────────────────────────────────── */

function countdownParts(days: number | null, info: SeasonInfo, ar: boolean): { num?: string; text: string } | null {
  if (days === null || days < 0) return null;
  const ev = ar ? info.eventAr : info.eventEn;
  if (days === 0) return { text: ar ? `اليوم ${ev}` : `${ev} is today` };
  if (days === 1) return { text: ar ? `غداً ${ev}` : `${ev} is tomorrow` };
  if (days === 2) return { text: ar ? `يومان على ${ev}` : `2 days until ${ev}` };
  return { num: String(days), text: ar ? `${days >= 11 ? "يوماً" : "أيام"} على ${ev}` : `days until ${ev}` };
}

/* ── Hero scene ───────────────────────────────────────────────────────────────
   The landing hero and the category banners share one "scene" layer.
   No season: the boutique's own butterflies drift across the banner.
   Season on: the banner's text panel takes the season's night colours and the
   butterflies hand over to that season's own moving pieces —
     Christmas   — falling snow and snowflakes, swinging baubles, the star, a snowdrift
     Eid al-Fitr — the hilal, swinging fanous lanterns, paper lanterns rising into the dusk
     Eid al-Adha — a little flock of sheep trotting over the hills at sunrise            */

export interface SeasonSkin {
  season: SeasonalTheme;
  info: SeasonInfo;
  /** Background of the banner's text panel. */
  panel: string;
  night: string;
  ink: string;
  sub: string;
  accent: string;
}

/** Colours a banner should wear while a season is switched on (null = the normal look). */
export function useSeasonSkin(): SeasonSkin | null {
  const { data: settings } = useSiteSettings();
  const season = getActiveTheme(settings);
  if (!season) return null;
  const info = SEASONS[season];
  const p = info.palette;
  return {
    season,
    info,
    panel: `radial-gradient(120% 90% at 85% 0%, ${p.deep} 0%, ${p.night} 70%)`,
    night: p.night,
    ink: p.light,
    sub: `${p.light}cc`,
    accent: p.gold,
  };
}

/* Butterflies: each follows its own slow wandering path (layered sines), turns to
   face the way it flies and beats its wings with a soft 3D fold. One shared
   animation frame drives them all; they stop while the tab is hidden. */
interface Flyer { size: number; speed: number; opacity: number; cx: number; cy: number; ax: number; ay: number; f: [number, number, number, number]; ph: [number, number, number, number] }
const FLYERS: Flyer[] = [
  { size: 60, speed: 1.0, opacity: 0.95, cx: 62, cy: 40, ax: 26, ay: 26, f: [0.093, 0.221, 0.117, 0.263], ph: [1.4, 4.2, 0.6, 2.1] },
  { size: 42, speed: 1.3, opacity: 0.85, cx: 34, cy: 34, ax: 24, ay: 22, f: [0.081, 0.197, 0.131, 0.241], ph: [3.9, 0.8, 2.7, 5.1] },
  { size: 50, speed: 0.85, opacity: 0.9, cx: 78, cy: 62, ax: 16, ay: 22, f: [0.071, 0.183, 0.122, 0.251], ph: [0.2, 3.3, 1.8, 4.7] },
  { size: 34, speed: 1.55, opacity: 0.8, cx: 48, cy: 66, ax: 30, ay: 18, f: [0.113, 0.207, 0.097, 0.229], ph: [2.6, 5.4, 3.5, 0.4] },
  { size: 38, speed: 1.15, opacity: 0.82, cx: 18, cy: 58, ax: 13, ay: 24, f: [0.087, 0.191, 0.109, 0.237], ph: [4.8, 1.6, 5.9, 3.0] },
];

export function FlyingButterflies({ count = 5 }: { count?: number }) {
  const flyers = FLYERS.slice(0, count);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const midRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flapRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let w = layer.clientWidth;
    let h = layer.clientHeight;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { w = layer.clientWidth; h = layer.clientHeight; }) : null;
    ro?.observe(layer);

    const pos = (c: Flyer, t: number) => ({
      x: c.cx + c.ax * Math.sin(t * c.f[0] + c.ph[0]) + c.ax * 0.33 * Math.sin(t * c.f[1] + c.ph[1]),
      y: c.cy + c.ay * Math.sin(t * c.f[2] + c.ph[2]) + c.ay * 0.33 * Math.sin(t * c.f[3] + c.ph[3]),
    });
    const flap = flyers.map((_, i) => i * 1.7);
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        for (let i = 0; i < flyers.length; i++) {
          const c = flyers[i];
          const t = ((now - t0) / 1000) * c.speed + 40;
          const p = pos(c, t);
          const q = pos(c, t + 0.04);
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const dir = dx >= 0 ? 1 : -1;
          const tilt = Math.max(-15, Math.min(15, dy * 85));
          flap[i] += 2 * Math.PI * (0.9 + 12 / c.size + Math.min(1.4, (Math.hypot(dx, dy) / 0.04) * 0.09)) * c.speed * dt;
          const wrap = wrapRefs.current[i];
          const mid = midRefs.current[i];
          const fl = flapRefs.current[i];
          if (wrap) wrap.style.transform = `translate3d(${(p.x / 100) * w - c.size / 2}px, ${(p.y / 100) * h - c.size / 2}px, 0)`;
          if (mid) mid.style.transform = `scaleX(${dir}) rotate(${tilt}deg)`;
          if (fl) fl.style.transform = `rotateY(${Math.sin(flap[i]) * 46 + 8}deg)`;
        }
      }
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [flyers.length]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="hero-butterflies">
      {flyers.map((c, i) => (
        <div key={i} ref={(el) => { wrapRefs.current[i] = el; }} className={`absolute left-0 top-0 will-change-transform ${i > 2 ? "hidden sm:block" : ""}`} style={{ opacity: c.opacity }}>
          <div ref={(el) => { midRefs.current[i] = el; }} style={{ perspective: 300 }} className="[zoom:.6] sm:[zoom:1]">
            <div ref={(el) => { flapRefs.current[i] = el; }} style={{ width: c.size, height: c.size * 0.78, filter: `drop-shadow(0 ${c.size * 0.14}px ${c.size * 0.18}px rgba(74,24,43,.18))` }}>
              <BrandButterfly className="h-full w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Christmas pieces ── */

function Bauble({ size, color, shine }: { size: number; color: string; shine: string }) {
  const id = uid();
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 40 50" aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`b${id}`} cx="35%" cy="32%" r="75%">
          <stop offset="0" stopColor={shine} />
          <stop offset=".45" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity=".82" />
        </radialGradient>
      </defs>
      <rect x="16" y="2" width="8" height="7" rx="1.5" fill="#E8C777" />
      <circle cx="20" cy="29" r="18" fill={`url(#b${id})`} />
      <path d="M4 26 Q20 34 36 26" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" />
      <path d="M5 32 Q20 40 35 32" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="1" />
      <ellipse cx="13" cy="21" rx="4" ry="6" fill="#fff" opacity=".35" transform="rotate(-28 13 21)" />
    </svg>
  );
}

function Snowflakes({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const size = 12 + (i % 3) * 6;
        return (
          <svg
            key={i}
            className="sx-anim absolute"
            width={size}
            height={size}
            viewBox="-12 -12 24 24"
            aria-hidden
            style={{ left: `${(i * 23 + 9) % 96}%`, top: -24, opacity: 0.55 + (i % 3) * 0.15, animation: `sx-flake ${11 + ((i * 5) % 8)}s linear ${-((i * 3.7) % 14)}s infinite` }}
          >
            <g stroke="#fff" strokeWidth="1.3" strokeLinecap="round" fill="none">
              {[0, 60, 120].map((a) => (
                <g key={a} transform={`rotate(${a})`}>
                  <path d="M0 -10 V10 M-3 -7 L0 -4 L3 -7 M-3 7 L0 4 L3 7" />
                </g>
              ))}
            </g>
          </svg>
        );
      })}
    </>
  );
}

function SnowDrift() {
  return (
    <svg className="absolute inset-x-0 bottom-0 h-7 w-full sm:h-10" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden>
      <path d="M0 40 V22 Q120 4 260 18 T520 14 T800 20 T1040 10 T1200 18 V40Z" fill="#fff" opacity=".55" />
      <path d="M0 40 V30 Q160 14 330 26 T640 22 T930 28 T1200 22 V40Z" fill="#fff" />
    </svg>
  );
}

/* ── Eid al-Fitr pieces ── */

/** Small paper lanterns let go into the evening sky. */
function SkyLanterns({ glow, gold }: { glow: string; gold: string }) {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => {
        const size = 14 + (i % 3) * 6;
        return (
          <svg
            key={i}
            className={`sx-anim absolute ${i > 3 ? "hidden sm:block" : ""}`}
            width={size}
            height={size * 1.3}
            viewBox="0 0 20 26"
            aria-hidden
            style={{ left: `${(i * 29 + 6) % 92}%`, bottom: -30, filter: `drop-shadow(0 0 8px ${glow})`, animation: `sx-lift ${13 + ((i * 3) % 8)}s ease-in ${-((i * 4.3) % 16)}s infinite` }}
          >
            <path d="M3 2 H17 L19 18 Q19 22 15 22 H5 Q1 22 1 18 Z" fill={glow} opacity=".9" />
            <path d="M3 2 H17 L18 8 H2 Z" fill="#fff" opacity=".3" />
            <rect x="7" y="22" width="6" height="2.4" rx="1" fill={gold} />
          </svg>
        );
      })}
    </>
  );
}

/* ── Eid al-Adha pieces ── */

function Sheep({ size, wool = "#FFFDF7" }: { size: number; wool?: string }) {
  const leg = (x: number, delay: string) => (
    <rect x={x} y="34" width="3.2" height="14" rx="1.6" fill="#3B2A2E" className="sx-anim" style={{ transformBox: "fill-box", transformOrigin: "50% 0%", animation: `sx-leg .46s ease-in-out ${delay} infinite` }} />
  );
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 72 52" aria-hidden style={{ overflow: "visible" }}>
      <g className="sx-anim" style={{ animation: "sx-hop .46s ease-in-out infinite" }}>
        {leg(18, "0s")}
        {leg(25, "-.23s")}
        {leg(40, "-.23s")}
        {leg(47, "0s")}
        <circle cx="12" cy="24" r="4.5" fill={wool} />
        <g fill={wool} stroke="#E9DFCF" strokeWidth=".8">
          <circle cx="22" cy="26" r="11" />
          <circle cx="34" cy="21" r="12.5" />
          <circle cx="46" cy="26" r="11" />
          <circle cx="28" cy="32" r="9.5" />
          <circle cx="40" cy="32" r="9.5" />
        </g>
        <ellipse cx="57" cy="21" rx="7.5" ry="6.5" fill="#3B2A2E" />
        <ellipse cx="51.5" cy="16" rx="2.2" ry="4.2" fill="#3B2A2E" transform="rotate(-38 51.5 16)" />
        <circle cx="53" cy="13" r="5" fill={wool} />
        <circle cx="59.5" cy="19.5" r="1.1" fill="#fff" />
      </g>
    </svg>
  );
}

/** Soft hills with a little flock trotting across them, one after the other. */
function Flock({ deep, night, gold }: { deep: string; night: string; gold: string }) {
  const flock = [
    { size: 62, dur: 17, delay: 0, lift: 6 },
    { size: 44, dur: 17, delay: -1.5, lift: 4 },
    { size: 70, dur: 23, delay: -9, lift: 7 },
    { size: 36, dur: 14, delay: -6, lift: 3 },
    { size: 52, dur: 20, delay: -14, lift: 5 },
  ];
  return (
    <>
      <svg className="absolute inset-x-0 bottom-0 h-9 w-full sm:h-14" viewBox="0 0 1200 56" preserveAspectRatio="none" aria-hidden>
        <path d="M0 56 V30 Q150 2 330 22 T660 16 T960 24 T1200 12 V56Z" fill={deep} opacity=".55" />
        <path d="M0 56 V40 Q200 18 420 34 T820 30 T1200 34 V56Z" fill={night} stroke={gold} strokeOpacity=".45" strokeWidth="1.2" />
      </svg>
      {flock.map((s, i) => (
        <div
          key={i}
          className={`sx-anim absolute left-0 ${i > 2 ? "hidden sm:block" : ""}`}
          style={{ bottom: s.lift, animation: `sx-run ${s.dur}s linear ${s.delay}s infinite` }}
        >
          <div className="origin-bottom scale-[.62] sm:scale-100">
            <Sheep size={s.size} />
          </div>
        </div>
      ))}
    </>
  );
}

/** The season's greeting, set small at the top of the banner's text panel. */
function SceneGreeting({ skin, countdownDate }: { skin: SeasonSkin; countdownDate?: string }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const p = skin.info.palette;
  const cd = countdownParts(daysUntil(countdownDate), skin.info, ar);
  return (
    <div className="absolute end-0 top-2 flex w-[58%] flex-col items-center gap-1 px-2 text-center sm:top-4 sm:w-[43%] sm:gap-1.5" data-testid="seasonal-greeting">
      <div className={ar ? "sx-ar text-[19px] leading-[1.3] sm:text-[30px]" : "sx-en text-[19px] leading-[1.1] sm:text-[30px]"} style={{ color: p.gold, textShadow: `0 2px 18px ${p.night}` }}>
        {ar ? skin.info.titleAr : skin.info.titleEn}
      </div>
      {cd && (
        <div
          className="inline-flex items-baseline gap-1.5 rounded-full border px-3 py-0.5 text-[10px] font-medium sm:text-xs"
          style={{ color: p.light, background: `${p.night}b3`, borderColor: `${p.gold}66` }}
          data-testid="seasonal-countdown"
        >
          {cd.num && <b className="ltr-num text-sm font-semibold leading-none sm:text-base" style={{ color: p.gold }}>{cd.num}</b>}
          <span>{cd.text}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The moving layer of a banner: butterflies normally, the season's pieces when one is on.
 * `compact` is for the shorter category banners (fewer pieces, no greeting).
 */
export function HeroScene({ compact = false }: { compact?: boolean }) {
  const { data: settings } = useSiteSettings();
  const skin = useSeasonSkin();
  if (!skin) return <FlyingButterflies count={compact ? 3 : 5} />;
  return <SeasonScene skin={skin} compact={compact} countdownDate={settings?.seasonal_countdown_date} />;
}

function SeasonScene({ skin, compact, countdownDate }: { skin: SeasonSkin; compact: boolean; countdownDate?: string }) {
  useSeasonFont();
  const { season } = skin;
  const p = skin.info.palette;
  const s = compact ? "scale-[.5] sm:scale-75" : "scale-[.55] sm:scale-100";
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="seasonal-hero-overlay" data-season={season}>
      <style>{CSS}</style>

      {season === "christmas" && (
        <>
          <Snow count={compact ? 12 : 22} />
          <Snowflakes count={compact ? 4 : 8} />
          <div className="absolute start-0 top-0 w-[110px] opacity-95 sm:w-[220px] rtl:-scale-x-100">
            <OliveBranch width={220} leafA="#6FAE86" leafB="#2F6F54" berry="#C43A52" fluid />
          </div>
          <div className="sx-float absolute -top-1 end-[2%] sm:end-[3%]">
            <div className={`origin-top ${s}`}><BethlehemStar size={108} glow={p.glow} core={p.gold} /></div>
          </div>
          <Hanging className="end-[37%] hidden sm:flex" chain={compact ? 10 : 26} delay="-1.1s" gold={p.gold}><Bauble size={30} color="#B8324A" shine="#F3A3B0" /></Hanging>
          <Hanging className="end-[31%] hidden md:flex" chain={compact ? 34 : 70} delay="-2.6s" gold={p.gold}><Bauble size={22} color="#D9B45B" shine="#FFF0C2" /></Hanging>
          <Hanging className="end-[13%] hidden sm:flex" chain={compact ? 4 : 12} delay="-.4s" gold={p.gold}><Bauble size={24} color="#F4ECDD" shine="#FFFFFF" /></Hanging>
          <Hanging className="start-[26%] hidden lg:flex" chain={18} delay="-3.3s" gold={p.gold}><Bauble size={26} color="#B8324A" shine="#F3A3B0" /></Hanging>
          <SnowDrift />
        </>
      )}

      {season === "eid_fitr" && (
        <>
          <SkyLanterns glow={p.glow} gold={p.gold} />
          <div className="sx-float absolute top-1 end-[3%] sm:top-2">
            <div className={`origin-top ${s}`}><Hilal size={96} gold={p.gold} glow={p.glow} /></div>
          </div>
          <Hanging className="end-[37%] hidden sm:flex" chain={compact ? 6 : 22} delay="-1.1s" gold={p.gold}><Fanous size={compact ? 24 : 34} gold={p.gold} glow={p.glow} /></Hanging>
          <Hanging className="end-[14%] hidden md:flex" chain={compact ? 2 : 8} delay="-2.7s" gold={p.gold}><Fanous size={compact ? 18 : 24} gold={p.gold} glow={p.glow} /></Hanging>
          <Hanging className="start-[3%]" chain={compact ? 8 : 30} delay="-.5s" gold={p.gold}><div className="origin-top scale-[.6] sm:scale-100"><Fanous size={compact ? 26 : 38} gold={p.gold} glow={p.glow} /></div></Hanging>
          <Hanging className="start-[13%] hidden lg:flex" chain={compact ? 22 : 58} delay="-3.6s" gold={p.gold}><Fanous size={26} gold={p.gold} glow={p.glow} /></Hanging>
          <KhatamBand gold={p.gold} />
        </>
      )}

      {season === "eid_adha" && (
        <>
          <div className="absolute inset-y-0 end-0 w-[58%] overflow-hidden sm:w-[43%]">
            <SunDisc glow={p.glow} gold={p.gold} />
            <Motes color={p.glow} />
          </div>
          {!compact && <Arcade gold={p.gold} glow={p.glow} height={40} />}
          <Flock deep={p.deep} night={p.night} gold={p.gold} />
        </>
      )}

      {!compact && <SceneGreeting skin={skin} countdownDate={countdownDate} />}
    </div>
  );
}

/** Kept for older call sites: the landing hero's scene. */
export function SeasonalHeroOverlay() {
  return <HeroScene />;
}

/** Small ornament that sits on the corner of the navbar logo: the star of Bethlehem or a thin hilal. */
export function SeasonalLogoAccent() {
  const { data: settings } = useSiteSettings();
  const season = getActiveTheme(settings);
  if (!season) return null;
  const p = SEASONS[season].palette;
  return (
    <span className="pointer-events-none absolute -top-3 -end-4" aria-hidden="true" data-testid="seasonal-logo-accent" data-season={season}>
      {season === "christmas" ? <BethlehemStar size={22} glow={p.glow} core={p.gold} /> : <Hilal size={22} gold={p.gold} glow={p.glow} />}
    </span>
  );
}

/** Themed greeting band shown just above the footer. */
export function SeasonalFooterStrip() {
  const { data: settings } = useSiteSettings();
  const season = getActiveTheme(settings);
  if (!season) return null;
  return <FooterInner season={season} />;
}

function FooterInner({ season }: { season: SeasonalTheme }) {
  const { language } = useLanguage();
  useSeasonFont();
  const info = SEASONS[season];
  const p = info.palette;
  const ar = language === "ar";
  return (
    <div className="relative w-full py-5 sm:py-6 text-center" style={{ background: info.barBg, color: info.barText }} data-testid="seasonal-footer-strip" data-season={season}>
      <style>{CSS}</style>
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p.gold}, transparent)` }} />
      <div className={ar ? "sx-ar text-xl sm:text-2xl" : "sx-en text-xl sm:text-2xl"} style={{ color: p.light }}>{ar ? info.titleAr : info.titleEn}</div>
      <div className="flex justify-center my-1"><Flourish color={p.gold} /></div>
      <div className="text-[11px] sm:text-xs opacity-80">{ar ? info.subAr : info.subEn}</div>
    </div>
  );
}

/** Mini preview of a season for the admin picker. */
export function SeasonThumb({ id }: { id: SeasonalTheme }) {
  useSeasonFont();
  const info = SEASONS[id];
  const p = info.palette;
  return (
    <div className="relative h-28 rounded-lg overflow-hidden" style={{ background: `linear-gradient(165deg, ${p.night}, ${p.deep})` }} aria-hidden="true" data-testid={`thumb-${id}`}>
      <div className="absolute inset-0" style={{ background: info.heroTint }} />
      {id === "christmas" && (
        <>
          <div className="absolute top-1 end-3"><BethlehemStar size={70} glow={p.glow} core={p.gold} /></div>
          <div className="absolute top-0 start-0 rtl:-scale-x-100 opacity-90"><OliveBranch width={96} leafA="#5B9970" leafB="#2F6F54" berry={p.glow} /></div>
        </>
      )}
      {id === "eid_fitr" && (
        <>
          <div className="absolute top-1 end-3"><Hilal size={62} gold={p.gold} glow={p.glow} /></div>
          <div className="absolute start-3 -top-1"><Fanous size={20} gold={p.gold} glow={p.glow} /></div>
          <div className="absolute start-10 -top-1"><Fanous size={15} gold={p.gold} glow={p.glow} /></div>
        </>
      )}
      {id === "eid_adha" && (
        <>
          <Arcade gold={p.gold} glow={p.glow} height={34} />
          <div className="absolute inset-x-0 bottom-0 h-10 overflow-hidden"><SunDisc glow={p.glow} gold={p.gold} /></div>
          <Skyline back="rgba(14,92,79,.62)" front="rgba(5,47,42,.9)" edge={p.gold} />
        </>
      )}
      <div className={`absolute inset-x-0 bottom-2 text-center ${id === "eid_adha" ? "bottom-3" : ""} ${"sx-ar"} text-[15px]`} style={{ color: p.light, textShadow: "0 1px 8px rgba(0,0,0,.6)" }}>{info.titleAr}</div>
      <style>{CSS}</style>
    </div>
  );
}
