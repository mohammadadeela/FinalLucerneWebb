import { useEffect, useState } from "react";
import { Check, Package, ScanLine, ShieldCheck, ShoppingBag } from "lucide-react";
import { useLanguage } from "@/i18n";

/* The "this is a real purchase" moment shown while the order is being placed.

   A customer walks into the boutique, the cashier scans her pieces, she pays, her order is wrapped, and she
   leaves with the bag. It plays while the real request is in flight (the page keeps it on screen for a minimum
   time so it never flashes by, and removes it immediately if the order fails).

   Everything is drawn in SVG and moved with CSS, keyed off the `data-phase` attribute on the scene:
   -1 entering · 0 walking to the counter · 1 scanning · 2 paying · 3 wrapping · 4 waiting for the server · 5 leaving. */

type Method = "card" | "cod" | "pickup";

const CSS = `
.sc-stage svg{width:100%;height:auto;display:block}
.sc-cust{transform:translateX(-330px);transition:transform 1.05s cubic-bezier(.22,1,.36,1)}
.sc-stage[data-phase="0"] .sc-cust,.sc-stage[data-phase="1"] .sc-cust,.sc-stage[data-phase="2"] .sc-cust,
.sc-stage[data-phase="3"] .sc-cust,.sc-stage[data-phase="4"] .sc-cust{transform:translateX(0)}
.sc-stage[data-phase="5"] .sc-cust{transform:translateX(-360px);transition:transform 1.15s cubic-bezier(.5,0,.9,.6) .45s}
.sc-flip{transform-box:view-box;transform-origin:190px 0;transition:transform 0s .35s}
.sc-stage[data-phase="5"] .sc-flip{transform:scaleX(-1)}
.sc-bob{animation:sc-bob .5s ease-in-out infinite}
.sc-stage[data-phase="1"] .sc-bob,.sc-stage[data-phase="2"] .sc-bob,.sc-stage[data-phase="3"] .sc-bob,.sc-stage[data-phase="4"] .sc-bob{animation:none}
@keyframes sc-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.sc-item{opacity:0;transform:translate(-170px,-30px) scale(.5);transition:opacity .5s ease,transform .7s cubic-bezier(.34,1.56,.64,1);transition-delay:calc(var(--i) * .22s)}
.sc-stage[data-phase="1"] .sc-item,.sc-stage[data-phase="2"] .sc-item{opacity:1;transform:none}
.sc-stage[data-phase="3"] .sc-item,.sc-stage[data-phase="4"] .sc-item,.sc-stage[data-phase="5"] .sc-item{opacity:0;transform:translate(60px,-40px) scale(.15);transition-delay:calc(var(--i) * .08s)}
.sc-laser{opacity:0}
.sc-stage[data-phase="1"] .sc-laser{animation:sc-laser .32s linear 4}
@keyframes sc-laser{0%,100%{opacity:0}40%,60%{opacity:1}}
.sc-arm{transform-box:view-box;transform-origin:452px 196px}
.sc-stage[data-phase="1"] .sc-arm{animation:sc-scan .55s ease-in-out 3 alternate}
@keyframes sc-scan{from{transform:rotate(-9deg)}to{transform:rotate(9deg)}}
.sc-stage[data-phase="5"] .sc-arm{animation:sc-wave .5s ease-in-out 4 alternate}
@keyframes sc-wave{from{transform:rotate(-30deg)}to{transform:rotate(18deg)}}
.sc-beep{opacity:0;transform-box:fill-box;transform-origin:center}
.sc-stage[data-phase="1"] .sc-beep{animation:sc-pop 1.4s ease .5s 1 both}
@keyframes sc-pop{0%{opacity:0;transform:scale(.3)}25%{opacity:1;transform:scale(1.15)}45%{transform:scale(1)}85%{opacity:1}100%{opacity:0;transform:scale(1)}}
.sc-card{opacity:0;transform:translate(-175px,38px) rotate(-12deg);transition:opacity .4s,transform .8s cubic-bezier(.22,1,.36,1)}
.sc-stage[data-phase="2"] .sc-card{opacity:1;transform:none}
.sc-stage[data-phase="3"] .sc-card,.sc-stage[data-phase="4"] .sc-card,.sc-stage[data-phase="5"] .sc-card{opacity:0;transform:translate(-175px,38px)}
.sc-led{fill:#9ca3af;transition:fill .3s ease .7s}
.sc-stage[data-phase="2"] .sc-led,.sc-stage[data-phase="3"] .sc-led,.sc-stage[data-phase="4"] .sc-led,.sc-stage[data-phase="5"] .sc-led{fill:#22c55e}
.sc-tick{opacity:0;transform-box:fill-box;transform-origin:center}
.sc-stage[data-phase="2"] .sc-tick{animation:sc-pop 1.6s ease .9s 1 both}
.sc-receipt{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0);transition:transform .9s cubic-bezier(.22,1,.36,1) .1s}
.sc-stage[data-phase="3"] .sc-receipt,.sc-stage[data-phase="4"] .sc-receipt,.sc-stage[data-phase="5"] .sc-receipt{transform:scaleY(1)}
.sc-bag{transform-box:fill-box;transform-origin:50% 100%;transform:scale(0);transition:transform .7s cubic-bezier(.34,1.56,.64,1) .35s}
.sc-stage[data-phase="3"] .sc-bag,.sc-stage[data-phase="4"] .sc-bag{transform:scale(1)}
.sc-stage[data-phase="5"] .sc-bag{transform:scale(0);transition:transform .25s ease}
.sc-hbag{opacity:0;transition:opacity .2s ease .3s}
.sc-stage[data-phase="5"] .sc-hbag{opacity:1}
.sc-heart{opacity:0}
.sc-stage[data-phase="5"] .sc-heart{animation:sc-rise 1.8s ease-out calc(var(--d) * 1s) 1 both}
@keyframes sc-rise{0%{opacity:0;transform:translateY(0) scale(.5)}20%{opacity:1}100%{opacity:0;transform:translateY(-70px) scale(1.2)}}
.sc-wait .sc-dot{animation:sc-dots 1.2s ease-in-out infinite}
.sc-wait .sc-dot:nth-child(2){animation-delay:.18s}.sc-wait .sc-dot:nth-child(3){animation-delay:.36s}
@keyframes sc-dots{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
@keyframes sc-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.sc-caption{animation:sc-fade .45s ease both}
@media (prefers-reduced-motion: reduce){.sc-stage *,.sc-wrap *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;transition-delay:0s!important}}
`;

