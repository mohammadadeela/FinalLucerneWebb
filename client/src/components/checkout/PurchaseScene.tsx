import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Package, Shirt, Store, Truck } from "lucide-react";
import { useLanguage } from "@/i18n";

/* The moment after "place order", told as a short, premium three-chapter story (no cartoon characters —
   the "stars" are the customer's own pieces, a signature black Lucerne box and a pair of white gloves):
     1. Picking   — the cart's pieces drop onto the packing table as polaroid cards with a gold "L" tag
     2. Wrapping  — the cards go into the open box, white-gloved hands lower the lid, a gold ribbon is tied,
                    a bow pops and a rose wax seal with the "L" is pressed
     3. Delivery  — a rose Lucerne van pulls up, the box goes in the back and it drives off through town
                    (store pickup: the box is set on the boutique counter with a READY tag and the bell rings)
   Everything is SVG moved with framer-motion.

   Contract with the checkout page (unchanged): `open` while the order is being placed, `done` once it succeeded;
   the page keeps the scene up for a minimum time and removes it at once if the order fails.
   data-phase: 0 picking · 1 wrapping · 2 delivering · 3 done. */

type Method = "cod" | "card" | "pickup";

const T1 = 1.5;   // picking  -> wrapping
const T2 = 3.7;   // wrapping -> delivery
const DELIVER_SECS = 1.8;
const SERIF = "var(--font-display, 'Cormorant Garamond'), Georgia, serif";
const GOLD = "url(#ls-gold)";

const tr = (reduce: boolean, t: Record<string, unknown>) => (reduce ? { duration: 0 } : t);

/* ── shared gradients ─────────────────────────────────────────────────────── */
function Defs() {
  const g = (id: string, a: string, b: string) => (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
  );
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {g("ls-wall", "#fff8f4", "#fbe4de")}{g("ls-marble", "#fbf7f2", "#eadfd6")}{g("ls-boxf", "#2b2b30", "#121214")}
        {g("ls-boxt", "#4a4a52", "#2d2d33")}{g("ls-rose", "#f58fab", "#d4466e")}{g("ls-van", "#f6a3ba", "#d84d75")}
        {g("ls-sky", "#fff3ee", "#fbd9df")}{g("ls-road", "#4d4a56", "#33313b")}{g("ls-glove", "#ffffff", "#efe6e0")}
        <linearGradient id="ls-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6e2a6" /><stop offset=".5" stopColor="#cfa355" /><stop offset="1" stopColor="#f1d68e" /></linearGradient>
        <radialGradient id="ls-spot" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <clipPath id="ls-card"><rect x="-32" y="-38" width="64" height="64" rx="8" /></clipPath>
      </defs>
    </svg>
  );
}

/* ── a polaroid card with one of the customer's pieces ────────────────────── */
const CARD_FALLBACK = ["#c9a6d8", "#f4a9b8", "#7bd0c0"];

function Card({ img, tint }: { img?: string; tint: string }) {
  return (
    <g>
      <rect x="-40" y="-46" width="80" height="94" rx="12" fill="#fff" stroke="rgba(0,0,0,.06)" />
      <g clipPath="url(#ls-card)">
        <rect x="-32" y="-38" width="64" height="64" fill={tint} />
        {img ? (
          <image href={img} x="-32" y="-38" width="64" height="64" preserveAspectRatio="xMidYMid slice" />
        ) : (
          <path d="M-8 -22 L0 -34 L8 -22 L14 10 Q0 16 -14 10 Z" fill="rgba(255,255,255,.55)" />
        )}
      </g>
      <rect x="-22" y="31" width="44" height="2.5" rx="1.25" fill={GOLD} opacity=".9" />
      <g transform="translate(26 -40) rotate(18)">
        <rect x="-7" y="-9" width="14" height="18" rx="3" fill={GOLD} />
        <circle cx="0" cy="-5" r="1.4" fill="#2a2a2f" />
        <text x="0" y="5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#2a2a2f" style={{ fontFamily: SERIF }}>L</text>
      </g>
    </g>
  );
}

