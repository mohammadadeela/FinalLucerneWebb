import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { ROSE, SealShape, SealTick } from "@/components/ui/success-seal";

/* The moment after "place order": one rose line draws the story on a white sheet —
     a bag (your pieces) → a parcel → a van / the boutique / a shield
     → a ring that becomes the Lucerne seal with a check.
   The seal then glides up to exactly where the confirmation page shows its own seal, which starts rose and turns
   green, so the two screens read as one motion.

   Contract with the checkout page (unchanged): `open` while the order is being placed, `done` once it succeeded;
   the page keeps the scene up for a minimum time and removes it at once if the order fails.
   data-phase: 0 bag · 1 parcel · 2 on its way (loops until the server confirms) · 3 done. */

type Method = "cod" | "card" | "pickup";

const T1 = 1.0, T2 = 1.8;                  // when the parcel and the last icon start drawing
const ACCENT = "#d6436d";
const SERIF = "var(--font-display, 'Cormorant Garamond'), Georgia, serif";
const STAGE = 280;                         // px; the ring is r=64 of a 320 box, so the seal (112 px) covers it exactly
const tr = (reduce: boolean, t: Record<string, unknown>) => (reduce ? { duration: 0 } : t);

/* one stroke that draws itself in, then flows off the end of the line */
function Stroke({ d, at, out, reduce, strokeWidth = 4, loop }: { d: string; at: number; out?: number; reduce: boolean; strokeWidth?: number; loop?: boolean }) {
  return (
    <motion.path d={d} fill="none" stroke={ACCENT} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      initial={{ pathLength: reduce ? 1 : 0, pathOffset: 0, opacity: 1 }}
      animate={out === undefined ? { pathLength: 1, pathOffset: 0 } : { pathLength: [0, 1, 1, 1], pathOffset: [0, 0, 0, 1] }}
      transition={tr(reduce, out === undefined
        ? { pathLength: { delay: at, duration: 0.5, ease: "easeOut" } }
        : { duration: out + 0.3, times: [0, 0.5 / (out + 0.3), out / (out + 0.3), 1], ease: ["easeOut", "linear", "easeIn"], delay: at } )} />
  );
}