const SKIN = "#f1c7a5";

function Scene({ phase }: { phase: number }) {
  return (
    <div className="sc-stage" data-phase={phase} data-testid="purchase-scene-stage">
      <svg viewBox="0 0 640 360" role="img" aria-label="Shopping at Lucerne">
        <defs>
          <linearGradient id="sc-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff7f2" /><stop offset="1" stopColor="#f7e6dd" /></linearGradient>
          <linearGradient id="sc-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c58c5c" /><stop offset="1" stopColor="#a8703f" /></linearGradient>
        </defs>

        {/* shop interior */}
        <rect width="640" height="300" fill="url(#sc-wall)" />
        <rect y="300" width="640" height="60" fill="#e6d2c4" />
        <rect y="300" width="640" height="5" fill="#d8bfae" />
        {/* clothes rail */}
        <line x1="30" y1="84" x2="270" y2="84" stroke="#8b7355" strokeWidth="4" strokeLinecap="round" />
        {[[60, "#e7a3b5"], [110, "#c9a6d8"], [160, "#9ec9c1"], [210, "#f0c987"]].map(([x, c], i) => (
          <g key={i}>
            <line x1={x as number} y1="84" x2={x as number} y2="96" stroke="#8b7355" strokeWidth="2" />
            <path d={`M${(x as number) - 16} 98 Q${x} 92 ${(x as number) + 16} 98 L${(x as number) + 22} 168 Q${x} 176 ${(x as number) - 22} 168 Z`} fill={c as string} opacity=".95" />
          </g>
        ))}
        {/* shelf */}
        <rect x="30" y="196" width="130" height="6" rx="2" fill="#b98757" />
        <rect x="40" y="170" width="30" height="26" rx="3" fill="#e9c6cf" /><rect x="76" y="176" width="26" height="20" rx="3" fill="#b9d6d0" /><rect x="108" y="166" width="34" height="30" rx="3" fill="#f2d7a6" />
        {/* wall sign */}
        <g transform="translate(470 58)">
          <rect x="-86" y="-22" width="172" height="44" rx="10" fill="#fff" stroke="#e1c9bb" strokeWidth="2" />
          <text x="0" y="-2" textAnchor="middle" fontSize="15" fontWeight="800" letterSpacing="5" fill="#1a1a1a" fontFamily="Georgia,serif">LUCERNE</text>
          <text x="0" y="14" textAnchor="middle" fontSize="8" letterSpacing="6" fill="#9a8478">BOUTIQUE</text>
        </g>
        {/* plant */}
        <g transform="translate(610 250)"><rect x="-12" y="20" width="24" height="30" rx="4" fill="#c78b62" /><path d="M0 22 C-20 0 -22 -24 -4 -34 C-2 -14 6 6 0 22 Z M0 22 C18 4 26 -16 12 -30 C2 -14 0 6 0 22 Z" fill="#6fa583" /></g>

        {/* customer (walks in from the left, leaves the same way) */}
        <g className="sc-cust">
          <g className="sc-flip">
            <ellipse cx="190" cy="304" rx="42" ry="7" fill="rgba(0,0,0,.13)" />
            <g className="sc-bob">
              {/* legs + shoes */}
              <rect x="178" y="262" width="9" height="38" rx="4" fill={SKIN} /><rect x="194" y="262" width="9" height="38" rx="4" fill={SKIN} />
              <ellipse cx="183" cy="302" rx="10" ry="5" fill="#3a2a2f" /><ellipse cx="199" cy="302" rx="10" ry="5" fill="#3a2a2f" />
              {/* coat / dress */}
              <path d="M156 174 Q190 160 224 174 L242 272 Q190 286 138 272 Z" fill="#9d2a4d" />
              <path d="M190 166 L190 276" stroke="#7d1f3c" strokeWidth="2" />
              <rect x="150" y="206" width="80" height="7" rx="3" fill="#d8a85a" />
              <path d="M172 164 L190 186 L208 164" fill="#f7e9ee" stroke="#e7cdd6" strokeWidth="1.5" />
              {/* free arm */}
              <path d="M158 180 Q138 220 146 250" stroke="#9d2a4d" strokeWidth="13" strokeLinecap="round" fill="none" /><circle cx="146" cy="254" r="7" fill={SKIN} />
              {/* arm that holds the bag */}
              <path d="M222 180 Q250 210 252 240" stroke="#9d2a4d" strokeWidth="13" strokeLinecap="round" fill="none" /><circle cx="252" cy="244" r="7" fill={SKIN} />
              <g className="sc-hbag">
                <path d="M246 246 q6 -14 12 0" stroke="#7a5a3c" strokeWidth="2.5" fill="none" />
                <rect x="236" y="246" width="34" height="38" rx="4" fill="#fff" stroke="#e3cfc3" strokeWidth="2" />
                <text x="253" y="271" textAnchor="middle" fontSize="15" fontWeight="800" fill="#1a1a1a" fontFamily="Georgia,serif">L</text>
              </g>
              {/* head + soft headscarf */}
              <circle cx="190" cy="142" r="24" fill={SKIN} />
              <path d="M163 146 Q161 108 190 106 Q219 108 217 146 Q216 166 204 176 Q190 156 176 176 Q164 166 163 146 Z" fill="#e8b4c4" />
              <path d="M170 146 Q190 126 210 146 Q208 120 190 118 Q172 120 170 146 Z" fill={SKIN} />
              <circle cx="182" cy="146" r="2.4" fill="#2b1d20" /><circle cx="198" cy="146" r="2.4" fill="#2b1d20" />
              <path d="M183 156 Q190 162 197 156" stroke="#b5524f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              <circle cx="176" cy="154" r="4" fill="#f4a9a0" opacity=".55" /><circle cx="204" cy="154" r="4" fill="#f4a9a0" opacity=".55" />
            </g>
            {/* payment card in her hand → terminal */}
            <g className="sc-card"><rect x="250" y="226" width="30" height="19" rx="3" fill="#1a1a1a" /><rect x="250" y="231" width="30" height="4" fill="#d8a85a" /></g>
          </g>
        </g>

        {/* counter */}
        <rect x="316" y="238" width="324" height="92" fill="url(#sc-wood)" />
        <rect x="308" y="228" width="332" height="14" rx="4" fill="#dcae80" />
        <text x="478" y="292" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="6" fill="rgba(255,255,255,.55)" fontFamily="Georgia,serif">LUCERNE</text>

        {/* cashier */}
        <g>
          <path d="M432 238 L436 192 Q470 178 504 192 L508 238 Z" fill="#5fb3a6" />
          <path d="M448 192 L492 192 L498 238 L442 238 Z" fill="#fff" opacity=".92" />
          <path d="M458 196 L470 214 L482 196" fill="none" stroke="#e4dcd6" strokeWidth="2" />
          <circle cx="470" cy="150" r="23" fill={SKIN} />
          <path d="M447 148 Q446 120 470 120 Q494 120 493 148 Q484 130 470 130 Q456 130 447 148 Z" fill="#33231f" />
          <circle cx="470" cy="112" r="11" fill="#33231f" />
          <circle cx="462" cy="152" r="2.3" fill="#2b1d20" /><circle cx="478" cy="152" r="2.3" fill="#2b1d20" />
          <path d="M463 161 Q470 167 477 161" stroke="#b5524f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <circle cx="456" cy="160" r="3.6" fill="#f4a9a0" opacity=".5" /><circle cx="484" cy="160" r="3.6" fill="#f4a9a0" opacity=".5" />
          <g className="sc-arm"><path d="M452 196 Q426 214 410 224" stroke="#5fb3a6" strokeWidth="12" strokeLinecap="round" fill="none" /><circle cx="406" cy="226" r="6.5" fill={SKIN} /></g>
        </g>

        {/* counter-top: scanner, items, terminal, register, bag */}
        <g>
          <rect x="378" y="222" width="46" height="7" rx="2" fill="#2b2b2b" />
          <rect className="sc-laser" x="380" y="214" width="42" height="2.6" fill="#ff3b3b" />
          <rect className="sc-laser" x="380" y="216" width="42" height="12" fill="#ff3b3b" opacity=".15" />
          <g transform="translate(364 206)">
            <g className="sc-item" style={{ ["--i" as any]: 0 }}><rect x="0" y="0" width="22" height="16" rx="3" fill="#e7a3b5" /><rect x="0" y="6" width="22" height="3" fill="#fff" opacity=".7" /></g>
            <g className="sc-item" style={{ ["--i" as any]: 1 }} transform="translate(26 -4)"><path d="M0 18 Q2 2 14 2 L22 10 L22 18 Z" fill="#9ec9c1" /><rect x="0" y="16" width="22" height="3" fill="#7fb0a7" /></g>
            <g className="sc-item" style={{ ["--i" as any]: 2 }} transform="translate(52 2)"><rect x="0" y="0" width="20" height="14" rx="3" fill="#f0c987" /><circle cx="10" cy="7" r="3" fill="#fff" opacity=".8" /></g>
          </g>
          {/* "beep" bubble */}
          <g className="sc-beep" transform="translate(402 176)"><rect x="-22" y="-14" width="44" height="24" rx="12" fill="#1a1a1a" /><path d="M-4 10 L0 17 L4 10 Z" fill="#1a1a1a" /><text x="0" y="3" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">BEEP</text></g>
          {/* card terminal */}
          <g transform="translate(292 206)"><rect x="0" y="0" width="38" height="22" rx="4" fill="#2f2f33" /><rect x="4" y="4" width="30" height="8" rx="2" fill="#4b4b52" /><circle className="sc-led" cx="31" cy="17" r="3" />
            <g className="sc-tick"><circle cx="19" cy="-14" r="11" fill="#22c55e" /><path d="M13 -14 l5 5 l9 -10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g></g>
          {/* register + receipt */}
          <rect x="536" y="198" width="76" height="32" rx="5" fill="#2f2f33" /><rect x="544" y="204" width="34" height="14" rx="2" fill="#7bd0c0" /><rect x="584" y="205" width="22" height="18" rx="2" fill="#4b4b52" />
          <rect className="sc-receipt" x="566" y="146" width="22" height="54" fill="#fff" stroke="#e4dcd6" />
          {[156, 166, 176, 186].map((y) => <line key={y} x1="570" y1={y} x2="584" y2={y} stroke="#c9bfb8" strokeWidth="2" />)}
          {/* paper bag */}
          <g className="sc-bag" transform="translate(508 180)">
            <path d="M12 8 q8 -18 16 0" stroke="#7a5a3c" strokeWidth="3" fill="none" />
            <rect x="0" y="8" width="40" height="46" rx="4" fill="#fff" stroke="#e3cfc3" strokeWidth="2" />
            <text x="20" y="38" textAnchor="middle" fontSize="18" fontWeight="800" fill="#1a1a1a" fontFamily="Georgia,serif">L</text>
            <path d="M0 14 H40" stroke="#f0d9cf" strokeWidth="3" />
          </g>
        </g>

        {/* hearts when she leaves */}
        {[[150, 120, 0], [190, 100, 0.25], [225, 124, 0.5]].map(([x, y, d], i) => (
          <path key={i} className="sc-heart" style={{ ["--d" as any]: d }} transform={`translate(${x} ${y})`} d="M0 6 C-10 -4 -5 -12 0 -6 C5 -12 10 -4 0 6 Z" fill="#e0587c" />
        ))}
      </svg>
    </div>
  );
}