/* ── the signature box, drawn around its base centre (0,0 = bottom centre, front face is 160×70) ──────── */
function BoxBody() {
  return (
    <>
      <path d="M-80 -70 L80 -70 L62 -86 L-62 -86 Z" fill="#1c1c20" />
      <path d="M-62 -86 L62 -86 L50 -80 L-50 -80 Z" fill="#f7d9d2" />
    </>
  );
}
function BoxFront() {
  return (
    <>
      <rect x="-80" y="-70" width="160" height="70" rx="3" fill="url(#ls-boxf)" />
      <text x="-42" y="-10" textAnchor="middle" fontSize="8.5" letterSpacing="2" fill={GOLD} style={{ fontFamily: SERIF }}>LUCERNE</text>
      <text x="44" y="-10" textAnchor="middle" fontSize="8.5" letterSpacing="2" fill={GOLD} style={{ fontFamily: SERIF }}>BOUTIQUE</text>
    </>
  );
}
function Lid() {
  return (
    <g>
      <path d="M-84 -86 L84 -86 L66 -104 L-66 -104 Z" fill="url(#ls-boxt)" />
      <rect x="-84" y="-86" width="168" height="18" rx="2" fill="#1a1a1e" />
      <rect x="-84" y="-86" width="168" height="2" fill="rgba(255,255,255,.12)" />
    </g>
  );
}
function Bow() {
  return (
    <g>
      <path d="M0 0 C-14 -22 -44 -22 -40 -4 C-37 10 -14 8 0 0 Z" fill={GOLD} />
      <path d="M0 0 C14 -22 44 -22 40 -4 C37 10 14 8 0 0 Z" fill={GOLD} />
      <path d="M0 0 C-10 -14 -30 -14 -28 -4 C-26 4 -10 4 0 0" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="2" />
      <path d="M0 0 C10 -14 30 -14 28 -4 C26 4 10 4 0 0" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="2" />
      <path d="M-2 2 L-16 22 L-8 22 L0 8 Z" fill="#d4a858" /><path d="M2 2 L16 22 L8 22 L0 8 Z" fill="#d4a858" />
      <circle cx="0" cy="0" r="6" fill="#c9994a" /><circle cx="0" cy="0" r="3.5" fill="#f3dc9c" />
    </g>
  );
}
function Seal() {
  return (
    <g>
      <path d="M0 -17 Q13 -16 16 -4 Q18 10 6 16 Q-8 19 -15 8 Q-19 -8 -8 -15 Z" fill="#b8324f" />
      <circle cx="0" cy="0" r="12" fill="#d4466e" /><circle cx="0" cy="0" r="12" fill="none" stroke="rgba(255,255,255,.25)" />
      <text x="0" y="5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#f6e2a6" style={{ fontFamily: SERIF }}>L</text>
    </g>
  );
}
/* the finished, wrapped box (used in the delivery chapters) */
function WrappedBox() {
  return (
    <g>
      <ellipse cx="0" cy="4" rx="96" ry="7" fill="rgba(80,30,40,.16)" />
      <BoxBody /><BoxFront /><Lid />
      <rect x="-7" y="-104" width="14" height="104" fill={GOLD} />
      <rect x="-80" y="-42" width="160" height="14" fill={GOLD} /><rect x="-80" y="-42" width="160" height="14" fill="rgba(0,0,0,.08)" />
      <g transform="translate(0 -104)"><Bow /></g>
      <g transform="translate(0 -35)"><Seal /></g>
    </g>
  );
}

/* ── a white glove (palm at 0,0; fingers point up) ───────────────────────── */
function Glove() {
  const f = { fill: "url(#ls-glove)", stroke: "rgba(0,0,0,.08)" };
  return (
    <g>
      <path d="M-16 40 L-16 14 Q-16 2 -6 0 L18 0 Q28 2 28 12 L28 40 Z" {...f} />
      <rect x="-16" y="36" width="44" height="10" rx="4" fill="#f4c8d4" />
      <rect x="-15" y="-16" width="9" height="22" rx="4.5" {...f} /><rect x="-4" y="-21" width="9" height="27" rx="4.5" {...f} />
      <rect x="7" y="-19" width="9" height="25" rx="4.5" {...f} /><rect x="18" y="-13" width="9" height="19" rx="4.5" {...f} />
      <rect x="22" y="6" width="12" height="9" rx="4.5" transform="rotate(40 22 6)" {...f} />
      <circle cx="6" cy="43" r="2.6" fill="#fff" stroke="rgba(0,0,0,.1)" />
    </g>
  );
}

function Sparkle({ x, y, s = 1, delay = 0, reduce }: { x: number; y: number; s?: number; delay?: number; reduce: boolean }) {
  return (
    <motion.path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" fill="#e8c165"
      initial={{ opacity: reduce ? 0.9 : 0, scale: reduce ? 1 : 0 }} animate={reduce ? undefined : { opacity: [0, 1, 0], scale: [0.3, 1.2, 0.3], rotate: [0, 40, 80] }}
      transition={{ delay, duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }} style={{ originX: 0.5, originY: 0.5 }} />
  );
}

/* ── chapters 1 + 2: the packing table ───────────────────────────────────── */
const SLOTS: Record<number, { x: number; y: number; r: number }[]> = {
  1: [{ x: 180, y: 142, r: 0 }],
  2: [{ x: 138, y: 148, r: -7 }, { x: 222, y: 148, r: 7 }],
  3: [{ x: 108, y: 152, r: -10 }, { x: 180, y: 134, r: 0 }, { x: 252, y: 152, r: 10 }],
};
const BOX_X = 180, BOX_Y = 332;

