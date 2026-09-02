import { useState, useEffect, useRef, type CSSProperties } from "react";
import { ShoppingBag, Check } from "lucide-react";

interface CartItem {
  productName: string;
  productNameAr: string;
  quantity: number;
  unitPrice: number;
  size?: string;
  color?: string;
  image?: string;
}

interface CartState {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paymentMethod: "cash" | "card" | "split" | null;
  completed: boolean;
  currency: string;
}

const EMPTY_STATE: CartState = {
  items: [],
  subtotal: 0,
  discountAmount: 0,
  total: 0,
  paymentMethod: null,
  completed: false,
  currency: "₪",
};

/* ── Brand mark ────────────────────────────────────────────────────────
   Same artwork used for the product-image watermark, reused here as the
   hero logo for the customer screen. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      version="1.0"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 393 297"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <ellipse cx="210" cy="120" rx="122" ry="50" transform="rotate(-42 246 132)" fill="#97d5d4" />
      <ellipse cx="169" cy="240" rx="67" ry="40" transform="rotate(35 176 240)" fill="#f4d3dc" />
      <ellipse cx="156" cy="200" rx="40" ry="15" transform="rotate(13 160 196)" fill="#f06ee8" />
      <g
        transform="translate(0,297) scale(0.1,-0.1)"
        fill="#1a1a1a"
        stroke="#1a1a1a"
        strokeWidth="18"
        strokeLinejoin="round"
      >
        <path
          d="M2685 2594 c-179 -27 -296 -59 -490 -136 -259 -103 -609 -284 -965
-501 -126 -77 -160 -104 -160 -124 0 -26 34 -12 158 65 434 269 823 464 1138
571 167 57 252 73 379 75 100 1 115 -1 160 -25 105 -53 147 -157 126 -310 -15
-115 -53 -252 -108 -389 -114 -287 -230 -468 -408 -638 -133 -127 -246 -199
-407 -257 -76 -27 -77 -27 -101 -9 -113 89 -164 123 -242 160 -128 61 -190 76
-342 81 -115 5 -141 3 -201 -16 -114 -34 -167 -103 -125 -159 11 -15 37 -37
59 -49 52 -30 240 -89 334 -105 102 -17 356 -17 449 1 l74 15 49 -55 c67 -75
133 -175 176 -267 33 -70 37 -85 37 -163 0 -78 -2 -89 -27 -122 -16 -20 -53
-48 -85 -64 -55 -27 -64 -28 -198 -28 -145 0 -184 8 -345 66 -194 71 -407 241
-518 414 -151 234 -171 410 -152 1340 4 223 3 256 -13 301 -37 107 -122 196
-225 235 -71 26 -176 37 -187 19 -12 -19 23 -40 64 -40 69 0 161 -41 217 -96
57 -57 104 -160 104 -227 0 -39 -17 -49 -39 -24 -6 8 -35 19 -64 26 -103 23
-199 -28 -248 -133 -59 -124 -18 -252 87 -274 60 -13 151 6 196 40 18 14 37
26 42 27 6 0 10 -131 11 -337 2 -555 40 -725 211 -949 208 -272 589 -458 899
-440 163 10 250 52 298 146 64 128 4 322 -165 534 -32 39 -58 75 -58 80 0 4
10 12 23 17 12 5 56 23 99 40 222 90 465 318 620 583 130 221 234 512 257 716
20 186 -46 322 -179 366 -48 16 -166 26 -215 19z m-1854 -495 c30 -12 55 -50
64 -99 9 -50 -36 -135 -92 -174 -34 -23 -53 -29 -102 -30 -53 -1 -64 2 -87 26
-38 37 -44 107 -14 175 45 104 128 141 231 102z m759 -1010 c92 -23 220 -84
294 -139 100 -73 76 -85 -169 -85 -189 1 -281 15 -424 66 -113 39 -145 59
-149 91 -5 38 38 61 173 92 38 9 200 -6 275 -25z"
        />
      </g>
    </svg>
  );
}

/* ── Soft flying butterflies ──────────────────────────────────────────
   A small kaleidoscope of brand butterflies drifts around the screen.
   Each one follows its own organic wandering path (layered slow sines),
   tilts into its direction of travel, "flaps" via a subtle 3D fold and
   sheds a faint pastel sparkle trail. All of them are driven by one
   shared requestAnimationFrame loop for performance. Purely decorative:
   pointer-events are disabled and reduced-motion is respected. */