export default function PurchaseScene({ open, done, method }: { open: boolean; done: boolean; method: Method }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const [phase, setPhase] = useState(-1);

  // Restart the story every time the scene opens.
  useEffect(() => {
    if (!open) { setPhase(-1); return; }
    const timers = [
      window.setTimeout(() => setPhase(0), 60),
      window.setTimeout(() => setPhase((p) => (p < 5 ? 1 : p)), 1300),
      window.setTimeout(() => setPhase((p) => (p < 5 ? 2 : p)), 2550),
      window.setTimeout(() => setPhase((p) => (p < 5 ? 3 : p)), 3700),
      window.setTimeout(() => setPhase((p) => (p < 5 ? 4 : p)), 4700),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [open]);
  useEffect(() => { if (open && done) setPhase(5); }, [open, done]);

  // The page behind must not scroll while the scene plays.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const steps = [
    { icon: ShoppingBag, ar: "نجهّز سلتك", en: "Getting your bag ready" },
    { icon: ScanLine, ar: "نمسح قطعك", en: "Scanning your pieces" },
    method === "cod"
      ? { icon: Check, ar: "نؤكد طلبك", en: "Confirming your order" }
      : { icon: ShieldCheck, ar: method === "pickup" ? "نجهّز الدفع الآمن" : "نحوّلك لدفع آمن", en: "Securing your payment" },
    { icon: Package, ar: "نغلّف طلبك بحب", en: "Wrapping it with love" },
  ];
  const headline = [
    ar ? "أهلاً بكِ في لوسيرن ❤️" : "Welcome to Lucerne ❤️",
    ar ? "الكاشير تمسح قطعك…" : "Our cashier is scanning your pieces…",
    method === "cod" ? (ar ? "نسجّل طلبك الآن…" : "Recording your order…") : (ar ? "نتأكد من الدفع بأمان…" : "Checking your payment securely…"),
    ar ? "نغلّف طلبك بعناية 🎁" : "Wrapping your order with care 🎁",
    ar ? "لحظات ونكمل التفاصيل الأخيرة" : "Just a moment while we finish up",
    done ? (ar ? "تم! شكراً لتسوقك معنا 🛍️" : "Done! Thank you for shopping with us 🛍️") : "",
  ];
  const current = Math.min(Math.max(phase, 0), 5);
  const activeStep = Math.min(current, 3);
  const pct = phase < 0 ? 4 : done ? 100 : Math.min(94, 12 + current * 20);

  return (
    <div
      className="sc-wrap fixed inset-0 z-[400] flex flex-col items-center justify-center px-4 bg-gradient-to-b from-[#fff9f5] via-[#fdf0ea] to-[#f8e3da]"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={ar ? "جارٍ إتمام طلبك" : "Placing your order"}
      data-testid="purchase-scene"
      data-phase={phase}
    >
      <style>{CSS}</style>
      <p className="absolute top-5 text-[11px] font-bold tracking-[0.35em] text-foreground/70">LUCERNE BOUTIQUE</p>
      <div className="w-full max-w-xl">
        <div className="rounded-3xl overflow-hidden shadow-2xl ring-1 ring-black/5 bg-white">
          <Scene phase={phase} />
        </div>

        <div className="mt-6 text-center min-h-[64px]">
          <p key={current} className="sc-caption text-lg sm:text-xl font-bold text-foreground" data-testid="purchase-scene-caption">{headline[current]}</p>
          <p className="mt-1 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            {ar ? "لا تغلقي الصفحة" : "Please keep this page open"}
            <span className="sc-wait inline-flex gap-0.5" aria-hidden><span className="sc-dot w-1 h-1 rounded-full bg-foreground/60" /><span className="sc-dot w-1 h-1 rounded-full bg-foreground/60" /><span className="sc-dot w-1 h-1 rounded-full bg-foreground/60" /></span>
          </p>
        </div>

        <div className="mt-4 h-1.5 w-full rounded-full bg-black/10 overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-4 grid grid-cols-4 gap-2" data-testid="purchase-scene-steps">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const finished = done || i < activeStep;
            const active = !done && i === activeStep;
            return (
              <li key={i} className={`flex flex-col items-center gap-1.5 text-center transition-opacity duration-500 ${finished || active ? "opacity-100" : "opacity-40"}`}>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors duration-500 ${finished ? "bg-emerald-500 border-emerald-500 text-white" : active ? "bg-foreground border-foreground text-background" : "border-foreground/25 text-foreground/60"}`}>
                  {finished ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold leading-tight">{ar ? s.ar : s.en}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
