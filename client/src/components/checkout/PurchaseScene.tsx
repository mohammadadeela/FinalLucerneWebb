import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/i18n";

/* The moment after "place order": a clean white screen with three small line icons that draw themselves in,
   one after the other — your bag · packing · on its way (store pickup / secure payment) — and a big check at the end.
   No scenery, no characters, no product photos: fast and quiet, like a payment sheet.

   Contract with the checkout page (unchanged): `open` while the order is being placed, `done` once it succeeded;
   the page keeps the scene up for a minimum time and removes it at once if the order fails.
   data-phase: 0 confirming · 1 packing · 2 handover · 3 done. */

type Method = "cod" | "card" | "pickup";

const STEP_SECS = [0.9, 1.0, 0.9];                 // how long each step stays active
const T1 = STEP_SECS[0], T2 = STEP_SECS[0] + STEP_SECS[1];
const ACCENT = "#d6436d";
const SERIF = "var(--font-display, 'Cormorant Garamond'), Georgia, serif";

/* line icons, 24×24, single stroke so they can draw themselves in */
const ICONS = {
  bag: ["M6 8h12l1 12H5L6 8z", "M9 8V6a3 3 0 0 1 6 0v2"],
  box: ["M21 8l-9-4-9 4v8l9 4 9-4V8z", "M3 8l9 4 9-4", "M12 12v8"],
  truck: ["M2 7h11v9H2z", "M13 10h4l3 3v3h-7", "M7.5 16.5a1.5 1.5 0 1 0 0 .01", "M16.5 16.5a1.5 1.5 0 1 0 0 .01"],
  store: ["M4 9l1-5h14l1 5", "M4 9a2.5 2.5 0 0 0 5 0a2.5 2.5 0 0 0 5 0a2.5 2.5 0 0 0 5 0", "M5.5 11.5V20h13v-8.5", "M10 20v-5h4v5"],
  shield: ["M12 3l8 3v6c0 4.5-3.4 7.6-8 9-4.6-1.4-8-4.5-8-9V6l8-3z", "M9 12l2 2 4-4"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
} as const;
type IconName = keyof typeof ICONS;

/* the little motion an active icon makes once it has drawn in */
const IDLE: Record<IconName, { animate: Record<string, number[]>; transition: Record<string, unknown> }> = {
  bag: { animate: { y: [0, -3, 0] }, transition: { duration: 0.7, repeat: Infinity, repeatDelay: 0.3, ease: "easeOut" } },
  box: { animate: { rotate: [0, -8, 8, -5, 5, 0] }, transition: { duration: 0.9, repeat: Infinity, repeatDelay: 0.3, ease: "easeInOut" } },
  truck: { animate: { x: [0, 2.5, 0, -1, 0], y: [0, -1, 0, -1, 0] }, transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" } },
  store: { animate: { y: [0, -2.5, 0] }, transition: { duration: 0.8, repeat: Infinity, repeatDelay: 0.3, ease: "easeOut" } },
  shield: { animate: { scale: [1, 1.1, 1] }, transition: { duration: 0.9, repeat: Infinity, repeatDelay: 0.2, ease: "easeInOut" } },
  check: { animate: { scale: [1, 1, 1] }, transition: { duration: 0 } },
};

function Icon({ name, draw, delay = 0, reduce, idle = false, className = "" }: { name: IconName; draw: boolean; delay?: number; reduce: boolean; idle?: boolean; className?: string }) {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}
      animate={idle && !reduce ? IDLE[name].animate : { x: 0, y: 0, rotate: 0, scale: 1 }} transition={idle && !reduce ? IDLE[name].transition : { duration: 0.2 }}>
      {ICONS[name].map((d, i) => (
        <motion.path key={d} d={d} initial={{ pathLength: draw && !reduce ? 0 : 1, opacity: draw && !reduce ? 0 : 1 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ pathLength: { delay: delay + i * 0.12, duration: 0.4, ease: "easeOut" }, opacity: { delay: delay + i * 0.12, duration: 0.1 } }} />
      ))}
    </motion.svg>
  );
}


/* ── three tiny characters (48×42 boxes) ──────────────────────────────────── */
const SK = "#f3c9a8", INK = "#2b2b30";