function Table({ phase, images, n, reduce }: { phase: number; images: string[]; n: number; reduce: boolean }) {
  const wrapping = phase >= 1;
  const slots = SLOTS[n];
  const hand = (side: -1 | 1) => (
    <motion.g
      initial={{ x: reduce ? 0 : -130 * side, y: reduce ? 0 : -130, opacity: reduce ? 1 : 0 }}
      animate={reduce ? { x: -170 * side, y: -90, opacity: 0 } : { x: [-130 * side, 0, 0, -170 * side], y: [-130, 0, 0, -90], opacity: [0, 1, 1, 0] }}
      transition={tr(reduce, { delay: 0.5, duration: 1.45, times: [0, 0.32, 0.62, 1], ease: "easeInOut" })}>
      <g transform={`translate(${180 + 102 * side} 190) rotate(${-30 * side}) scale(${side === 1 ? -1 : 1} 1)`}><Glove /></g>
    </motion.g>
  );

  return (
    <svg viewBox="0 0 360 440" className="absolute inset-0 w-full h-full" aria-hidden>
      <rect width="360" height="440" fill="url(#ls-wall)" />
      <circle cx="180" cy="210" r="150" fill="url(#ls-spot)" />
      <path d="M0 0 H360 V22 Q180 48 0 22 Z" fill="rgba(255,255,255,.4)" />
      <g opacity=".55" stroke="#e7b7a9" strokeWidth="1.4" fill="none"><path d="M24 60 Q40 36 60 56" /><path d="M300 70 Q316 46 336 66" /></g>
      <rect x="0" y="336" width="360" height="104" fill="url(#ls-marble)" />
      <path d="M0 336 H360" stroke="rgba(0,0,0,.06)" />
      <path d="M20 380 Q90 360 150 390 T300 372" stroke="rgba(0,0,0,.05)" strokeWidth="2" fill="none" />
      <path d="M200 420 Q260 400 340 425" stroke="rgba(0,0,0,.04)" strokeWidth="2" fill="none" />

      {/* the open box: its back and its tissue sit behind the cards, the front face in front of them */}
      <motion.g style={{ originX: 0.5, originY: 1 }} animate={wrapping ? { scaleY: [1, 1, 0.965, 1] } : { scaleY: 1 }} transition={tr(reduce, { delay: 1.0, duration: 0.5, times: [0, 0.5, 0.75, 1] })}>
        <g transform={`translate(${BOX_X} ${BOX_Y})`}>
          <ellipse cx="0" cy="4" rx="96" ry="7" fill="rgba(80,30,40,.16)" />
          <BoxBody />
        </g>
      </motion.g>

      {slots.map((s, i) => (
        <motion.g key={i}
          initial={reduce ? { x: wrapping ? BOX_X : s.x, y: wrapping ? BOX_Y - 32 : s.y, rotate: wrapping ? 0 : s.r, scale: wrapping ? 0.45 : 1, opacity: 1 } : { x: s.x, y: -150, rotate: s.r - 14, scale: 1, opacity: 0 }}
          animate={wrapping
            ? { x: BOX_X, y: BOX_Y - 32, rotate: 0, scale: 0.45, opacity: 1 }
            : { x: s.x, y: s.y, rotate: s.r, scale: 1, opacity: 1 }}
          transition={tr(reduce, wrapping
            ? { delay: 0.05 + i * 0.16, duration: 0.5, ease: [0.5, 0, 0.2, 1] }
            : { delay: 0.1 + i * 0.22, type: "spring", stiffness: 180, damping: 17, mass: 0.9, opacity: { duration: 0.25 } })}>
          <Card img={images[i]} tint={CARD_FALLBACK[i % 3]} />
        </motion.g>
      ))}

      {!wrapping && (<>
        <Sparkle x={70} y={92} delay={0.6} reduce={reduce} /><Sparkle x={300} y={104} s={0.7} delay={1.1} reduce={reduce} /><Sparkle x={180} y={62} s={0.6} delay={0.9} reduce={reduce} />
      </>)}

      <motion.g style={{ originX: 0.5, originY: 1 }} animate={wrapping ? { scaleY: [1, 1, 0.965, 1] } : { scaleY: 1 }} transition={tr(reduce, { delay: 1.0, duration: 0.5, times: [0, 0.5, 0.75, 1] })}>
        <g transform={`translate(${BOX_X} ${BOX_Y})`}><BoxFront /></g>
      </motion.g>

      {wrapping && (
        <g transform={`translate(${BOX_X} ${BOX_Y})`}>
          {/* lid comes down, carried by the gloves */}
          <motion.g initial={{ y: reduce ? 0 : -130, opacity: reduce ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} transition={tr(reduce, { delay: 0.72, duration: 0.5, ease: [0.3, 0, 0.1, 1], opacity: { duration: 0.2 } })}>
            <Lid />
          </motion.g>
          {/* ribbon: vertical strand from the top, horizontal band from the middle, then bow and seal */}
          <motion.rect x="-7" y="-104" width="14" height="104" fill={GOLD} style={{ originX: 0.5, originY: 0 }} initial={{ scaleY: reduce ? 1 : 0 }} animate={{ scaleY: 1 }} transition={tr(reduce, { delay: 1.4, duration: 0.3, ease: "easeOut" })} />
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} transition={tr(reduce, { delay: 1.55, duration: 0.3, ease: "easeOut" })}>
            <rect x="-80" y="-42" width="160" height="14" fill={GOLD} /><rect x="-80" y="-42" width="160" height="14" fill="rgba(0,0,0,.08)" />
          </motion.g>
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 0 : -25 }} animate={{ scale: 1, rotate: 0 }} transition={tr(reduce, { delay: 1.82, type: "spring", stiffness: 260, damping: 13 })}>
            <g transform="translate(0 -104)"><Bow /></g>
          </motion.g>
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }} animate={{ scale: reduce ? 1 : [0, 1.6, 1], opacity: 1 }} transition={tr(reduce, { delay: 1.95, duration: 0.42, times: [0, 0.55, 1], ease: "easeOut" })}>
            <g transform="translate(0 -35)"><Seal /></g>
          </motion.g>
          {!reduce && (
            <motion.circle cx="0" cy="-35" r="16" fill="none" stroke="#d4466e" strokeWidth="2" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 0.6, 0], scale: [0.6, 2.2, 2.6] }} transition={{ delay: 2.15, duration: 0.6, ease: "easeOut" }} style={{ originX: 0.5, originY: 0.5 }} />
          )}
        </g>
      )}

      {wrapping && (<>{hand(-1)}{hand(1)}</>)}
    </svg>
  );
}

