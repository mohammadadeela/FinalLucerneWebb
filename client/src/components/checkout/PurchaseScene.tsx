import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Package, Shirt, Store, Truck } from "lucide-react";
import { useLanguage } from "@/i18n";

/* "Lucerne Express": the moment after "place order", told as a tiny three-chapter story.
     1. We pick     — a shop assistant takes a dress, a handbag and heels off the shelves into her basket
     2. We wrap     — at her packing table the pieces go into a black Lucerne box: tissue, lid, ribbon, bow, gold seal
     3. We hand over — a courier on a rose scooter pulls up, the box goes into his top case and he rides off when the
                       order is confirmed. (Store pickup: a customer walks up and receives the box instead.)
   Everything is drawn in SVG and moved with framer-motion. The number of pieces follows the cart (1–3).

   Contract with the checkout page (unchanged): `open` while the order is being placed, `done` once it succeeded; the
   page keeps the scene up for a minimum time and removes it at once if the order fails.
   data-phase: 0 picking · 1 wrapping · 2 handing over · 3 done. */

type Method = "cod" | "card" | "pickup";
type Kind = "dress" | "bag" | "heel";

const T1 = 1.8;   // picking -> wrapping
const T2 = 3.8;   // wrapping -> handing over
const SERIF = "var(--font-display, 'Cormorant Garamond'), Georgia, serif";

/* ── shared gradients ─────────────────────────────────────────────────────── */
function Defs() {
  const g = (id: string, a: string, b: string) => (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
  );
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {g("pq-skin", "#f7d6bd", "#e9b895")}{g("pq-hijab", "#f4b8cb", "#d8759a")}{g("pq-hijab2", "#d8c8f5", "#a98bdc")}
        {g("pq-blouse", "#fffaf5", "#f4e3d6")}{g("pq-apron", "#2d2d32", "#121215")}{g("pq-coat", "#fbc9d6", "#e98aa6")}
        {g("pq-pants", "#3a3652", "#201d33")}{g("pq-wall", "#fff8f3", "#fbe3dc")}{g("pq-floor", "#ecd1b2", "#d6ac80")}
        {g("pq-wood", "#e8c8a2", "#c89c70")}{g("pq-rose", "#f68ca7", "#d6436d")}{g("pq-lilac", "#d9c6f3", "#a888dc")}
        {g("pq-mint", "#abe7d9", "#5bbba5")}{g("pq-black", "#36363c", "#121214")}{g("pq-gold", "#f3d795", "#cba054")}
        {g("pq-sky", "#ffe7dc", "#fbc8d3")}{g("pq-road", "#4a4853", "#34323c")}{g("pq-wick", "#ebd3a4", "#c9a468")}
        {g("pq-glass", "#e4f5f8", "#a9d6e2")}{g("pq-win", "#fffdf8", "#fde7dc")}
        <clipPath id="pq-above-table"><rect x="0" y="0" width="360" height="318" /></clipPath>
      </defs>
    </svg>
  );
}

/* ── things on the shelves ────────────────────────────────────────────────── */
const FILL: Record<string, string> = { rose: "url(#pq-rose)", lilac: "url(#pq-lilac)", mint: "url(#pq-mint)", black: "url(#pq-black)", gold: "url(#pq-gold)" };