interface FlyerCfg {
  size: number;      // px width
  speed: number;     // time multiplier — how briskly it wanders
  opacity: number;   // smaller/further ones are fainter
  cx: number; cy: number;              // path center (% of viewport)
  ax1: number; ax2: number;            // x amplitudes (%)
  ay1: number; ay2: number;            // y amplitudes (%)
  f: [number, number, number, number]; // frequencies
  ph: [number, number, number, number];// phase offsets
  sparkEvery: number;                  // ms between sparkles
}

const FLYERS: FlyerCfg[] = [
  { size: 46, speed: 1.0,  opacity: 1,    cx: 50, cy: 44, ax1: 33, ax2: 11, ay1: 25, ay2: 9,  f: [0.093, 0.221, 0.117, 0.263], ph: [1.4, 4.2, 0.6, 2.1], sparkEvery: 240 },
  { size: 34, speed: 1.25, opacity: 0.92, cx: 34, cy: 36, ax1: 26, ax2: 9,  ay1: 22, ay2: 7,  f: [0.081, 0.197, 0.131, 0.241], ph: [3.9, 0.8, 2.7, 5.1], sparkEvery: 340 },
  { size: 28, speed: 1.45, opacity: 0.85, cx: 66, cy: 58, ax1: 24, ax2: 8,  ay1: 20, ay2: 8,  f: [0.104, 0.233, 0.089, 0.211], ph: [5.6, 2.3, 4.4, 1.0], sparkEvery: 420 },
  { size: 38, speed: 0.85, opacity: 0.95, cx: 58, cy: 30, ax1: 28, ax2: 10, ay1: 18, ay2: 6,  f: [0.071, 0.183, 0.122, 0.251], ph: [0.2, 3.3, 1.8, 4.7], sparkEvery: 300 },
  { size: 24, speed: 1.6,  opacity: 0.8,  cx: 42, cy: 62, ax1: 22, ax2: 7,  ay1: 19, ay2: 7,  f: [0.113, 0.207, 0.097, 0.229], ph: [2.6, 5.4, 3.5, 0.4], sparkEvery: 500 },
  { size: 31, speed: 1.1,  opacity: 0.9,  cx: 22, cy: 55, ax1: 17, ax2: 6,  ay1: 24, ay2: 8,  f: [0.087, 0.191, 0.109, 0.237], ph: [4.8, 1.6, 5.9, 3.0], sparkEvery: 380 },
  { size: 21, speed: 1.75, opacity: 0.75, cx: 76, cy: 40, ax1: 18, ax2: 6,  ay1: 21, ay2: 6,  f: [0.121, 0.243, 0.093, 0.219], ph: [1.1, 4.5, 0.9, 5.7], sparkEvery: 560 },
  { size: 42, speed: 0.75, opacity: 0.97, cx: 48, cy: 24, ax1: 30, ax2: 9,  ay1: 14, ay2: 5,  f: [0.067, 0.171, 0.127, 0.257], ph: [3.2, 0.3, 2.0, 4.0], sparkEvery: 280 },
];

const SPARK_COLORS = ["#97d5d4", "#f4d3dc", "#f06ee8"];