/* ── chapter 3a: the Lucerne van ─────────────────────────────────────────── */
function Wheel({ cx, cy, spin, reduce }: { cx: number; cy: number; spin: boolean; reduce: boolean }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r="16" fill="#1e1e22" />
      <motion.g style={{ originX: 0.5, originY: 0.5 }} animate={spin && !reduce ? { rotate: 360 } : { rotate: 0 }} transition={spin && !reduce ? { duration: 0.6, repeat: Infinity, ease: "linear" } : { duration: 0 }}>
        <circle r="8" fill="#e9e3dc" /><circle r="2.5" fill="#1e1e22" /><path d="M0 -8 L0 8 M-8 0 L8 0" stroke="#1e1e22" strokeWidth="2" />
      </motion.g>
    </g>
  );
}

function Town() {
  // one 360-wide tile of the street; drawn twice so it can scroll seamlessly
  return (
    <g>
      <rect x="-10" y="150" width="70" height="160" rx="6" fill="#f6dfe3" /><rect x="70" y="120" width="60" height="190" rx="6" fill="#efd3dc" />
      <rect x="140" y="170" width="90" height="140" rx="6" fill="#f8e5e2" /><rect x="240" y="135" width="64" height="175" rx="6" fill="#f0d8de" /><rect x="314" y="160" width="56" height="150" rx="6" fill="#f6dfe3" />
      <g fill="rgba(255,255,255,.75)">
        <rect x="4" y="166" width="14" height="18" rx="2" /><rect x="30" y="166" width="14" height="18" rx="2" /><rect x="4" y="196" width="14" height="18" rx="2" /><rect x="30" y="196" width="14" height="18" rx="2" />
        <rect x="82" y="136" width="12" height="16" rx="2" /><rect x="104" y="136" width="12" height="16" rx="2" /><rect x="82" y="166" width="12" height="16" rx="2" /><rect x="104" y="166" width="12" height="16" rx="2" />
        <rect x="154" y="186" width="16" height="20" rx="2" /><rect x="178" y="186" width="16" height="20" rx="2" /><rect x="202" y="186" width="16" height="20" rx="2" />
        <rect x="252" y="152" width="12" height="16" rx="2" /><rect x="276" y="152" width="12" height="16" rx="2" /><rect x="252" y="182" width="12" height="16" rx="2" /><rect x="276" y="182" width="12" height="16" rx="2" />
        <rect x="326" y="176" width="12" height="16" rx="2" /><rect x="348" y="176" width="12" height="16" rx="2" />
      </g>
      <path d="M146 232 H224 L230 250 H140 Z" fill="url(#ls-rose)" />
      <g fill="rgba(255,255,255,.55)"><rect x="152" y="232" width="8" height="18" /><rect x="172" y="232" width="8" height="18" /><rect x="192" y="232" width="8" height="18" /><rect x="212" y="232" width="8" height="18" /></g>
      <rect x="164" y="256" width="42" height="54" rx="3" fill="#2a2a30" />
      <rect x="50" y="280" width="6" height="36" fill="#a9876a" /><circle cx="53" cy="270" r="22" fill="#b8e2cf" />
      <rect x="300" y="282" width="6" height="34" fill="#a9876a" /><circle cx="303" cy="272" r="20" fill="#a6dcc7" />
    </g>
  );
}