function Dress({ c = "rose" }: { c?: string }) {
  return (
    <g>
      <path d="M0 0 L0 7" stroke="#8a6b4a" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M-13 17 L0 7 L13 17" stroke="#8a6b4a" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-6 16 L-8 36 L-21 82 Q0 90 21 82 L8 36 L6 16 Z" fill={FILL[c]} />
      <rect x="-8.5" y="34" width="17" height="5" rx="2" fill="rgba(0,0,0,.14)" />
      <path d="M-4 20 L-6 36 L-14 74" stroke="rgba(255,255,255,.38)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </g>
  );
}
function Bag({ c = "black" }: { c?: string }) {
  return (
    <g>
      <path d="M-9 -26 Q0 -46 9 -26" stroke="#d4a85f" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <rect x="-17" y="-27" width="34" height="27" rx="6" fill={FILL[c]} />
      <rect x="-17" y="-27" width="34" height="9" rx="5" fill="rgba(255,255,255,.14)" />
      <rect x="-3" y="-22" width="6" height="7" rx="2" fill="url(#pq-gold)" />
    </g>
  );
}
function Heel({ c = "rose" }: { c?: string }) {
  return (
    <g>
      <path d="M-22 -4 Q-24 -24 -10 -26 Q-2 -27 4 -16 L22 -9 Q28 -6 23 -3 L-16 -3 Q-22 -3 -22 -4 Z" fill={FILL[c]} />
      <path d="M-17 -3 L-14 10 L-9 10 L-9 -3 Z" fill="#2a2a2f" />
      <path d="M-12 -22 Q-4 -24 2 -14" stroke="rgba(255,255,255,.45)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}
function Item({ kind, c }: { kind: Kind; c?: string }) {
  return kind === "dress" ? <Dress c={c} /> : kind === "bag" ? <Bag c={c} /> : <Heel c={c} />;
}
const ORDER: Kind[] = ["dress", "bag", "heel"];

/* ── a person: modern flat style with soft gradients ──────────────────────── */
// The arm pivots at the shoulder: the shoulder sits at these fractions of the arm's own box (Framer Motion rotates SVG
// shapes around fractions of their box, not pixel points).
const SHOULDER: Record<number, { originX: number; originY: number }> = { [-1]: { originX: 0.6786, originY: 0 }, [1]: { originX: 0.3214, originY: 0 } };
type ArmAnim = { initial?: any; animate?: any; transition?: any; stretch?: any; stretchTransition?: any };

function Girl({ look = "packer", armR, armL }: { look?: "packer" | "customer"; armR?: ArmAnim; armL?: ArmAnim }) {
  const customer = look === "customer";
  const sleeve = customer ? "#f6b3c4" : "#fff6ee";
  const arm = (side: -1 | 1, a?: ArmAnim) => {
    const sx = 20 * side;
    return (
      <motion.g style={SHOULDER[side]} initial={a?.initial} animate={a?.animate} transition={a?.transition}>
        <motion.g style={SHOULDER[side]} initial={a?.initial ? { scaleY: 1 } : undefined} animate={a?.stretch} transition={a?.stretchTransition}>
          <path d={`M${sx} -108 Q${sx + 9 * side} -86 ${sx + 2 * side} -62`} stroke={sleeve} strokeWidth="10.5" strokeLinecap="round" fill="none" />
          <circle cx={sx + 2 * side} cy="-59" r="5.6" fill="url(#pq-skin)" />
        </motion.g>
      </motion.g>
    );
  };
  return (
    <g>
      <ellipse cx="0" cy="2" rx="31" ry="5" fill="rgba(70,30,45,.15)" />
      <rect x="-14" y="-62" width="10" height="58" rx="5" fill="url(#pq-pants)" />
      <rect x="4" y="-62" width="10" height="58" rx="5" fill="url(#pq-pants)" />
      <ellipse cx="-9" cy="-3" rx="9.5" ry="4.8" fill={customer ? "#e49ab1" : "#27272c"} />
      <ellipse cx="9" cy="-3" rx="9.5" ry="4.8" fill={customer ? "#e49ab1" : "#27272c"} />
      <rect x="-22" y="-120" width="44" height="64" rx="18" fill={customer ? "url(#pq-coat)" : "url(#pq-blouse)"} />
      {!customer ? (
        <>
          <rect x="-17" y="-104" width="34" height="48" rx="10" fill="url(#pq-apron)" />
          <circle cx="0" cy="-90" r="6.8" fill="url(#pq-gold)" />
          <text x="0" y="-87" textAnchor="middle" fontSize="9" fontWeight="700" fill="#2a2a2f" style={{ fontFamily: SERIF }}>L</text>
        </>
      ) : (
        <rect x="-2.5" y="-112" width="5" height="54" rx="2.5" fill="rgba(255,255,255,.45)" />
      )}
      {arm(-1, armL)}
      {arm(1, armR)}
      <rect x="-5" y="-127" width="10" height="11" rx="4" fill="url(#pq-skin)" />
      <path d="M-26 -128 C-29 -168 29 -168 26 -128 C26 -118 35 -112 32 -100 L-32 -100 C-35 -112 -26 -118 -26 -128 Z" fill={customer ? "url(#pq-hijab2)" : "url(#pq-hijab)"} />
      <path d="M-20 -150 Q0 -160 20 -150" stroke="rgba(255,255,255,.4)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="0" cy="-137" rx="14.5" ry="16.5" fill="url(#pq-skin)" />
      <ellipse cx="-5.4" cy="-138" rx="1.7" ry="2.3" fill="#2a1b1b" />
      <ellipse cx="5.4" cy="-138" rx="1.7" ry="2.3" fill="#2a1b1b" />
      <circle cx="-9.5" cy="-132" r="3.2" fill="#f19a9a" opacity=".5" />
      <circle cx="9.5" cy="-132" r="3.2" fill="#f19a9a" opacity=".5" />
      <path d="M-4.5 -130 Q0 -126.2 4.5 -130" stroke="#b0524f" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </g>
  );
}

/* ── the room ─────────────────────────────────────────────────────────────── */
function Room({ reduce, window: win = true }: { reduce: boolean; window?: boolean }) {
  return (
    <g>
      <rect width="360" height="440" fill="url(#pq-wall)" />
      {win && (
        <g>
          <path d="M26 190 L26 96 Q26 40 80 40 Q134 40 134 96 L134 190 Z" fill="url(#pq-win)" stroke="#f1cfc2" strokeWidth="5" />
          <path d="M80 40 L80 190 M26 118 L134 118" stroke="#f1cfc2" strokeWidth="3" />
          <motion.circle cx="104" cy="82" r="14" fill="#ffe3b8" opacity=".75" animate={reduce ? undefined : { opacity: [0.55, 0.9, 0.55] }} transition={{ duration: 4, repeat: Infinity }} />
        </g>
      )}
      {win && (
        <g>
          <rect x="164" y="52" width="58" height="76" rx="4" fill="#fff" stroke="#e9c9b8" strokeWidth="4" />
          <path d="M172 120 L172 98 Q193 70 214 98 L214 120 Z" fill="url(#pq-rose)" opacity=".85" />
          <circle cx="193" cy="80" r="7" fill="#ffd9a3" />
        </g>
      )}
      <rect y="410" width="360" height="30" fill="url(#pq-floor)" />
      <rect y="406" width="360" height="6" fill="#f3dcc6" />
      {win && (
        <g>
          <path d="M44 392 Q30 360 40 334 Q52 358 50 392 Z M52 392 Q62 354 80 342 Q70 372 58 392 Z M46 392 Q40 372 22 366 Q30 386 46 392 Z" fill="#7fc9a3" />
          <path d="M34 392 L66 392 L62 412 L38 412 Z" fill="url(#pq-rose)" />
        </g>
      )}
    </g>
  );
}

/* ── chapter 1: picking ───────────────────────────────────────────────────── */
const SPOT: Record<Kind, { x: number; y: number }> = { dress: { x: 238, y: 152 }, bag: { x: 240, y: 290 }, heel: { x: 240, y: 345 } };
const IN_BASKET: Record<Kind, { x: number; y: number; s: number }> = { dress: { x: 108, y: 300, s: 0.5 }, bag: { x: 112, y: 333, s: 0.62 }, heel: { x: 110, y: 336, s: 0.62 } };
const REACH: Record<Kind, { rot: number; k: number }> = { dress: { rot: -133, k: 1 }, bag: { rot: -68, k: 1.05 }, heel: { rot: -37, k: 1.32 } };
const SHELF_COLORS: Record<Kind, string[]> = { dress: ["rose", "lilac", "mint"], bag: ["black", "gold", "rose"], heel: ["rose", "black", "lilac"] };

function Basket({ children }: { children?: ReactNode }) {
  return (
    <g>
      <path d="M86 322 Q110 286 134 322" stroke="#b98d55" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <ellipse cx="110" cy="322" rx="26" ry="9" fill="#8f6a3a" />
      {children}
      <path d="M84 322 Q86 354 110 356 Q134 354 136 322 Q110 333 84 322 Z" fill="url(#pq-wick)" />
      <path d="M88 334 Q110 342 132 334 M90 344 Q110 351 130 344" stroke="rgba(120,80,30,.28)" strokeWidth="1.6" fill="none" />
    </g>
  );
}

function ChapterPick({ n, reduce }: { n: number; reduce: boolean }) {
  const kinds = ORDER.slice(0, n);
  const at = (i: number) => 0.3 + i * 0.5;
  const tr = (t: any) => (reduce ? { duration: 0 } : t);
  // the arm rests, reaches for each piece, holds a beat, and returns
  const times: number[] = [0]; const rot: number[] = [-6]; const k: number[] = [1];
  kinds.forEach((kd, i) => {
    const t = at(i);
    [[t - 0.18, -6, 1], [t, REACH[kd].rot, REACH[kd].k], [t + 0.12, REACH[kd].rot, REACH[kd].k], [t + 0.32, -6, 1]].forEach(([tt, r, kk]) => { times.push(Math.max(0, tt as number) / T1); rot.push(r as number); k.push(kk as number); });
  });
  times.push(1); rot.push(-6); k.push(1);
  return (
    <svg viewBox="0 0 360 440" className="absolute inset-0 w-full h-full" aria-hidden>
      <Room reduce={reduce} />
      {/* shelf unit */}
      <rect x="204" y="128" width="9" height="284" rx="4" fill="url(#pq-wood)" />
      <rect x="340" y="128" width="9" height="284" rx="4" fill="url(#pq-wood)" />
      <rect x="204" y="128" width="145" height="9" rx="4" fill="url(#pq-wood)" />
      <rect x="205" y="291" width="142" height="7" rx="3" fill="url(#pq-wood)" />
      <rect x="205" y="346" width="142" height="7" rx="3" fill="url(#pq-wood)" />
      <rect x="205" y="150" width="142" height="4" rx="2" fill="#b88a5a" />
      {[0, 1, 2].map((i) => (
        <g key={`d${i}`}>
          <g transform={`translate(${238 + i * 42} 152)`}>
            <motion.g initial={{ opacity: 1 }} animate={i === 0 && kinds.includes("dress") ? { opacity: 0 } : undefined} transition={tr({ delay: at(0) + 0.02, duration: 0.01 })}><Dress c={SHELF_COLORS.dress[i]} /></motion.g>
          </g>
          <g transform={`translate(${240 + i * 42} 290)`}>
            <motion.g initial={{ opacity: 1 }} animate={i === 0 && kinds.includes("bag") ? { opacity: 0 } : undefined} transition={tr({ delay: at(kinds.indexOf("bag")) + 0.02, duration: 0.01 })}><Bag c={SHELF_COLORS.bag[i]} /></motion.g>
          </g>
          <g transform={`translate(${240 + i * 42} 345)`}>
            <motion.g initial={{ opacity: 1 }} animate={i === 0 && kinds.includes("heel") ? { opacity: 0 } : undefined} transition={tr({ delay: at(kinds.indexOf("heel")) + 0.02, duration: 0.01 })}><Heel c={SHELF_COLORS.heel[i]} /></motion.g>
          </g>
        </g>
      ))}
      {/* the assistant */}
      <g transform="translate(150 410) scale(1.45)">
        <motion.g initial={reduce ? false : { x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={tr({ duration: 0.4, ease: "easeOut" })}>
          <Girl
            armL={{ initial: { rotate: 22 }, animate: { rotate: 22 } }}
            armR={{ initial: { rotate: -6 }, animate: { rotate: rot }, transition: tr({ duration: T1, times, ease: "easeInOut" }), stretch: { scaleY: k }, stretchTransition: tr({ duration: T1, times, ease: "easeInOut" }) }}
          />
        </motion.g>
      </g>
      {/* the basket she carries; the pieces fly into it */}
      <Basket>
        {kinds.map((kd, i) => {
          const s = SPOT[kd], b = IN_BASKET[kd]; const dx = b.x - s.x, dy = b.y - s.y;
          return (
            <g key={kd} transform={`translate(${s.x} ${s.y})`}>
              <motion.g initial={{ opacity: 0, x: 0, y: 0, scale: 1, rotate: 0 }}
                animate={{ opacity: [1, 1, 1], x: [0, dx * 0.45, dx], y: [0, Math.min(0, dy) - 58, dy], scale: [1, 0.86, b.s], rotate: [0, -9, 0] }}
                transition={tr({ delay: at(i) + 0.02, duration: 0.42, times: [0, 0.5, 1], ease: "easeInOut" })}>
                <Item kind={kd} c={SHELF_COLORS[kd][0]} />
              </motion.g>
            </g>
          );
        })}
      </Basket>
    </svg>
  );
}

/* ── chapter 2: wrapping ──────────────────────────────────────────────────── */
function Bow({ cx, cy, s = 1 }: { cx: number; cy: number; s?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      <path d="M-3 4 L-12 26" stroke="#d94670" strokeWidth="7" strokeLinecap="round" />
      <path d="M3 4 L12 26" stroke="#f0728f" strokeWidth="7" strokeLinecap="round" />
      <path d="M0 0 C-28 -24 -46 -2 -30 14 C-18 24 -6 10 0 0 Z" fill="url(#pq-rose)" stroke="#c23a63" strokeWidth="1.1" />
      <path d="M0 0 C28 -24 46 -2 30 14 C18 24 6 10 0 0 Z" fill="url(#pq-rose)" stroke="#c23a63" strokeWidth="1.1" />
      <circle cx="0" cy="1" r="7" fill="#e8527a" stroke="#c23a63" strokeWidth="1.1" />
    </g>
  );
}

function ChapterPack({ n, reduce }: { n: number; reduce: boolean }) {
  const kinds = ORDER.slice(0, n);
  const tr = (t: any) => (reduce ? { duration: 0 } : t);
  const drop = (i: number) => 0.1 + i * 0.22;
  const flaps = drop(n - 1) + 0.5;
  const BX = 245, BY = 250;                           // box centre x and rim y
  const IN = (kd: Kind) => ({ x: IN_BASKET[kd].x + 30, y: IN_BASKET[kd].y - 6 });   // where the piece sits in the table basket
  // arm swing for each piece dropped in
  const times: number[] = [0]; const rot: number[] = [10];
  kinds.forEach((_, i) => { const t = drop(i); [[t - 0.1, 10], [t + 0.06, -62], [t + 0.26, 10]].forEach(([tt, r]) => { times.push(Math.max(0, tt as number) / (T2 - T1)); rot.push(r as number); }); });
  times.push(1); rot.push(10);
  return (
    <svg viewBox="0 0 360 440" className="absolute inset-0 w-full h-full" aria-hidden>
      <Room reduce={reduce} window={false} />
      <path d="M232 28 L232 66" stroke="#caa57a" strokeWidth="2.5" />
      <path d="M212 70 Q232 50 252 70 Z" fill="url(#pq-gold)" />
      <motion.ellipse cx="232" cy="76" rx="22" ry="12" fill="#ffe9bd" opacity=".55" animate={reduce ? undefined : { opacity: [0.35, 0.65, 0.35] }} transition={{ duration: 3, repeat: Infinity }} />
      {/* the assistant behind the table */}
      <g transform="translate(78 410) scale(1.45)">
        <Girl armL={{ initial: { rotate: 24 }, animate: { rotate: 24 } }} armR={{ initial: { rotate: 10 }, animate: { rotate: rot }, transition: tr({ duration: T2 - T1, times, ease: "easeInOut" }) }} />
      </g>
      {/* table */}
      <rect x="22" y="318" width="316" height="14" rx="7" fill="url(#pq-wood)" />
      <rect x="36" y="330" width="288" height="82" fill="#f6e3d2" />
      <rect x="36" y="330" width="288" height="5" fill="rgba(120,80,40,.12)" />
      <path d="M36 372 L324 372" stroke="rgba(120,80,40,.1)" strokeWidth="2" />
      {/* basket on the table with the pieces she picked */}
      <g transform="translate(30 -10)">
        <Basket>
          {kinds.map((kd, i) => { const b = IN_BASKET[kd]; return (
            <g key={kd} transform={`translate(${b.x} ${b.y}) scale(${b.s})`}>
              <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={tr({ delay: drop(i) + 0.03, duration: 0.01 })}><Item kind={kd} c={SHELF_COLORS[kd][0]} /></motion.g>
            </g>); })}
        </Basket>
      </g>
      {/* the box: back, pieces dropping in, tissue, front, flaps, tape, ribbon, seal */}
      <motion.g initial={{ y: 0 }} animate={reduce ? undefined : { y: [0, 0, -9, 0] }} transition={{ delay: 0, duration: T2 - T1, times: [0, 0.86, 0.93, 1] }}>
        <rect x={BX - 60} y={BY - 16} width="120" height="84" rx="6" fill="#0d0d0f" />
        <g clipPath="url(#pq-above-table)">
          {kinds.map((kd, i) => {
            const from = IN(kd); const base = SPOT[kd];
            const inBasketOrigin = { x: IN_BASKET[kd].x + 30, y: IN_BASKET[kd].y - 10 };
            const endX = BX, endY = kd === "dress" ? BY + 34 : BY + 52;
            return (
              <g key={kd} transform={`translate(${inBasketOrigin.x} ${inBasketOrigin.y})`}>
                <motion.g initial={{ opacity: 0, x: 0, y: 0, scale: IN_BASKET[kd].s, rotate: 0 }}
                  animate={{ opacity: [1, 1, 1], x: [0, (endX - inBasketOrigin.x) * 0.5, endX - inBasketOrigin.x], y: [0, -78, endY - inBasketOrigin.y], scale: [IN_BASKET[kd].s, 0.95, 0.78], rotate: [0, 10, 0] }}
                  transition={tr({ delay: drop(i) + 0.03, duration: 0.5, times: [0, 0.5, 1], ease: "easeInOut" })}>
                  <Item kind={kd} c={SHELF_COLORS[kd][0]} />
                </motion.g>
                <g style={{ display: "none" }}>{from.x}{base.x}</g>
              </g>
            );
          })}
        </g>
        {/* tissue paper puffs up */}
        <motion.g style={{ originX: 0.5, originY: 1 }} initial={{ scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }} animate={{ scale: 1, opacity: 1 }} transition={tr({ delay: flaps - 0.2, type: "spring", stiffness: 220, damping: 14 })}>
          <path d={`M${BX - 52} ${BY + 2} Q${BX - 36} ${BY - 26} ${BX - 18} ${BY - 4} Q${BX} ${BY - 30} ${BX + 18} ${BY - 4} Q${BX + 36} ${BY - 26} ${BX + 52} ${BY + 2} Z`} fill="#f9cbd7" />
          <path d={`M${BX - 40} ${BY + 2} Q${BX - 22} ${BY - 16} ${BX - 4} ${BY} Q${BX + 14} ${BY - 18} ${BX + 40} ${BY + 2} Z`} fill="#fde6ec" />
        </motion.g>
        <rect x={BX - 60} y={BY} width="120" height="68" rx="6" fill="url(#pq-black)" />
        <rect x={BX - 60} y={BY} width="120" height="8" rx="4" fill="rgba(255,255,255,.12)" />
        {/* lid flaps fold shut */}
        <motion.rect x={BX - 60} y={BY - 18} width="62" height="18" rx="3" fill="#2c2c31" style={{ originX: 0, originY: 1 }} initial={{ rotate: reduce ? 0 : -62 }} animate={{ rotate: 0 }} transition={tr({ delay: flaps, duration: 0.28, ease: "easeOut" })} />
        <motion.rect x={BX - 2} y={BY - 18} width="62" height="18" rx="3" fill="#252529" style={{ originX: 1, originY: 1 }} initial={{ rotate: reduce ? 0 : 62 }} animate={{ rotate: 0 }} transition={tr({ delay: flaps, duration: 0.28, ease: "easeOut" })} />
        {/* ribbon, bow, gold seal */}
        <motion.rect x={BX - 60} y={BY + 26} width="120" height="14" fill="url(#pq-rose)" initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} transition={tr({ delay: flaps + 0.28, duration: 0.3, ease: "easeOut" })} />
        <motion.g initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={tr({ delay: flaps + 0.5, type: "spring", stiffness: 260, damping: 13 })}>
          <Bow cx={BX} cy={BY + 33} s={0.8} />
        </motion.g>
        <motion.g initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: [0, 1.25, 1] }} transition={tr({ delay: flaps + 0.72, duration: 0.34 })}>
          <circle cx={BX + 38} cy={BY + 56} r="10" fill="url(#pq-gold)" stroke="#b88a3d" strokeWidth="1" />
          <text x={BX + 38} y={BY + 60} textAnchor="middle" fontSize="12" fontWeight="700" fill="#5a3f10" style={{ fontFamily: SERIF }}>L</text>
        </motion.g>
      </motion.g>
    </svg>
  );
}

/* ── chapter 3: the street ────────────────────────────────────────────────── */
function Street({ reduce, moving }: { reduce: boolean; moving: boolean }) {
  return (
    <g>
      <rect width="360" height="440" fill="url(#pq-sky)" />
      <circle cx="292" cy="78" r="54" fill="#ffe9c9" opacity=".5" />
      <circle cx="292" cy="78" r="30" fill="#ffd9a3" />
      <motion.g animate={reduce ? undefined : { x: [0, -26, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}>
        <ellipse cx="80" cy="70" rx="38" ry="11" fill="#fff" opacity=".8" /><ellipse cx="104" cy="62" rx="26" ry="10" fill="#fff" opacity=".8" />
        <ellipse cx="236" cy="122" rx="30" ry="8" fill="#fff" opacity=".6" />
      </motion.g>
      <path d="M0 300 L0 250 L34 250 L34 270 L66 270 L66 236 L104 236 L104 280 L140 280 L140 258 L176 258 L176 290 L214 290 L214 246 L252 246 L252 276 L292 276 L292 232 L330 232 L330 268 L360 268 L360 300 Z" fill="#f2c4cf" opacity=".7" />
      <path d="M0 330 L0 292 L48 292 L48 312 L92 312 L92 280 L130 280 L130 316 L180 316 L180 296 L232 296 L232 322 L282 322 L282 286 L326 286 L326 318 L360 318 L360 330 Z" fill="#ebb0c0" opacity=".9" />
      {/* the boutique front: the door is tall and plain behind her; awning and sign sit well above her head */}
      <rect x="-10" y="112" width="168" height="290" fill="#fff6ef" />
      <rect x="-10" y="112" width="168" height="9" fill="#f0d5c8" />
      <rect x="32" y="190" width="100" height="214" rx="7" fill="#26262b" />
      <rect x="39" y="197" width="86" height="207" rx="4" fill="url(#pq-glass)" />
      <path d="M82 197 L82 404" stroke="#26262b" strokeWidth="3" />
      <circle cx="75" cy="310" r="2.6" fill="#d9b36c" /><circle cx="89" cy="310" r="2.6" fill="#d9b36c" />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${18 + i * 25.6} 150 L${18 + (i + 1) * 25.6} 150 L${26 + (i + 1) * 22.4} 184 L${26 + i * 22.4} 184 Z`} fill={i % 2 ? "#fff" : "#f2849f"} />)}
      <path d="M26 184 L138 184 L138 188 L26 188 Z" fill="rgba(0,0,0,.08)" />
      <circle cx="82" cy="132" r="13" fill="#26262b" /><text x="82" y="137" textAnchor="middle" fontSize="15" fontWeight="700" fill="#e2bd78" style={{ fontFamily: SERIF }}>L</text>
      <rect x="-10" y="396" width="380" height="18" fill="#efe0d6" />
      <rect x="-10" y="412" width="380" height="6" fill="#d9c7bb" />
      <rect x="-10" y="418" width="380" height="30" fill="url(#pq-road)" />
      <motion.g animate={moving && !reduce ? { x: [0, -48] } : { x: 0 }} transition={moving && !reduce ? { duration: 0.35, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}>
        {Array.from({ length: 12 }).map((_, i) => <rect key={i} x={-10 + i * 48} y="430" width="26" height="4" rx="2" fill="#f3e9e2" opacity=".8" />)}
      </motion.g>
    </g>
  );
}

function Wheel({ cx, cy, spin }: { cx: number; cy: number; spin: boolean }) {
  return (
    <motion.g animate={spin ? { rotate: 360 } : { rotate: 0 }} transition={spin ? { duration: 0.4, repeat: Infinity, ease: "linear" } : { duration: 0.25 }}>
      <circle cx={cx} cy={cy} r="17" fill="#25252b" />
      <circle cx={cx} cy={cy} r="10" fill="#dcdce2" />
      <path d={`M${cx - 10} ${cy} L${cx + 10} ${cy} M${cx} ${cy - 10} L${cx} ${cy + 10}`} stroke="#9a9aa5" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="3" fill="#55555f" />
    </motion.g>
  );
}

function MiniBox({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <rect x="-27" y="-21" width="54" height="42" rx="5" fill="url(#pq-black)" />
      <rect x="-27" y="-6" width="54" height="9" fill="url(#pq-rose)" />
      <Bow cx={0} cy={-1.5} s={0.38} />
      <circle cx="19" cy="12" r="5" fill="url(#pq-gold)" />
    </g>
  );
}

function ChapterDeliver({ reduce, done, kind }: { reduce: boolean; done: boolean; kind: "scooter" | "handover" }) {
  const tr = (t: any) => (reduce ? { duration: 0 } : t);
  const [arriving, setArriving] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setArriving(false), 900); return () => window.clearTimeout(t); }, []);
  const spin = !reduce && (arriving || done);
  const boxFrom = { x: 112, y: 330 };
  const SX = 218;                                // where the scooter parks
  const CASE = { x: SX - 76, y: 430 - 84 };      // inside the top case (world)
  return (
    <svg viewBox="0 0 360 440" className="absolute inset-0 w-full h-full" aria-hidden>
      <Street reduce={reduce} moving={spin} />

      {kind === "scooter" ? (
        <motion.g initial={{ x: reduce ? 0 : 330 }} animate={{ x: done ? 470 : 0 }} transition={tr(done ? { duration: 0.95, ease: [0.5, 0, 0.9, 0.6] } : { duration: 0.85, ease: [0.12, 0.7, 0.2, 1] })}>
          <g transform={`translate(${SX} 430)`}>
            <ellipse cx="-4" cy="2" rx="86" ry="5" fill="rgba(40,20,30,.22)" />
            {/* top case: inside, then the box, then the front lip, then the lid */}
            <rect x="-98" y="-108" width="44" height="40" rx="4" fill="#0e0e10" />
            <g />
            <Wheel cx={-55} cy={-17} spin={spin} />
            <path d="M-76 -42 C-76 -62 -58 -66 -40 -66 L8 -66 C16 -66 22 -62 26 -56 L40 -38 L50 -30 C54 -26 50 -22 44 -22 L-62 -22 C-72 -24 -76 -32 -76 -42 Z" fill="url(#pq-rose)" />
            <path d="M-70 -34 L40 -34" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
            <path d="M34 -34 L40 -96 Q46 -100 52 -94 L58 -38 Q50 -28 38 -28 Z" fill="url(#pq-rose)" />
            <Wheel cx={62} cy={-17} spin={spin} />
            <rect x="-58" y="-76" width="56" height="12" rx="6" fill="#2a2a2f" />
            {/* rider */}
            <path d="M-30 -76 L8 -72" stroke="#2d2a40" strokeWidth="11" strokeLinecap="round" />
            <path d="M8 -72 L12 -28" stroke="#2d2a40" strokeWidth="11" strokeLinecap="round" />
            <ellipse cx="18" cy="-24" rx="10" ry="5" fill="#1d1d22" />
            <path d="M-40 -78 Q-46 -106 -28 -122 Q-8 -128 -6 -104 L-8 -78 Z" fill="url(#pq-rose)" />
            <path d="M-34 -80 L-30 -118" stroke="rgba(255,255,255,.55)" strokeWidth="3" strokeLinecap="round" />
            <path d="M-16 -112 Q14 -112 36 -102 L50 -100" stroke="#e0557a" strokeWidth="8.5" strokeLinecap="round" fill="none" />
            <circle cx="50" cy="-100" r="5" fill="#25252b" />
            <path d="M36 -100 L56 -104" stroke="#2a2a2f" strokeWidth="5" strokeLinecap="round" />
            <circle cx="58" cy="-92" r="5" fill="#fff7d6" />
            <circle cx="-12" cy="-136" r="14.5" fill="url(#pq-rose)" />
            <path d="M-12 -150 L-12 -122" stroke="rgba(255,255,255,.5)" strokeWidth="3" />
            <ellipse cx="-3" cy="-134" rx="9" ry="6.5" fill="rgba(40,40,62,.82)" />
            <motion.g style={{ originX: 0, originY: 1 }} initial={{ opacity: 0, rotate: -20 }} animate={{ opacity: [0, 1, 1, 0], rotate: [-20, 0, 0, -20] }} transition={tr({ delay: 1.55, duration: 0.9, times: [0, 0.2, 0.75, 1] })}>
              <path d="M-16 -112 Q8 -122 26 -134" stroke="#e0557a" strokeWidth="8.5" strokeLinecap="round" fill="none" />
              <circle cx="28" cy="-136" r="5.5" fill="#25252b" /><rect x="25" y="-148" width="6" height="11" rx="3" fill="#25252b" />
            </motion.g>
            {/* the box rides into the case */}
            <g clipPath="url(#pq-case-clip)" />
            <motion.g initial={{ opacity: 0, x: boxFrom.x - SX, y: boxFrom.y - 430, scale: 1, rotate: 0 }}
              animate={{ opacity: [1, 1, 1], x: [boxFrom.x - SX, (boxFrom.x - SX + CASE.x - SX) / 2, CASE.x - SX], y: [boxFrom.y - 430, boxFrom.y - 430 - 40, CASE.y - 430 + 8], scale: [1, 0.95, 0.72], rotate: [0, -6, 0] }}
              transition={tr({ delay: 0.95, duration: 0.5, times: [0, 0.5, 1], ease: "easeInOut" })}>
              <MiniBox />
            </motion.g>
            <rect x="-98" y="-92" width="44" height="24" rx="4" fill="url(#pq-black)" />
            <text x="-76" y="-76" textAnchor="middle" fontSize="13" fontWeight="700" fill="#e2bd78" style={{ fontFamily: SERIF }}>L</text>
            <motion.rect x="-98" y="-114" width="44" height="8" rx="4" fill="#2a2a2e" style={{ originX: 0, originY: 0.5 }} initial={{ rotate: 0 }} animate={{ rotate: [0, -72, -72, 0] }} transition={tr({ delay: 0.75, duration: 0.95, times: [0, 0.18, 0.7, 1] })} />
            {!reduce && !done && [0, 1, 2].map((i) => (
              <motion.circle key={i} cx="-104" cy="-30" r="3.5" fill="#fff" initial={{ x: -2, y: 0, opacity: 0.5, scale: 0.6 }} animate={{ x: [-2, -22], y: [0, -16], opacity: [0.5, 0], scale: [0.6, 1.4] }} transition={{ delay: 2.0 + i * 0.35, duration: 1, repeat: Infinity, ease: "easeOut" }} />
            ))}
          </g>
          {done && !reduce && [0, 1, 2].map((i) => <motion.rect key={`sp${i}`} x="30" y={344 + i * 12} width="60" height="3" rx="1.5" fill="#fff" initial={{ opacity: 0.8, scaleX: 0.4 }} animate={{ opacity: 0, scaleX: 1 }} transition={{ duration: 0.5, repeat: Infinity }} style={{ originX: 0, originY: 0.5 }} />)}
        </motion.g>
      ) : null}

      {/* the assistant at the door (and the customer, for store pickup) */}
      <motion.g initial={{ x: reduce ? 0 : -50, opacity: reduce ? 1 : 0 }} animate={{ x: 0, opacity: 1 }} transition={tr({ duration: 0.55, ease: "easeOut" })}>
        <g transform="translate(78 410) scale(1.25)">
          <Girl
            // holds the box in front of her, pushes it forward as it leaves her hands, then relaxes (and waves once done)
            armL={{ initial: { rotate: -52 }, animate: { rotate: [-52, -52, -80, -52, 16] }, transition: tr({ delay: 0.5, duration: 1.9, times: [0, 0.12, 0.26, 0.5, 1], ease: "easeInOut" }) }}
            armR={{ initial: { rotate: 52 }, animate: done ? { rotate: [-150, -122, -150, -122, -150] } : { rotate: [52, 52, 80, 52, -8] }, transition: tr(done ? { duration: 0.9, repeat: Infinity } : { delay: 0.5, duration: 1.9, times: [0, 0.12, 0.26, 0.5, 1], ease: "easeInOut" }) }}
          />
        </g>
      </motion.g>
      {kind === "handover" && (
        <>
          <motion.g initial={{ x: reduce ? 0 : 190, opacity: reduce ? 1 : 0 }} animate={{ x: 0, opacity: 1 }} transition={tr({ duration: 0.8, ease: "easeOut" })}>
            <g transform="translate(272 410) scale(-1.25 1.25)"><Girl look="customer" armL={{ initial: { rotate: -52 }, animate: { rotate: -52 } }} armR={{ initial: { rotate: 52 }, animate: done ? { rotate: [-150, -125, -150, -125, -150] } : { rotate: 52 }, transition: tr(done ? { duration: 0.9, repeat: Infinity } : {}) }} /></g>
          </motion.g>
          <motion.g initial={{ opacity: 0, x: boxFrom.x, y: boxFrom.y, scale: 1 }} animate={{ opacity: [1, 1, 1], x: [boxFrom.x, 168, 222], y: [boxFrom.y, boxFrom.y - 40, 332], scale: [1, 1.05, 1] }} transition={tr({ delay: 1.0, duration: 0.55, times: [0, 0.5, 1], ease: "easeInOut" })}>
            <MiniBox />
          </motion.g>
          {[0, 1, 2].map((i) => (
            <motion.text key={i} x={216 + i * 14} y="290" fontSize="17" textAnchor="middle" initial={{ opacity: 0, y: 296 }} animate={reduce ? { opacity: 1, y: 296 } : { opacity: [0, 1, 0], y: [296, 252] }} transition={tr({ delay: 1.7 + i * 0.25, duration: 1.1, repeat: Infinity, repeatDelay: 0.4 })}>❤️</motion.text>
          ))}
        </>
      )}
      {kind === "scooter" && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: [1, 1, 1], x: [0, 0, 0] }} transition={{ duration: 0 }}>
          {/* the box is held by the assistant until it flies into the case (it appears above, in the scooter group) */}
          <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={tr({ delay: 0.95, duration: 0.01 })}>
            <g transform={`translate(${boxFrom.x} ${boxFrom.y})`}><MiniBox /></g>
          </motion.g>
        </motion.g>
      )}
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

  // how many pieces the story handles follows the cart; frozen when the scene opens (a signed-in customer's server cart
  // is emptied the moment the order is created, and the story must not change halfway)
  const frozen = useRef<number | null>(null);
  if (!open) frozen.current = null;
  else if (frozen.current === null) frozen.current = Math.min(3, Math.max(1, images.length));
  const n = frozen.current ?? 1;

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
    { Icon: Shirt, text: ar ? "نختار قطعك" : "Picking your pieces" },
    { Icon: Package, text: ar ? "نغلّفها بحب" : "Wrapping with love" },
    method === "cod"
      ? { Icon: Truck, text: ar ? "السائق في الطريق" : "Your rider is on the way" }
      : { Icon: pickup ? Store : Truck, text: ar ? "نحوّلك لدفع آمن" : "Taking you to secure payment" },
    { Icon: Check, text: ar ? "تم! ❤️" : "Done! ❤️" },
  ];
  const cur = lines[Math.min(phase, 3)];
  const chapterSecs = [T1, T2 - T1, 2.4];

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
      data-story={pickup ? "handover" : "scooter"}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Defs />
      <motion.div className="pointer-events-none absolute -top-28 -start-24 w-96 h-96 rounded-full bg-rose-200/50 blur-3xl" aria-hidden animate={reduce ? undefined : { x: [0, 30, 0], y: [0, 24, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="pointer-events-none absolute -bottom-32 -end-20 w-96 h-96 rounded-full bg-amber-200/45 blur-3xl" aria-hidden animate={reduce ? undefined : { x: [0, -26, 0], y: [0, -20, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />

      {/* frosted caption pill + three-step progress */}
      <div className="relative z-10 mb-4 sm:mb-5 flex flex-col items-center gap-2.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={Math.min(phase, 3)}
            initial={reduce ? false : { opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.26 }}
            className="inline-flex items-center gap-2.5 rounded-full bg-white/80 backdrop-blur-xl ring-1 ring-black/5 shadow-lg shadow-rose-200/50 ps-2 pe-5 py-2"
          >
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${phase === 3 ? "bg-gradient-to-br from-emerald-400 to-emerald-600" : "bg-gradient-to-br from-rose-500 to-pink-600"}`}>
              <cur.Icon className="w-4 h-4" />
            </span>
            <span className="text-sm sm:text-base font-bold text-foreground" data-testid="purchase-scene-caption">{cur.text}</span>
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
      <div className="relative rounded-[28px] overflow-hidden ring-1 ring-black/5 shadow-[0_30px_80px_-24px_rgba(214,67,109,0.45)] bg-white" style={{ width: "min(94vw, calc((100svh - 150px) * 0.818), 500px)", aspectRatio: "360 / 440" }} data-testid="purchase-scene-stage">
        <AnimatePresence>
          <motion.div key={phase >= 2 ? "c3" : phase} className="absolute inset-0"
            initial={reduce ? false : { opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -26 }} transition={{ duration: 0.34, ease: "easeOut" }}>
            {phase === 0 && <ChapterPick n={n} reduce={reduce} />}
            {phase === 1 && <ChapterPack n={n} reduce={reduce} />}
            {phase >= 2 && <ChapterDeliver reduce={reduce} done={done} kind={pickup ? "handover" : "scooter"} />}
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
              {!reduce && Array.from({ length: 16 }).map((_, i) => {
                const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2; const d = 90 + (i % 3) * 24;
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
