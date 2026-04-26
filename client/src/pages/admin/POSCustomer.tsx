import { useState, useEffect } from "react";
import { ShoppingCart, Check, Store } from "lucide-react";

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

export default function POSCustomer() {
  const [cart, setCart] = useState<CartState>(EMPTY_STATE);
  const [flash, setFlash] = useState(false);

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
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <div className="bg-black/60 border-b border-white/10 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Store className="w-5 h-5 text-white/80" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide text-white/90" style={{ fontFamily: "Georgia, serif" }}>
              Lucerne Boutique
            </h1>
            <p className="text-[11px] text-white/40 leading-none">لوسيرن بوتيك</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-white/50">متصل</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {isCompleted ? (
          /* ── Completed state ───────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center">
              <Check className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-emerald-400">شكراً لك!</h2>
              <p className="text-white/60 text-lg">تمت عملية الشراء بنجاح</p>
              <p className="text-white/40 text-sm">Thank you for shopping with us</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-10 py-6 text-center mt-4">
              <p className="text-white/50 text-sm mb-1">المبلغ الإجمالي</p>
              <p className="text-5xl font-bold text-white">{fmt(cart.total)}</p>
            </div>
          </div>
        ) : isEmpty ? (
          /* ── Empty / Welcome state ────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">
            <div className="w-28 h-28 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <ShoppingCart className="w-14 h-14 text-white/20" />
            </div>
            <div className="text-center space-y-3">
              <h2 className="text-4xl font-bold text-white/80" style={{ fontFamily: "Georgia, serif" }}>
                أهلاً وسهلاً
              </h2>
              <p className="text-white/40 text-xl">Welcome to Lucerne Boutique</p>
              <p className="text-white/25 text-sm mt-4">في انتظار إضافة المنتجات...</p>
            </div>
            {/* Decorative line */}
            <div className="w-32 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        ) : (
          /* ── Cart items ────────────────────────────────────────── */
          <div className="flex-1 flex gap-0 overflow-hidden">
            {/* Items list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ShoppingCart className="w-3.5 h-3.5" />
                المنتجات المختارة
              </h2>
              {cart.items.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3 transition-all duration-300 ${flash && idx === cart.items.length - 1 ? "bg-white/10 border-white/20" : ""}`}
                >
                  {/* Image / placeholder */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/10 shrink-0">
                    {item.image ? (
                      <img src={item.image} alt={item.productNameAr} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                        صورة
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white/90 text-sm leading-snug truncate">
                      {item.productNameAr || item.productName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.size && (
                        <span className="text-[11px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                          {item.size}
                        </span>
                      )}
                      {item.color && (
                        <span className="text-[11px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                          {item.color}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Qty × price */}
                  <div className="text-right shrink-0">
                    <p className="text-white/90 font-bold text-base">{fmt(item.unitPrice * item.quantity)}</p>
                    <p className="text-white/35 text-xs">
                      {item.quantity} × {fmt(item.unitPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals sidebar */}
            <div className="w-72 bg-black/40 border-r border-white/10 p-6 flex flex-col justify-end gap-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/50">المجموع الفرعي</span>
                  <span className="text-white/80 font-mono">{fmt(cart.subtotal)}</span>
                </div>

                {cart.discountAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-400/80">الخصم</span>
                    <span className="text-emerald-400 font-mono">−{fmt(cart.discountAmount)}</span>
                  </div>
                )}

                <div className="h-px bg-white/10" />

                <div className="flex justify-between items-center">
                  <span className="text-white/70 text-sm font-semibold">الإجمالي</span>
                  <span className="text-white font-bold text-3xl font-mono">{fmt(cart.total)}</span>
                </div>

                {/* Items count badge */}
                <div className="bg-white/5 rounded-xl px-4 py-2 flex justify-between items-center border border-white/10">
                  <span className="text-white/40 text-xs">عدد المنتجات</span>
                  <span className="text-white/80 text-sm font-semibold">
                    {cart.items.reduce((s, i) => s + i.quantity, 0)} قطعة
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-black/60 border-t border-white/10 px-8 py-3 text-center">
        <p className="text-white/20 text-xs">Lucerne Boutique — لوسيرن بوتيك</p>
      </div>
    </div>
  );
}