function FlyingButterflies() {
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const midRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const flapPhase = FLYERS.map((_, i) => i * 1.7); // desynchronized wingbeats
    const lastSpark = FLYERS.map(() => 0);

    const posAt = (c: FlyerCfg, t: number) => ({
      x: c.cx + c.ax1 * Math.sin(t * c.f[0] + c.ph[0]) + c.ax2 * Math.sin(t * c.f[1] + c.ph[1]),
      y: c.cy + c.ay1 * Math.sin(t * c.f[2] + c.ph[2]) + c.ay2 * Math.sin(t * c.f[3] + c.ph[3]),
    });

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const trail = trailRef.current;

      for (let i = 0; i < FLYERS.length; i++) {
        const c = FLYERS[i];
        const t = ((now - t0) / 1000) * c.speed;

        const p = posAt(c, t);
        const q = posAt(c, t + 0.04);
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dir = dx >= 0 ? 1 : -1;           // face the way it flies
        const spd = Math.hypot(dx, dy) / 0.04;  // % of screen per second
        const tilt = Math.max(-15, Math.min(15, dy * 85)); // nose up/down

        /* Wingbeat speeds up slightly when it flies faster;
           smaller butterflies naturally beat a little quicker. */
        flapPhase[i] +=
          2 * Math.PI * (0.9 + 12 / c.size + Math.min(1.4, spd * 0.09)) * c.speed * dt;
        const flap = Math.sin(flapPhase[i]) * 46 + 8;

        const px = (p.x / 100) * window.innerWidth;
        const py = (p.y / 100) * window.innerHeight;

        const wrap = wrapRefs.current[i];
        const mid = midRefs.current[i];
        const flapEl = flapRefs.current[i];
        if (wrap) wrap.style.transform = `translate3d(${px - c.size / 2}px, ${py - c.size / 2}px, 0)`;
        if (mid) mid.style.transform = `scaleX(${dir}) rotate(${tilt}deg)`;
        if (flapEl) flapEl.style.transform = `rotateY(${flap}deg)`;

        /* Pastel sparkle trail (globally capped for performance) */
        if (now - lastSpark[i] > c.sparkEvery && trail && trail.childElementCount < 28) {
          lastSpark[i] = now;
          const s = document.createElement("span");
          const col = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
          const d = 2 + (c.size / 46) * (1 + Math.random() * 3);
          s.className = "bfly-spark";
          s.style.left = `${px + (Math.random() * 14 - 7) - dir * (c.size * 0.32)}px`;
          s.style.top = `${py + (Math.random() * 12 - 2)}px`;
          s.style.width = `${d}px`;
          s.style.height = `${d}px`;
          s.style.background = `radial-gradient(circle, ${col}, transparent 70%)`;
          trail.appendChild(s);
          setTimeout(() => s.remove(), 1700);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="bfly-layer pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      <div ref={trailRef} className="absolute inset-0" />
      {FLYERS.map((c, i) => (
        <div
          key={i}
          ref={(el) => { wrapRefs.current[i] = el; }}
          className="absolute top-0 left-0 will-change-transform"
          style={{ opacity: c.opacity }}
        >
          <div ref={(el) => { midRefs.current[i] = el; }} style={{ perspective: 300 }}>
            <div
              ref={(el) => { flapRefs.current[i] = el; }}
              style={{
                width: c.size,
                height: c.size * 0.78,
                filter: `drop-shadow(0 ${c.size * 0.14}px ${c.size * 0.18}px rgba(0,0,0,0.14))`,
              }}
            >
              <BrandMark className="w-full h-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Celebration burst ────────────────────────────────────────────────
   When a sale completes, a handful of little butterflies flutter up
   the screen once and fade away. */
const BURST_CONFIG = [
  { left: "12%", size: 22, dur: 4.6, delay: 0.0, sway: 26 },
  { left: "28%", size: 18, dur: 5.4, delay: 0.5, sway: -22 },
  { left: "45%", size: 26, dur: 4.2, delay: 0.2, sway: 32 },
  { left: "62%", size: 20, dur: 5.8, delay: 0.7, sway: -28 },
  { left: "78%", size: 24, dur: 4.9, delay: 0.35, sway: 24 },
  { left: "88%", size: 17, dur: 5.2, delay: 0.9, sway: -18 },
];

function ButterflyBurst() {
  return (
    <div className="bfly-layer pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      {BURST_CONFIG.map((b, i) => (
        <div
          key={i}
          className="absolute"
          style={
            {
              left: b.left,
              bottom: "-60px",
              "--sway": `${b.sway}px`,
              animation: `burstRise ${b.dur}s ease-in ${b.delay}s both`,
            } as CSSProperties
          }
        >
          <div style={{ perspective: 260 }}>
            <div
              style={{
                width: b.size,
                height: b.size * 0.78,
                animation: `burstFlap 0.42s ease-in-out ${b.delay}s infinite alternate`,
              }}
            >
              <BrandMark className="w-full h-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function POSCustomer() {
  const [cart, setCart] = useState<CartState>(EMPTY_STATE);
  const [flash, setFlash] = useState(false);

  /* ── Kiosk-style fullscreen ────────────────────────────────────────
     Hides the browser's own chrome (address bar, tabs, close button)
     so the customer only ever sees the display itself. A direct call
     on mount works in some browsers; browsers that block it because
     there's no user gesture yet will get it on the very first tap
     anywhere on the screen instead — no visible button needed. */
  useEffect(() => {
    const tryFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    tryFullscreen();
    document.addEventListener("click", tryFullscreen, { once: true });
    document.addEventListener("keydown", tryFullscreen, { once: true });
    return () => {
      document.removeEventListener("click", tryFullscreen);
      document.removeEventListener("keydown", tryFullscreen);
    };
  }, []);

  useEffect(() => {
    document.title = "شاشة العميل — Lucerne Boutique";

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("lucerne-pos");
      channel.onmessage = (e) => {
        if (e.data?.type === "CART_UPDATE") {
          setCart(e.data.payload);
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
        }
        if (e.data?.type === "CART_CLEAR") {
          setCart(EMPTY_STATE);
          try { localStorage.removeItem("lucerne_pos_cart"); } catch {}
        }
      };
    } catch {
      /* BroadcastChannel not supported in this environment */
    }

    /* Also poll localStorage as fallback */
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem("lucerne_pos_cart");
        if (raw) {
          const parsed = JSON.parse(raw);
          setCart(parsed);
        }
      } catch {}
    }, 500);

    return () => {
      channel?.close();
      clearInterval(interval);
    };
  }, []);

  /* Auto-reset to welcome screen 6s after a completed sale */
  useEffect(() => {
    if (!cart.completed) return;
    const timer = setTimeout(() => {
      setCart(EMPTY_STATE);
      try { localStorage.removeItem("lucerne_pos_cart"); } catch {}
    }, 6000);
    return () => clearTimeout(timer);
  }, [cart.completed]);

  const fmt = (n: number) => `${cart.currency}${n.toFixed(2)}`;
  const isEmpty = cart.items.length === 0;
  const isCompleted = cart.completed;

  return (
    <div
      className="min-h-screen w-screen bg-white text-neutral-900 flex flex-col font-sans overflow-hidden relative"
      dir="rtl"
    >
      <style>{`
        @keyframes brandFadeUp {
          0% { opacity: 0; transform: translateY(18px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes brandFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes brandGlow {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
        @keyframes itemSlideIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .brand-enter { animation: brandFadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .brand-float { animation: brandFloat 6s ease-in-out infinite; }
        .brand-glow { animation: brandGlow 4s ease-in-out infinite; }
        .item-enter { animation: itemSlideIn 0.35s ease-out both; }
        .bfly-spark { position: absolute; border-radius: 9999px; animation: bflySpark 1.6s ease-out forwards; }
        @keyframes bflySpark {
          0% { opacity: 0; transform: translateY(0) scale(0.4); }
          18% { opacity: 0.9; }
          100% { opacity: 0; transform: translateY(-28px) scale(1.1); }
        }
        @keyframes burstRise {
          0% { transform: translate3d(0, 0, 0) rotate(-8deg); opacity: 0; }
          8% { opacity: 1; }
          45% { transform: translate3d(var(--sway), -46vh, 0) rotate(7deg); }
          100% { transform: translate3d(calc(var(--sway) * -0.7), -96vh, 0) rotate(-5deg); opacity: 0; }
        }
        @keyframes burstFlap {
          from { transform: rotateY(58deg); }
          to { transform: rotateY(-14deg); }
        }
        @media (prefers-reduced-motion: reduce) { .bfly-layer { display: none; } }
      `}</style>

      {/* Ambient background glow, echoing the logo's pastel palette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="brand-glow absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full bg-[#97d5d4]/10 blur-3xl" />
        <div className="brand-glow absolute -bottom-40 -left-24 w-[480px] h-[480px] rounded-full bg-[#f06ee8]/10 blur-3xl" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* Soft flying brand butterflies (only while the cart is empty) + celebration on completed sale */}
      {isEmpty && !isCompleted && <FlyingButterflies />}
      {isCompleted && <ButterflyBurst />}

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        {isCompleted ? (
          /* ── Completed state ───────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 brand-enter">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center">
              <Check className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-emerald-600">شكراً لك!</h2>
              <p className="text-neutral-600 text-lg">تمت عملية الشراء بنجاح</p>
              <p className="text-neutral-400 text-sm">Thank you for shopping with us</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl px-10 py-6 text-center mt-4">
              <p className="text-neutral-500 text-sm mb-1">المبلغ الإجمالي</p>
              <p className="text-5xl font-bold text-white">{fmt(cart.total)}</p>
            </div>
            <div className="flex items-center gap-2 mt-2 opacity-40">
              <BrandMark className="w-8 h-8" />
              <span className="text-[11px] tracking-[0.25em] uppercase text-neutral-500" style={{ fontFamily: "Georgia, serif" }}>
                Lucerne Boutique
              </span>
            </div>
          </div>
        ) : isEmpty ? (
          /* ── Empty / Welcome state ────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 brand-enter">
            <div className="relative brand-float">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#97d5d4]/20 via-[#f4d3dc]/20 to-[#f06ee8]/20 blur-2xl scale-125" />
              <div className="relative w-52 h-52 md:w-64 md:h-64 rounded-full bg-white border border-neutral-100 shadow-2xl shadow-neutral-200 flex items-center justify-center p-8">
                <BrandMark className="w-full h-full" />
              </div>
            </div>
            <div className="text-center space-y-4">
              <h2
                className="text-5xl md:text-6xl font-bold text-neutral-900"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.12em" }}
              >
                LUCERNE
              </h2>
              <p
                className="text-neutral-400 text-xl md:text-2xl uppercase"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.35em" }}
              >
                Boutique
              </p>
              <p className="text-neutral-400 text-sm mt-4">في انتظار إضافة المنتجات...</p>
            </div>
            {/* Decorative line */}
            <div className="w-40 h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent" />
          </div>
        ) : (
          /* ── Cart items ────────────────────────────────────────── */
          <div className="flex-1 flex gap-0 overflow-hidden min-h-0">
            {/* Items list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ShoppingBag className="w-3.5 h-3.5" />
                المنتجات المختارة
              </h2>
              {cart.items.map((item, idx) => (
                <div
                  key={idx}
                  className={`item-enter flex items-center gap-4 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 transition-all duration-300 ${flash && idx === cart.items.length - 1 ? "bg-neutral-100 border-neutral-300" : ""}`}
                >
                  {/* Image / placeholder */}
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-neutral-100 shrink-0 flex items-center justify-center">
                    {item.image ? (
                      <img src={item.image} alt={item.productNameAr} className="w-full h-full object-cover" />
                    ) : (
                      <BrandMark className="w-12 h-12 opacity-60" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 text-sm leading-snug truncate">
                      {item.productNameAr || item.productName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.size && (
                        <span className="text-[11px] text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded">
                          {item.size}
                        </span>
                      )}
                      {item.color && (
                        <span className="text-[11px] text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded">
                          {item.color}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Qty × price */}
                  <div className="text-right shrink-0">
                    <p className="text-neutral-900 font-bold text-base">{fmt(item.unitPrice * item.quantity)}</p>
                    <p className="text-neutral-400 text-xs">
                      {item.quantity} × {fmt(item.unitPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals sidebar */}
            <div className="w-72 bg-neutral-50 border-r border-neutral-200 p-6 flex flex-col justify-between gap-4">
              <div className="flex flex-col items-center justify-center text-center gap-2 opacity-80">
                <BrandMark className="w-16 h-16" />
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-700" style={{ fontFamily: "Georgia, serif" }}>
                  Lucerne Boutique
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-neutral-500">المجموع الفرعي</span>
                  <span className="text-neutral-800 font-mono">{fmt(cart.subtotal)}</span>
                </div>

                {cart.discountAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-600/80">الخصم</span>
                    <span className="text-emerald-600 font-mono">−{fmt(cart.discountAmount)}</span>
                  </div>
                )}

                <div className="h-px bg-neutral-100" />

                <div className="flex justify-between items-center">
                  <span className="text-neutral-700 text-sm font-semibold">الإجمالي</span>
                  <span className="text-neutral-900 font-bold text-3xl font-mono">{fmt(cart.total)}</span>
                </div>

                {/* Items count badge */}
                <div className="bg-neutral-50 rounded-xl px-4 py-2 flex justify-between items-center border border-neutral-200">
                  <span className="text-neutral-400 text-xs">عدد المنتجات</span>
                  <span className="text-neutral-800 text-sm font-semibold">
                    {cart.items.reduce((s, i) => s + i.quantity, 0)} قطعة
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 bg-white/80 backdrop-blur-sm border-t border-neutral-200 px-8 py-3 flex items-center justify-center gap-2 shrink-0">
        <BrandMark className="w-6 h-6 opacity-40" />
        <p className="text-neutral-400 text-xs">Lucerne Boutique — لوسيرن بوتيك</p>
      </div>
    </div>
  );
}