function Street({ done, reduce }: { done: boolean; reduce: boolean }) {
  const [rolling, setRolling] = useState(reduce);
  useEffect(() => { const t = window.setTimeout(() => setRolling(true), reduce ? 0 : 1650); return () => window.clearTimeout(t); }, [reduce]);
  const scroll = rolling && !reduce;
  return (
    <svg viewBox="0 0 360 440" className="absolute inset-0 w-full h-full" aria-hidden>
      <rect width="360" height="440" fill="url(#ls-sky)" />
      <circle cx="296" cy="74" r="28" fill="#fff0c2" />
      <motion.g fill="#fff" opacity=".9" animate={reduce ? undefined : { x: [0, -14, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}>
        <ellipse cx="70" cy="80" rx="26" ry="11" /><ellipse cx="90" cy="72" rx="18" ry="12" /><ellipse cx="52" cy="78" rx="14" ry="9" />
      </motion.g>
      <motion.g animate={scroll ? { x: [0, -360] } : { x: 0 }} transition={scroll ? { duration: done ? 1.6 : 3.2, repeat: Infinity, ease: "linear" } : { duration: 0 }}>
        <Town /><g transform="translate(360 0)"><Town /></g>
      </motion.g>
      <rect x="0" y="310" width="360" height="26" fill="#efe4da" /><rect x="0" y="310" width="360" height="4" fill="rgba(0,0,0,.06)" />
      <rect x="0" y="336" width="360" height="104" fill="url(#ls-road)" />
      <motion.path d="M-40 392 H400" stroke="#fff" strokeWidth="3" strokeDasharray="26 18" opacity=".6" animate={scroll ? { x: [0, -44] } : { x: 0 }} transition={scroll ? { duration: done ? 0.25 : 0.5, repeat: Infinity, ease: "linear" } : { duration: 0 }} />

      {/* the box waits on the pavement (behind the van) */}
      <motion.g initial={{ x: reduce ? 0 : -120, opacity: reduce ? 1 : 0 }} animate={{ x: 0, opacity: [1, 1, 1, 0] }} transition={tr(reduce, { duration: 0.55, ease: "easeOut", opacity: { delay: 0, duration: 0.95, times: [0, 0.5, 0.99, 1] } })}>
        <g transform="translate(30 334) scale(.42)"><WrappedBox /></g>
      </motion.g>

      {/* the van arrives, the box is loaded, the shutter closes and off it goes */}
      <motion.g initial={{ x: reduce ? 0 : -330 }} animate={{ x: done ? 540 : 0, y: scroll ? [0, -1.5, 0] : 0 }}
        transition={done ? tr(reduce, { x: { duration: 0.9, ease: [0.55, 0, 0.9, 0.5] } }) : tr(reduce, { x: { duration: 0.75, ease: [0.15, 0.7, 0.2, 1] }, y: { duration: 0.35, repeat: Infinity, ease: "easeInOut" } })}>
        <g transform="translate(180 372)">
          <ellipse cx="0" cy="4" rx="118" ry="7" fill="rgba(30,20,30,.25)" />
          <path d="M-112 -20 L-112 -92 Q-112 -100 -104 -100 L30 -100 Q46 -100 56 -88 L96 -46 Q104 -38 104 -28 L104 -20 Z" fill="url(#ls-van)" />
          <path d="M36 -92 L30 -92 L30 -54 L84 -54 L56 -86 Q50 -92 36 -92 Z" fill="#e9f3f6" />
          <path d="M36 -92 L30 -92 L30 -54 L84 -54 L56 -86 Q50 -92 36 -92 Z" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
          <rect x="-112" y="-32" width="216" height="6" fill="rgba(0,0,0,.14)" />
          <rect x="-108" y="-96" width="40" height="70" rx="3" fill="#1b1b1f" />
          <text x="-16" y="-66" textAnchor="middle" fontSize="15" letterSpacing="3" fontWeight="600" fill="#1a1a1e" style={{ fontFamily: SERIF }}>LUCERNE</text>
          <text x="-16" y="-50" textAnchor="middle" fontSize="7.5" letterSpacing="3.5" fill="#fff7e8" style={{ fontFamily: SERIF }}>BOUTIQUE</text>
          <rect x="96" y="-40" width="8" height="10" rx="2" fill="#fff5cc" /><rect x="-112" y="-40" width="6" height="10" rx="2" fill="#ff8a8a" />
          {/* the box flies into the back */}
          <motion.g initial={{ x: -150, y: -38, scale: 0.42, opacity: reduce ? 0 : 0 }}
            animate={reduce ? { opacity: 0 } : { x: [-150, -120, -88], y: [-38, -92, -48], scale: [0.42, 0.32, 0.22], opacity: [1, 1, 1] }}
            transition={tr(reduce, { delay: 0.95, duration: 0.45, times: [0, 0.5, 1], ease: "easeInOut" })}>
            <WrappedBox />
          </motion.g>
          {/* roller shutter */}
          <motion.rect x="-108" y="-96" width="40" height="70" rx="3" fill="rgba(255,255,255,.22)" style={{ originX: 0.5, originY: 0 }} initial={{ scaleY: reduce ? 1 : 0.08 }} animate={{ scaleY: 1 }} transition={tr(reduce, { delay: 1.4, duration: 0.3, ease: "easeIn" })} />
          <rect x="-104" y="-56" width="32" height="2" fill="rgba(255,255,255,.35)" />
          <Wheel cx={-62} cy={-14} spin={rolling} reduce={reduce} /><Wheel cx={64} cy={-14} spin={rolling} reduce={reduce} />
          {!reduce && !done && [0, 1, 2].map((i) => (
            <motion.circle key={i} cx="-118" cy="-26" r="3.5" fill="#fff" initial={{ x: -2, y: 0, opacity: 0.5, scale: 0.6 }} animate={{ x: [-2, -24], y: [0, -14], opacity: [0.5, 0], scale: [0.6, 1.5] }} transition={{ delay: 1.7 + i * 0.35, duration: 1, repeat: Infinity, ease: "easeOut" }} />
          ))}
          {done && !reduce && [0, 1, 2].map((i) => (
            <motion.rect key={`sp${i}`} x="-190" y={-80 + i * 14} width="56" height="3" rx="1.5" fill="#fff" initial={{ opacity: 0.8, scaleX: 0.4 }} animate={{ opacity: 0, scaleX: 1 }} transition={{ duration: 0.45, repeat: Infinity }} style={{ originX: 1, originY: 0.5 }} />
          ))}
        </g>
      </motion.g>
    </svg>
  );
}

/* ── chapter 3b: the boutique counter (store pickup) ─────────────────────── */
function Shop({ done, reduce }: { done: boolean; reduce: boolean }) {
  return (
    <svg viewBox="0 0 360 440" className="absolute inset-0 w-full h-full" aria-hidden>
      <rect width="360" height="440" fill="url(#ls-wall)" />
      <circle cx="180" cy="200" r="160" fill="url(#ls-spot)" />
      <path d="M30 70 H330 L344 118 H16 Z" fill="url(#ls-rose)" />
      <g fill="rgba(255,255,255,.5)"><path d="M60 70 H86 L92 118 H60 Z" /><path d="M116 70 H142 L146 118 H118 Z" /><path d="M172 70 H198 L198 118 H172 Z" /><path d="M226 70 H252 L250 118 H222 Z" /><path d="M280 70 H306 L306 118 H278 Z" /></g>
      <path d="M16 118 H344" stroke="rgba(0,0,0,.15)" strokeWidth="2" />
      <g fill="url(#ls-rose)">{[30, 68, 106, 144, 182, 220, 258, 296, 334].map((x) => <circle key={x} cx={x} cy="124" r="6" />)}</g>
      <g transform="translate(180 48)">
        <rect x="-120" y="-24" width="240" height="48" rx="10" fill="#17171a" />
        <rect x="-116" y="-20" width="232" height="40" rx="8" fill="none" stroke={GOLD} strokeWidth="1.5" />
        <text x="0" y="6" textAnchor="middle" fontSize="17" letterSpacing="4" fontWeight="600" fill={GOLD} style={{ fontFamily: SERIF }}>LUCERNE BOUTIQUE</text>
      </g>
      <g opacity=".9">
        <rect x="36" y="150" width="90" height="4" rx="2" fill="#dcc3a6" /><rect x="234" y="150" width="90" height="4" rx="2" fill="#dcc3a6" />
        <rect x="44" y="124" width="22" height="26" rx="5" fill="#c9a6d8" /><rect x="74" y="128" width="22" height="22" rx="5" fill="#f4a9b8" /><rect x="104" y="124" width="16" height="26" rx="4" fill="#7bd0c0" />
        <rect x="242" y="126" width="20" height="24" rx="5" fill="#2a2a30" /><rect x="270" y="130" width="24" height="20" rx="5" fill="#e8c165" /><rect x="302" y="124" width="16" height="26" rx="4" fill="#f4a9b8" />
        <rect x="36" y="214" width="90" height="4" rx="2" fill="#dcc3a6" /><rect x="234" y="214" width="90" height="4" rx="2" fill="#dcc3a6" />
        <rect x="50" y="186" width="26" height="28" rx="5" fill="#f4a9b8" /><rect x="88" y="190" width="26" height="24" rx="5" fill="#2a2a30" />
        <rect x="248" y="188" width="26" height="26" rx="5" fill="#c9a6d8" /><rect x="286" y="184" width="26" height="30" rx="5" fill="#7bd0c0" />
      </g>
      <rect x="0" y="336" width="360" height="104" fill="url(#ls-marble)" />
      <rect x="0" y="330" width="360" height="12" rx="4" fill="#efe1d6" /><path d="M0 342 H360" stroke="rgba(0,0,0,.08)" />
      <g transform="translate(46 330)"><path d="M-10 0 L10 0 L7 -24 L-7 -24 Z" fill="#d4466e" /><path d="M0 -24 Q-20 -40 -8 -70 Q-2 -48 0 -24 Z" fill="#9edcc3" /><path d="M0 -24 Q22 -44 10 -76 Q4 -50 0 -24 Z" fill="#7bd0c0" /><path d="M0 -24 Q0 -56 -4 -84 Q6 -58 0 -24 Z" fill="#b8e2cf" /></g>

      {/* the bell rings once the box is down */}
      <g transform="translate(300 332)">
        <ellipse cx="0" cy="0" rx="18" ry="4" fill="#c9994a" />
        <motion.g style={{ originX: 0.5, originY: 1 }} animate={reduce ? undefined : { rotate: [0, 0, -8, 8, -5, 5, 0] }} transition={{ delay: 1.0, duration: 0.6, times: [0, 0.05, 0.25, 0.45, 0.65, 0.85, 1] }}>
          <path d="M-14 0 Q-14 -24 0 -26 Q14 -24 14 0 Z" fill={GOLD} /><circle cx="0" cy="-28" r="3.5" fill="#f3dc9c" />
        </motion.g>
        {!reduce && [0, 1].map((i) => (
          <motion.circle key={i} cx="0" cy="-14" r="18" fill="none" stroke="#cfa355" strokeWidth="2" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 0.7, 0], scale: [0.6, 2, 2.4] }} transition={{ delay: 1.05 + i * 0.25, duration: 0.8, ease: "easeOut" }} style={{ originX: 0.5, originY: 0.5 }} />
        ))}
      </g>

      {/* the wrapped box slides onto the counter */}
      <motion.g initial={{ x: reduce ? 0 : -260, opacity: reduce ? 1 : 0 }} animate={{ x: 0, opacity: 1 }} transition={tr(reduce, { delay: 0.1, duration: 0.7, ease: [0.2, 0.8, 0.2, 1], opacity: { duration: 0.25 } })}>
        <g transform="translate(180 330) scale(.78)"><WrappedBox /></g>
      </motion.g>
      <motion.g style={{ originX: 0, originY: 0.5 }} initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 12 : -30, opacity: reduce ? 1 : 0 }} animate={{ scale: 1, rotate: done ? [12, 6, 12] : 12, opacity: 1 }}
        transition={tr(reduce, done ? { rotate: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } } : { delay: 0.85, type: "spring", stiffness: 240, damping: 14 })}>
        <g transform="translate(246 236)">
          <rect x="-30" y="-12" width="60" height="24" rx="6" fill={GOLD} /><circle cx="-22" cy="0" r="2" fill="#2a2a2f" />
          <text x="4" y="4" textAnchor="middle" fontSize="9" letterSpacing="1.5" fontWeight="700" fill="#2a2a2f" style={{ fontFamily: SERIF }}>READY</text>
        </g>
      </motion.g>
      {done && !reduce && [0, 1, 2].map((i) => (
        <motion.text key={i} x={150 + i * 30} y="250" fontSize="16" textAnchor="middle" initial={{ opacity: 0, y: 250 }} animate={{ opacity: [0, 1, 0], y: [250, 200] }} transition={{ delay: i * 0.25, duration: 1.1, repeat: Infinity, repeatDelay: 0.3 }}>❤️</motion.text>
      ))}
    </svg>
  );
}