export default function PurchaseScene({ open, done, method }: { open: boolean; done: boolean; method: Method; images?: string[] }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const reduce = !!useReducedMotion();
  const [stage, setStage] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [glide, setGlide] = useState<{ from: number; to: number; left: number } | null>(null);
  const scrollbar = useRef(0);

  useEffect(() => {
    if (!open) { setStage(0); setGlide(null); return; }
    const timers = [window.setTimeout(() => setStage((s) => Math.max(s, 1)), T1 * 1000), window.setTimeout(() => setStage((s) => Math.max(s, 2)), T2 * 1000)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollbar.current = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // where the confirmation page's seal sits: navbar padding + the page's top padding (see .pt-navbar and OrderConfirmation)
  useLayoutEffect(() => {
    if (!done || !open) return;
    // the page underneath is still scrolled to the "place order" button; put it at the top now, under the sheet,
    // so the confirmation page opens at the top with its seal in view
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = window.innerWidth;
    const newsBar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--news-bar-offset")) || 0;
    const target = (w >= 640 ? 144 : 120) + newsBar;   // navbar 5rem + the page's top padding (2.5rem on phones, 4rem from sm)
    setGlide({ from: r.top + r.height / 2 - 56, to: target, left: (w - scrollbar.current) / 2 - 56 });
  }, [done, open]);

  if (!open) return null;

  const phase = done ? 3 : stage;
  const pickup = method === "pickup";
  const captions = ar
    ? ["نستلم طلبك…", "نجهّز طلبك…", pickup ? "نحضّره للاستلام…" : method === "card" ? "نحوّلك لدفع آمن…" : "في الطريق إليك…", "تم الطلب بنجاح"]
    : ["Receiving your order…", "Packing your order…", pickup ? "Getting it ready to collect…" : method === "card" ? "Taking you to secure payment…" : "On its way to you…", "Order placed"];

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-white px-6 overflow-hidden"
      role="dialog" aria-modal="true" aria-live="polite" aria-label={ar ? "جارٍ إتمام طلبك" : "Placing your order"}
      data-testid="purchase-scene" data-phase={phase} data-story={pickup ? "pickup" : method === "card" ? "card" : "delivery"}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <motion.div className="absolute top-8 sm:top-10 inset-x-0 flex flex-col items-center gap-2 select-none" aria-hidden initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: done ? 0 : 1, y: 0 }} transition={{ duration: 0.4 }}>
        <span className="w-10 h-10 rounded-full flex items-center justify-center text-[#2a2a2f] text-lg font-bold shadow-md" style={{ fontFamily: SERIF, background: "linear-gradient(135deg,#f6e2a6 0%,#cfa355 55%,#f1d68e 100%)" }}>L</span>
        <span className="text-xl sm:text-2xl tracking-[0.3em] uppercase text-neutral-900 leading-none" style={{ fontFamily: SERIF, fontWeight: 600 }}>Lucerne</span>
        <span className="text-[10px] sm:text-[11px] tracking-[0.45em] uppercase text-neutral-500 leading-none" style={{ fontFamily: SERIF }}>Boutique</span>
      </motion.div>

      {/* the sheet the line draws on */}
      <div ref={stageRef} className="relative" style={{ width: STAGE, height: STAGE }} data-testid="purchase-scene-stage">
        <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
          {/* a faint track the story travels along */}
          <path d="M56 236 H264" stroke="#eeeeee" strokeWidth="1.5" strokeDasharray="4 6" fill="none" />

          {/* 1 · the bag */}
          {!done && (
            <Stroke reduce={reduce} at={0.1} out={0.95}
              d="M118 150 V134 a42 42 0 0 1 84 0 V150 M104 150 H216 L227 230 Q228 238 220 238 H100 Q92 238 93 230 Z" />
          )}

          {/* 2 · the parcel */}
          {stage >= 1 && !done && (
            <Stroke reduce={reduce} at={0.05} out={0.75} d="M96 150 L160 120 L224 150 V222 L160 252 L96 222 Z M96 150 L160 180 L224 150 M160 180 V252" />
          )}

          {/* 3 · on its way: the van, the boutique, or the shield — it keeps bobbing until the server says yes */}
          {stage >= 2 && (
            <motion.g animate={done ? { opacity: 0 } : { opacity: 1, y: reduce ? 0 : [0, -2, 0] }} transition={done ? { duration: 0.2 } : { y: { duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.6 } }}>
              {pickup ? (<>
                <Stroke reduce={reduce} at={0.05} d="M80 150 L92 118 H228 L240 150 M80 150 a16 16 0 0 0 32 0 a16 16 0 0 0 32 0 a16 16 0 0 0 32 0 a16 16 0 0 0 32 0 a16 16 0 0 0 32 0 M94 164 V236 H226 V164" />
                <Stroke reduce={reduce} at={0.35} d="M144 236 V192 Q144 186 150 186 H170 Q176 186 176 192 V236 M110 200 H126 M194 200 H210" strokeWidth={3.5} />
              </>) : method === "card" ? (<>
                <Stroke reduce={reduce} at={0.05} d="M160 116 L214 134 V186 C214 218 188 240 160 250 C132 240 106 218 106 186 V134 Z" />
                <Stroke reduce={reduce} at={0.4} d="M138 186 L154 202 L184 168" strokeWidth={5} />
              </>) : (<>
                <Stroke reduce={reduce} at={0.05} d="M84 150 Q84 144 90 144 H196 V222 H84 Z M196 172 H230 Q236 172 240 177 L252 192 V222 H196" />
                <Stroke reduce={reduce} at={0.3} d="M204 180 H228 L238 194 H204 Z" strokeWidth={3} />
                <Stroke reduce={reduce} at={0.35} d="M106 232 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M210 232 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0" />
              </>)}
            </motion.g>
          )}

          {/* 4 · the ring and the check, at the very end */}
          {done && (<>
            <motion.circle cx="160" cy="160" r="64" fill="none" stroke={ACCENT} strokeWidth="4" strokeLinecap="round" transform="rotate(-90 160 160)"
              initial={{ pathLength: reduce ? 1 : 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0] }} transition={tr(reduce, { pathLength: { delay: 0.15, duration: 0.45, ease: "easeOut" }, opacity: { delay: 0.75, duration: 0.2, times: [0, 0.01, 1] } })} />
            <motion.path d="M130 162 L150 182 L190 138" fill="none" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0] }} transition={tr(reduce, { pathLength: { delay: 0.45, duration: 0.35, ease: "easeOut" }, opacity: { delay: 0.75, duration: 0.2, times: [0, 0.01, 1] } })} />
          </>)}
        </svg>
      </div>

      {/* the seal pops over the ring, then glides up to where the confirmation page will show its own */}
      <AnimatePresence>
        {done && glide && (
          <motion.div className="absolute w-28 h-28" style={{ top: glide.to, left: glide.left }} data-testid="scene-check"
            initial={{ y: glide.from - glide.to, scale: reduce ? 1 : 0 }} animate={{ y: [glide.from - glide.to, glide.from - glide.to, 0], scale: 1 }}
            transition={tr(reduce, { scale: { delay: 0.7, type: "spring", stiffness: 320, damping: 16 }, y: { delay: 1.15, duration: 0.5, times: [0, 0, 1], ease: [0.3, 0, 0.1, 1] } })}>
            <SealShape id="scene-seal" colors={ROSE} className="absolute inset-0 w-full h-full drop-shadow-[0_18px_30px_rgba(214,67,109,0.35)]" />
            <SealTick className="absolute inset-0 w-full h-full" delay={reduce ? 0 : 0.95} duration={0.35} draw={!reduce} />
            {!reduce && [0, 1].map((i) => (
              <motion.span key={i} className="absolute inset-0 rounded-full border-2" style={{ borderColor: ACCENT }} aria-hidden initial={{ scale: 0.9, opacity: 0.5 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ delay: 0.85 + i * 0.25, duration: 0.9, ease: "easeOut" }} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* caption */}
      <div className="mt-6 h-12 flex flex-col items-center text-center">
        <AnimatePresence mode="wait">
          <motion.p key={phase} className="font-semibold text-neutral-900 text-base" data-testid="purchase-scene-caption"
            initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            {captions[phase]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
