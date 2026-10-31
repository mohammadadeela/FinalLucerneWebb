import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Shirt } from "lucide-react";
import { useLanguage } from "@/i18n";

/* The moment after "place order": a Lucerne gift bag packs the customer's OWN pieces.
   Their product photos drop into the bag one by one (the bag squashes a little with each landing), a rose ribbon ties
   itself into a bow, and when the order is confirmed the ring closes in green and a check pops out.

   Contract with the checkout page (unchanged): `open` while the order is being placed, `done` once it succeeded;
   the page keeps the scene up for a minimum time and removes it at once if the order fails.
   Only one short line of text changes. data-phase: 0 packing · 1 tying · 2 waiting · 3 done. */

type Method = "cod" | "card" | "pickup";

const DROP_AT = 0.8;     // first photo starts falling
const DROP_GAP = 0.75;   // between photos
const FALL = 0.9;        // how long one photo takes to drop
const PASTELS = ["from-rose-200 to-pink-300", "from-violet-200 to-fuchsia-200", "from-amber-100 to-orange-200"];

const CSS = `
@keyframes pb-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}
.pb-dot{animation:pb-dot 1.2s infinite both}
@media (prefers-reduced-motion: reduce){.pb-dot{animation:none;opacity:.6}}
`;

/** One of the customer's pieces, as a little photo card that drops into the bag. */
function Piece({ src, i, total, reduce }: { src?: string; i: number; total: number; reduce: boolean }) {
  const [broken, setBroken] = useState(false);
  const spread = total === 1 ? [0] : total === 2 ? [-46, 46] : [-86, 0, 86];
  const startX = spread[i] ?? 0;
  const tilt = [-10, 7, 12][i] ?? 0;
  const delay = DROP_AT + i * DROP_GAP;
  return (
    <motion.div
      className="absolute top-0 left-1/2 -ml-[35px] w-[70px] h-[88px] rounded-xl overflow-hidden bg-white shadow-xl ring-1 ring-black/5"
      data-testid={`scene-piece-${i}`}
      initial={reduce ? false : { x: startX, y: -12, scale: 0.4, opacity: 0, rotate: tilt * 1.6 }}
      animate={reduce
        ? { x: 0, y: 128, scale: 0.86, opacity: 1, rotate: 0 }
        : { x: [startX, startX, 0], y: [-12, 14, 128], scale: [0.4, 1, 0.86], opacity: [0, 1, 1], rotate: [tilt * 1.6, tilt, 0] }}
      transition={{ delay, duration: FALL, times: [0, 0.34, 1], ease: ["easeOut", "easeIn"] }}
    >
      {src && !broken ? (
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} draggable={false} />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${PASTELS[i % PASTELS.length]} flex items-center justify-center`}>
          <Shirt className="w-7 h-7 text-white/80" />
        </div>
      )}
    </motion.div>
  );
}

const CONFETTI = ["#e0587c", "#e2bd78", "#7bd0c0", "#c9a6d8", "#f4a9a0", "#1a1a1a"];

export default function PurchaseScene({ open, done, method, images = [] }: { open: boolean; done: boolean; method: Method; images?: string[] }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const reduce = !!useReducedMotion();
  const bag = useAnimationControls();
  const [stage, setStage] = useState(0);

  // The photos are frozen the moment the scene opens: for a signed-in customer the server empties the cart as soon as the
  // order is created, and the pieces already in the bag must not vanish or swap in the middle of the animation.
  const frozen = useRef<string[] | null>(null);
  if (!open) frozen.current = null;
  else if (frozen.current === null) frozen.current = images.slice(0, 3);
  const pieces = frozen.current ?? [];
  const n = Math.max(1, pieces.length);
  const tieAt = Math.max(2.6, DROP_AT + (n - 1) * DROP_GAP + FALL + 0.15);

  // The choreography restarts every time the scene opens (it unmounts when `open` is false).
  useEffect(() => {
    if (!open) { setStage(0); return; }
    const timers: number[] = [];
    const at = (sec: number, fn: () => void) => timers.push(window.setTimeout(fn, sec * 1000));
    // a small squash each time a photo lands in the bag
    if (!reduce) {
      for (let i = 0; i < n; i++) {
        at(DROP_AT + i * DROP_GAP + FALL * 0.82, () => { void bag.start({ scaleY: [1, 0.945, 1.025, 1], scaleX: [1, 1.035, 0.99, 1] }, { duration: 0.42, ease: "easeOut" }); });
      }
    }
    at(tieAt, () => setStage((s) => Math.max(s, 1)));
    at(tieAt + 0.9, () => {
      setStage((s) => Math.max(s, 2));
      if (!reduce) void bag.start({ y: [0, -20, 0], scaleY: [1, 1.07, 0.94, 1] }, { duration: 0.75, ease: "easeOut" });
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [open, n, tieAt, reduce, bag]);

  // On success: one last hop.
  useEffect(() => {
    if (open && done && !reduce) void bag.start({ y: [0, -22, 0], scaleY: [1, 1.07, 0.95, 1] }, { duration: 0.7, ease: "easeOut" });
  }, [open, done, reduce, bag]);

  // The page behind must not scroll while the scene plays.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const phase = done ? 3 : stage;
  const line =
    phase === 3 ? (ar ? "تم! ❤️" : "Done! ❤️")
    : phase >= 1 ? (method === "cod" ? (ar ? "نغلّفه بعناية" : "Wrapping it with care") : (ar ? "نحوّلك لدفع آمن" : "Taking you to secure payment"))
    : (ar ? "نجهّز طلبك" : "Preparing your order");
  const lineKey = phase === 3 ? "done" : phase >= 1 ? "wrap" : "prep";
  const ringTo = done ? 1 : 0.9;

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center px-4 overflow-hidden bg-gradient-to-b from-[#fff9f5] via-[#fdf0ea] to-[#f8e3da]"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={ar ? "جارٍ إتمام طلبك" : "Placing your order"}
      data-testid="purchase-scene"
      data-phase={phase}
      data-pieces={pieces.length}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <style>{CSS}</style>

      {/* two soft, slowly drifting glows for depth */}
      <motion.div className="pointer-events-none absolute -top-24 -start-24 w-80 h-80 rounded-full bg-rose-200/50 blur-3xl" aria-hidden
        animate={reduce ? undefined : { x: [0, 30, 0], y: [0, 24, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="pointer-events-none absolute -bottom-28 -end-20 w-80 h-80 rounded-full bg-amber-200/40 blur-3xl" aria-hidden
        animate={reduce ? undefined : { x: [0, -26, 0], y: [0, -20, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />

      <p className="absolute top-5 text-[11px] font-bold tracking-[0.35em] text-foreground/60" style={{ marginTop: "env(safe-area-inset-top)" }}>LUCERNE</p>

      {/* the stage: progress ring + bag + the customer's pieces (drawn at 280px, shown larger on big screens) */}
      <div className="sm:scale-[1.3] sm:my-12 origin-center">
      <motion.div
        className="relative w-[280px] h-[280px]"
        initial={reduce ? false : { opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
        data-testid="purchase-scene-stage"
      >
        <svg className="absolute inset-0" viewBox="0 0 280 280" aria-hidden>
          <defs>
            <linearGradient id="pb-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fb7185" /><stop offset="1" stopColor="#db2777" /></linearGradient>
          </defs>
          <circle cx="140" cy="140" r="134" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="3" />
          <motion.circle cx="140" cy="140" r="134" fill="none" stroke="url(#pb-ring)" strokeWidth="3.5" strokeLinecap="round" transform="rotate(-90 140 140)"
            initial={{ pathLength: reduce ? 0.9 : 0.02 }}
            animate={{ pathLength: ringTo }}
            transition={done ? { duration: 0.5, ease: "easeOut" } : { duration: tieAt + 1.6, ease: "easeInOut" }} />
          <motion.circle cx="140" cy="140" r="134" fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" transform="rotate(-90 140 140)"
            initial={{ opacity: 0 }} animate={{ opacity: done ? 1 : 0 }} transition={{ duration: 0.4 }} />
        </svg>

        {/* everything that belongs to the bag squashes and hops together */}
        <motion.div className="absolute inset-0" animate={bag} style={{ transformOrigin: "50% 86%" }}>
          {/* back of the bag: shadow, dark inside, handles */}
          <svg className="absolute inset-0" viewBox="0 0 280 280" aria-hidden>
            <defs>
              <linearGradient id="pb-inside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#050505" /><stop offset="1" stopColor="#191919" /></linearGradient>
            </defs>
            <ellipse cx="140" cy="246" rx="64" ry="7" fill="rgba(0,0,0,0.13)" />
            <path d="M116 106 C116 66 164 66 164 106" fill="none" stroke="#a8844a" strokeWidth="3.5" strokeLinecap="round" />
            <rect x="70" y="104" width="140" height="136" rx="12" fill="url(#pb-inside)" />
          </svg>

          {/* the customer's pieces, falling in between the back and the front of the bag */}
          <div className="absolute inset-0">
            {pieces.length === 0
              ? <Piece i={0} total={1} reduce={reduce} />
              : pieces.map((src, i) => <Piece key={i} src={src} i={i} total={pieces.length} reduce={reduce} />)}
          </div>

          {/* front of the bag: matte black, gold monogram, ribbon and bow */}
          <svg className="absolute inset-0" viewBox="0 0 280 280" aria-hidden>
            <defs>
              <linearGradient id="pb-front" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2c2c2c" /><stop offset="1" stopColor="#111" /></linearGradient>
              <linearGradient id="pb-rib" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f58aa5" /><stop offset="1" stopColor="#d94670" /></linearGradient>
            </defs>
            <path d="M70 128 Q140 118 210 128 L210 228 Q210 240 198 240 L82 240 Q70 240 70 228 Z" fill="url(#pb-front)" />
            <path d="M70 128 Q140 118 210 128" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.4" />
            <path d="M116 112 C116 70 164 70 164 112" fill="none" stroke="#e2bd78" strokeWidth="4.5" strokeLinecap="round" />
            <text x="140" y="172" textAnchor="middle" fontSize="40" fill="#e2bd78" style={{ fontFamily: "var(--font-display, 'Cormorant Garamond'), Georgia, serif", fontWeight: 600 }}>L</text>
            {/* ribbon band, drawn from the middle outwards */}
            <motion.rect x="70" y="190" width="140" height="16" fill="url(#pb-rib)" style={{ transformOrigin: "140px 198px" }}
              initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: stage >= 1 || done ? 1 : 0 }} transition={{ duration: 0.45, ease: "easeOut" }} />
            <motion.rect x="70" y="190" width="140" height="3" fill="rgba(255,255,255,0.28)" style={{ transformOrigin: "140px 198px" }}
              initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: stage >= 1 || done ? 1 : 0 }} transition={{ duration: 0.45, ease: "easeOut" }} />
            {/* bow */}
            <motion.g style={{ transformOrigin: "140px 198px" }}
              initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: stage >= 1 || done ? 1 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: stage >= 1 && !reduce ? 0.3 : 0 }}>
              <path d="M138 232 L127 256" stroke="#d94670" strokeWidth="8" strokeLinecap="round" />
              <path d="M142 232 L153 256" stroke="#f0728f" strokeWidth="8" strokeLinecap="round" />
              <path d="M140 198 C110 172 90 196 108 212 C120 222 134 208 140 198 Z" fill="url(#pb-rib)" stroke="#c23a63" strokeWidth="1.2" />
              <path d="M140 198 C170 172 190 196 172 212 C160 222 146 208 140 198 Z" fill="url(#pb-rib)" stroke="#c23a63" strokeWidth="1.2" />
              <circle cx="140" cy="199" r="8" fill="#e8527a" stroke="#c23a63" strokeWidth="1.2" />
            </motion.g>
          </svg>
        </motion.div>

        {/* success: a check pops out of the bag, with a small burst of confetti */}
        <AnimatePresence>
          {done && (
            <>
              <motion.div className="absolute w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg flex items-center justify-center" style={{ left: 182, top: 70 }} data-testid="scene-check"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.35 }} /></svg>
              </motion.div>
              {!reduce && Array.from({ length: 14 }).map((_, i) => {
                const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
                const d = 100 + (i % 3) * 22;
                return (
                  <motion.span key={i} className={`absolute block ${i % 3 === 0 ? "w-2 h-3 rounded-[2px]" : "w-2.5 h-2.5 rounded-full"}`} style={{ left: 138, top: 112, background: CONFETTI[i % CONFETTI.length] }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
                    animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d - 26, opacity: [1, 1, 0], scale: 1, rotate: 200 + i * 20 }}
                    transition={{ duration: 1.15, ease: "easeOut", delay: 0.05 }} />
                );
              })}
            </>
          )}
        </AnimatePresence>
      </motion.div>
      </div>

      {/* one short line */}
      <div className="mt-8 h-10 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={lineKey}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.28 }}
            className="text-xl sm:text-2xl font-bold text-foreground inline-flex items-center gap-2"
            data-testid="purchase-scene-caption"
          >
            {line}
            {!done && (
              <span className="inline-flex gap-0.5" aria-hidden>
                <span className="pb-dot w-1 h-1 rounded-full bg-foreground/60" />
                <span className="pb-dot w-1 h-1 rounded-full bg-foreground/60" style={{ animationDelay: ".2s" }} />
                <span className="pb-dot w-1 h-1 rounded-full bg-foreground/60" style={{ animationDelay: ".4s" }} />
              </span>
            )}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