/* ── the scene ────────────────────────────────────────────────────────────── */
const CONFETTI = ["#e0587c", "#e2bd78", "#7bd0c0", "#c9a6d8", "#f4a9a0", "#1a1a1a"];

export default function PurchaseScene({ open, done, method, images = [] }: { open: boolean; done: boolean; method: Method; images?: string[] }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const reduce = !!useReducedMotion();
  const [stage, setStage] = useState(0);

  // the pieces the story handles follow the cart; frozen when the scene opens (a signed-in customer's server cart is
  // emptied the moment the order is created, and the story must not change halfway)
  const frozen = useRef<{ n: number; images: string[] } | null>(null);
  if (!open) frozen.current = null;
  else if (frozen.current === null) frozen.current = { n: Math.min(3, Math.max(1, images.length)), images: images.slice(0, 3) };
  const n = frozen.current?.n ?? 1;
  const imgs = frozen.current?.images ?? [];

  useEffect(() => {
    if (!open) { setStage(0); return; }
    const timers = [window.setTimeout(() => setStage((s) => Math.max(s, 1)), T1 * 1000), window.setTimeout(() => setStage((s) => Math.max(s, 2)), T2 * 1000)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const phase = done ? 3 : stage;
  const pickup = method === "pickup";
  const lines = [
    { Icon: Shirt, text: ar ? "نختار قطعك بعناية" : "Hand-picking your pieces", sub: ar ? "من مجموعتنا إليكِ" : "From our collection to you" },
    { Icon: Package, text: ar ? "نغلّفها بحب" : "Wrapping with love", sub: ar ? "صندوق لوسيرن الأسود وختم ذهبي" : "Signature black box, gold seal" },
    pickup
      ? { Icon: Store, text: ar ? "جاهز للاستلام من البوتيك" : "Ready at the boutique", sub: ar ? "ننتظرك في لوسيرن بوتيك" : "We'll see you at Lucerne Boutique" }
      : method === "cod"
        ? { Icon: Truck, text: ar ? "طلبك في الطريق" : "Your order is on its way", sub: ar ? "سيصلك قريباً" : "Heading to your door" }
        : { Icon: Truck, text: ar ? "نحوّلك لدفع آمن" : "Taking you to secure payment", sub: ar ? "بياناتك محمية بالكامل" : "Your details stay protected" },
    { Icon: Check, text: ar ? "تم الطلب! ❤️" : "Order placed! ❤️", sub: ar ? "شكراً لتسوقك من لوسيرن بوتيك" : "Thank you for shopping with Lucerne Boutique" },
  ];
  const cur = lines[Math.min(phase, 3)];
  const chapterSecs = [T1, T2 - T1, DELIVER_SECS];

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center px-3 overflow-hidden bg-gradient-to-b from-[#fff9f5] via-[#fdeee8] to-[#f8dfdc]"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={ar ? "جارٍ إتمام طلبك" : "Placing your order"}
      data-testid="purchase-scene"
      data-phase={phase}
      data-pieces={n}
      data-story={pickup ? "pickup" : "van"}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Defs />
      <motion.div className="pointer-events-none absolute -top-28 -start-24 w-96 h-96 rounded-full bg-rose-200/50 blur-3xl" aria-hidden animate={reduce ? undefined : { x: [0, 30, 0], y: [0, 24, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="pointer-events-none absolute -bottom-32 -end-20 w-96 h-96 rounded-full bg-amber-200/45 blur-3xl" aria-hidden animate={reduce ? undefined : { x: [0, -26, 0], y: [0, -20, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />

      {/* brand mark */}
      <div className="relative z-10 mb-3 text-center select-none" aria-hidden>
        <div className="text-[11px] tracking-[0.38em] uppercase text-foreground/60" style={{ fontFamily: SERIF }}>Lucerne Boutique</div>
      </div>

      {/* frosted caption pill + three-step progress */}
      <div className="relative z-10 mb-4 sm:mb-5 flex flex-col items-center gap-2.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={Math.min(phase, 3)}
            initial={reduce ? false : { opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.26 }}
            className="flex flex-col items-center gap-1"
          >
            <div className="inline-flex items-center gap-2.5 rounded-full bg-white/80 backdrop-blur-xl ring-1 ring-black/5 shadow-lg shadow-rose-200/50 ps-2 pe-5 py-2">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${phase === 3 ? "bg-gradient-to-br from-emerald-400 to-emerald-600" : "bg-gradient-to-br from-rose-500 to-pink-600"}`}>
                <cur.Icon className="w-4 h-4" />
              </span>
              <span className="text-sm sm:text-base font-bold text-foreground" data-testid="purchase-scene-caption">{cur.text}</span>
            </div>
            <span className="text-[11px] sm:text-xs text-foreground/55">{cur.sub}</span>
          </motion.div>
        </AnimatePresence>
        <div className="flex gap-1.5" aria-hidden>
          {chapterSecs.map((secs, i) => (
            <span key={i} className="relative h-1 w-9 rounded-full bg-foreground/10 overflow-hidden">
              <motion.span className={`absolute inset-y-0 start-0 rounded-full ${phase === 3 ? "bg-emerald-500" : "bg-foreground"}`}
                initial={{ width: i < phase ? "100%" : "0%" }} animate={{ width: i <= phase || phase === 3 ? "100%" : "0%" }}
                transition={i === phase && phase < 3 && !reduce ? { duration: secs, ease: "linear" } : { duration: 0.25 }} />
            </span>
          ))}
        </div>
      </div>

      {/* the stage */}
      <div className="relative rounded-[28px] overflow-hidden ring-1 ring-black/5 shadow-[0_30px_80px_-24px_rgba(214,67,109,0.45)] bg-white" style={{ width: "min(94vw, calc((100svh - 176px) * 0.818), 500px)", aspectRatio: "360 / 440" }} data-testid="purchase-scene-stage">
        <AnimatePresence>
          <motion.div key={phase >= 2 ? "deliver" : "table"} className="absolute inset-0"
            initial={reduce ? false : { opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -26 }} transition={{ duration: 0.34, ease: "easeOut" }}>
            {phase < 2 && <Table phase={phase} images={imgs} n={n} reduce={reduce} />}
            {phase >= 2 && (pickup ? <Shop done={done} reduce={reduce} /> : <Street done={done} reduce={reduce} />)}
          </motion.div>
        </AnimatePresence>

        {/* success: a check pops in with a small burst of confetti */}
        <AnimatePresence>
          {done && (
            <>
              <motion.div className="absolute w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-xl flex items-center justify-center" style={{ left: "calc(50% - 28px)", top: "14%" }} data-testid="scene-check"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
                <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.35 }} /></svg>
              </motion.div>
              {!reduce && Array.from({ length: 18 }).map((_, i) => {
                const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.2; const d = 90 + (i % 3) * 24;
                return (
                  <motion.span key={i} className={`absolute block ${i % 3 === 0 ? "w-2 h-3 rounded-[2px]" : "w-2.5 h-2.5 rounded-full"}`} style={{ left: "calc(50% - 4px)", top: "calc(14% + 24px)", background: CONFETTI[i % CONFETTI.length] }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }} animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: [1, 1, 0], scale: 1, rotate: 200 + i * 20 }} transition={{ duration: 1.15, ease: "easeOut", delay: 0.05 }} />
                );
              })}
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