/* a courier on a rose scooter: wheels spin and she bobs while riding, little puffs trail behind */
function Courier({ moving, reduce }: { moving: boolean; reduce: boolean }) {
  const spin = moving && !reduce;
  const wheel = (cx: number) => (
    <g transform={`translate(${cx} 33)`}>
      <circle r="5" fill={INK} />
      <motion.g style={{ originX: 0.5, originY: 0.5 }} animate={spin ? { rotate: 360 } : { rotate: 0 }} transition={spin ? { duration: 0.5, repeat: Infinity, ease: "linear" } : { duration: 0 }}>
        <circle r="2" fill="#fff" /><path d="M-2 0 L2 0" stroke={INK} strokeWidth="1" />
      </motion.g>
    </g>
  );
  return (
    <motion.svg viewBox="0 0 48 42" className="w-12 h-[42px] overflow-visible" animate={spin ? { y: [0, -1.5, 0] } : { y: 0 }} transition={spin ? { duration: 0.35, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}>
      {spin && [0, 1, 2].map((i) => (
        <motion.circle key={i} cx="4" cy="30" r="2" fill="#e5e5e5" initial={{ x: 0, opacity: 0 }} animate={{ x: [0, -12], y: [0, -4], opacity: [0.9, 0], scale: [0.6, 1.4] }} transition={{ delay: i * 0.25, duration: 0.7, repeat: Infinity, ease: "easeOut" }} />
      ))}
      {wheel(11)}{wheel(37)}
      <path d="M8 28 L24 28 Q30 28 32 24 L36 16" stroke={ACCENT} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 28 L18 22 L26 22" stroke={ACCENT} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="4" y="19" width="10" height="8" rx="2" fill={INK} /><text x="9" y="25.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#f3d795" style={{ fontFamily: SERIF }}>L</text>
      <path d="M33 16 L40 15" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M19 22 L23 12 L30 12 L33 15" stroke="#fff6ee" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 12 L30 12 L33 15" stroke={ACCENT} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27" cy="7" r="5" fill={SK} />
      <path d="M22 7 Q22 1 27 1 Q32 1 32 7 Z" fill={INK} /><path d="M31 6 L34 7 L31 8 Z" fill={INK} />
      <circle cx="29" cy="7.5" r=".8" fill={INK} />
    </motion.svg>
  );
}

/* a customer walking to the boutique with her Lucerne bag (store pickup) */
function Walker({ moving, reduce }: { moving: boolean; reduce: boolean }) {
  const go = moving && !reduce;
  const leg = (x: number, phase: number) => (
    <g transform={`translate(${x} 30)`}>
      <motion.path d="M0 0 L-1 9" stroke={INK} strokeWidth="3.5" strokeLinecap="round" style={{ originX: 0, originY: 0 }}
        animate={go ? { rotate: phase ? [18, -18, 18] : [-18, 18, -18] } : { rotate: phase ? 6 : -6 }} transition={go ? { duration: 0.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }} />
    </g>
  );
  return (
    <motion.svg viewBox="0 0 48 42" className="w-12 h-[42px] overflow-visible" animate={go ? { y: [0, -1.5, 0] } : { y: 0 }} transition={go ? { duration: 0.25, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}>
      {leg(21, 0)}{leg(27, 1)}
      <path d="M19 15 L29 15 L31 30 L17 30 Z" fill={ACCENT} />
      <motion.path d="M20 17 L15 26" stroke={SK} strokeWidth="3" strokeLinecap="round" style={{ originX: 1, originY: 0 }} animate={go ? { rotate: [-14, 14, -14] } : { rotate: 0 }} transition={go ? { duration: 0.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }} />
      <g>
        <path d="M28 17 L33 24" stroke={SK} strokeWidth="3" strokeLinecap="round" />
        <path d="M30 26 L38 26 L39 36 L31 36 Z" fill="#fff" stroke={INK} strokeWidth="1.2" /><path d="M32 26 Q34.5 21 37 26" stroke={INK} strokeWidth="1.2" fill="none" />
        <text x="34.5" y="33" textAnchor="middle" fontSize="5" fontWeight="700" fill={ACCENT} style={{ fontFamily: SERIF }}>L</text>
      </g>
      <circle cx="24" cy="8" r="6" fill={SK} />
      <path d="M18 8 Q18 1 24 1 Q30 1 30 8 L30 13 Q28 10 27 7 Q21 8 18 12 Z" fill="#5a3a2a" />
      <circle cx="26" cy="8.5" r=".8" fill={INK} />
    </motion.svg>
  );
}

/* the happy customer at the end: arms up, hopping, a heart floating off her */
function Happy({ reduce }: { reduce: boolean }) {
  return (
    <motion.svg viewBox="0 0 48 42" className="w-12 h-[42px] overflow-visible" animate={reduce ? undefined : { y: [0, -7, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.35, ease: "easeOut" }}>
      {!reduce && (
        <motion.path d="M24 -2 c-2 -3 -6 -1 -4 2 l4 4 l4 -4 c2 -3 -2 -5 -4 -2z" fill={ACCENT} initial={{ y: 0, opacity: 0, scale: 0.6 }} animate={{ y: [0, -16], opacity: [0, 1, 0], scale: [0.6, 1, 0.9] }} transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 0.5, ease: "easeOut" }} />
      )}
      <path d="M20 34 L20 40" stroke={INK} strokeWidth="3.5" strokeLinecap="round" /><path d="M28 34 L28 40" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M18 17 L30 17 L33 34 L15 34 Z" fill={ACCENT} />
      <motion.path d="M19 19 L12 10" stroke={SK} strokeWidth="3" strokeLinecap="round" style={{ originX: 1, originY: 1 }} animate={reduce ? undefined : { rotate: [0, 18, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.35 }} />
      <motion.path d="M29 19 L36 10" stroke={SK} strokeWidth="3" strokeLinecap="round" style={{ originX: 0, originY: 1 }} animate={reduce ? undefined : { rotate: [0, -18, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.35 }} />
      <path d="M34 4 L41 4 L42 12 L35 12 Z" fill="#fff" stroke={INK} strokeWidth="1.2" /><path d="M36 4 Q37.5 0 39 4" stroke={INK} strokeWidth="1.2" fill="none" />
      <circle cx="24" cy="9" r="7" fill={SK} />
      <path d="M17 9 Q17 1 24 1 Q31 1 31 9 L31 15 Q30 12 29 9 Q24 7 19 12 L17 15 Z" fill={INK} />
      <circle cx="21.5" cy="9.5" r=".9" fill={INK} /><circle cx="26.5" cy="9.5" r=".9" fill={INK} />
      <path d="M22 12.5 Q24 14.5 26 12.5" stroke="#c0515d" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <circle cx="19.5" cy="12" r="1.3" fill="#f4a9b8" opacity=".7" /><circle cx="28.5" cy="12" r="1.3" fill="#f4a9b8" opacity=".7" />
    </motion.svg>
  );
}

export default function PurchaseScene({ open, done, method }: { open: boolean; done: boolean; method: Method; images?: string[] }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const reduce = !!useReducedMotion();
  const [stage, setStage] = useState(0);

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
  const last: { icon: IconName; ar: string; en: string } = pickup
    ? { icon: "store", ar: "جاهز للاستلام", en: "Ready to collect" }
    : method === "card"
      ? { icon: "shield", ar: "دفع آمن", en: "Secure payment" }
      : { icon: "truck", ar: "في الطريق", en: "On its way" };
  const steps: { icon: IconName; ar: string; en: string }[] = [
    { icon: "bag", ar: "نؤكد طلبك", en: "Confirming" },
    { icon: "box", ar: "نجهّز طلبك", en: "Packing" },
    last,
  ];
  const caption = phase === 3
    ? (ar ? "تم الطلب بنجاح" : "Order placed")
    : (ar ? ["نؤكد طلبك…", "نجهّز طلبك…", pickup ? "نحضّره للاستلام…" : method === "card" ? "نحوّلك لدفع آمن…" : "نسلّمه للتوصيل…"][phase]
          : ["Confirming your order…", "Packing your order…", pickup ? "Getting it ready to collect…" : method === "card" ? "Taking you to secure payment…" : "Handing it to delivery…"][phase]);

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-white px-6 overflow-hidden"
      role="dialog" aria-modal="true" aria-live="polite" aria-label={ar ? "جارٍ إتمام طلبك" : "Placing your order"}
      data-testid="purchase-scene" data-phase={phase} data-story={pickup ? "pickup" : method === "card" ? "card" : "delivery"}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* brand mark */}
      <motion.div className="absolute top-10 inset-x-0 text-center select-none" aria-hidden initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="text-[11px] tracking-[0.42em] uppercase text-neutral-500" style={{ fontFamily: SERIF }}>Lucerne Boutique</div>
      </motion.div>

      <div className="w-full max-w-sm flex flex-col items-center" data-testid="purchase-scene-stage">
        <AnimatePresence mode="wait">
          {phase < 3 ? (
            /* three small icons, drawn in one after the other */
            <motion.div key="steps" className="w-full" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -12, scale: 0.96 }} transition={{ duration: 0.3 }}>
              <ol className="relative flex items-start justify-between" dir="ltr">
                {steps.map((s, i) => {
                  const isDone = i < phase;
                  const active = i === phase;
                  return (
                    <li key={i} className="relative flex-1 flex flex-col items-center" data-testid={`scene-step-${i}`} data-state={isDone ? "done" : active ? "active" : "todo"}>
                      {i < steps.length - 1 && (
                        <span className="absolute top-7 left-1/2 w-full h-px bg-neutral-200" aria-hidden>
                          <motion.span className="absolute inset-y-0 left-0 origin-left" style={{ background: ACCENT, width: "100%" }}
                            initial={{ scaleX: isDone ? 1 : 0 }} animate={{ scaleX: isDone ? 1 : active ? 1 : 0 }}
                            transition={active && !reduce ? { duration: STEP_SECS[i], ease: "linear" } : { duration: 0.25 }} />
                        </span>
                      )}
                      <motion.span
                        className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center border bg-white"
                        animate={{ borderColor: isDone || active ? ACCENT : "#e5e5e5", backgroundColor: isDone ? ACCENT : "#ffffff", color: isDone ? "#ffffff" : active ? ACCENT : "#a3a3a3", scale: active ? 1.06 : 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {active && !reduce && (
                          <motion.span className="absolute inset-0 rounded-full border" style={{ borderColor: ACCENT }} aria-hidden
                            initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.55, opacity: 0 }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }} />
                        )}
                        <AnimatePresence mode="wait" initial={false}>
                          {isDone ? (
                            <motion.span key="check" className="flex" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
                              <Icon name="check" draw={!reduce} reduce={reduce} className="w-6 h-6" />
                            </motion.span>
                          ) : (
                            <motion.span key="icon" className="flex" exit={reduce ? undefined : { scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}>
                              <Icon name={s.icon} draw={active} delay={0.1} reduce={reduce} idle={active} className="w-6 h-6" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.span>
                      <span className={`mt-2.5 text-[11px] font-semibold tracking-wide transition-colors ${isDone || active ? "text-neutral-900" : "text-neutral-400"}`}>{ar ? s.ar : s.en}</span>
                    </li>
                  );
                })}
              </ol>
              {/* a tiny character travels along a track under the steps, from step to step */}
              <div className="relative mt-5 h-12" aria-hidden data-testid="scene-track">
                <span className="absolute left-[16.67%] right-[16.67%] bottom-0 border-t border-dashed border-neutral-200" />
                <motion.div className="absolute bottom-0" initial={reduce ? false : { left: "16.67%", opacity: 0 }} animate={{ left: `${((2 * phase + 1) / 6) * 100}%`, opacity: 1 }}
                  transition={reduce ? { duration: 0 } : { left: { duration: phase === 0 ? 0 : 0.7, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.3 } }}>
                  <div className="-translate-x-1/2">
                    {pickup ? <Walker moving={!reduce && phase > 0} reduce={reduce} /> : <Courier moving={!reduce && phase > 0} reduce={reduce} />}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            /* done: one big check */
            <motion.div key="done" className="relative flex flex-col items-center" initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
              {!pickup && !reduce && (
                <motion.div className="absolute -left-16 top-24" aria-hidden initial={{ x: 0, opacity: 1 }} animate={{ x: 520, opacity: [1, 1, 0] }} transition={{ duration: 0.75, ease: [0.5, 0, 0.9, 0.5] }}>
                  <Courier moving reduce={reduce} />
                </motion.div>
              )}
              <motion.div className="absolute left-[calc(50%+58px)] top-14" aria-hidden initial={reduce ? false : { opacity: 0, y: 16, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.45, type: "spring", stiffness: 300, damping: 15 }}>
                <Happy reduce={reduce} />
              </motion.div>
              <div className="relative w-24 h-24 flex items-center justify-center" data-testid="scene-check">
                {!reduce && [0, 1].map((i) => (
                  <motion.span key={i} className="absolute inset-0 rounded-full border-2" style={{ borderColor: ACCENT }} aria-hidden
                    initial={{ scale: 0.9, opacity: 0.5 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ delay: 0.15 + i * 0.3, duration: 1.0, ease: "easeOut" }} />
                ))}
                <motion.span className="w-24 h-24 rounded-full flex items-center justify-center text-white shadow-[0_18px_40px_-16px_rgba(214,67,109,0.6)]" style={{ background: ACCENT }}
                  initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}>
                  <motion.svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
                    <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }} />
                  </motion.svg>
                </motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* one quiet caption */}
        <div className="mt-9 h-12 flex flex-col items-center justify-start text-center">
          <AnimatePresence mode="wait">
            <motion.p key={phase} className={`font-semibold text-neutral-900 ${phase === 3 ? "text-lg" : "text-base"}`} data-testid="purchase-scene-caption"
              initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
              {caption}
            </motion.p>
          </AnimatePresence>
          {phase === 3 && (
            <motion.p className="mt-1.5 text-sm text-neutral-500" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.3 }}>
              {ar ? "شكراً لتسوقك من لوسيرن بوتيك" : "Thank you for shopping with Lucerne Boutique"}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}
