import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUp, MessageCircle, RotateCcw, X } from "lucide-react";
import { useLanguage } from "@/i18n";

/* Lucy, the store assistant.
   The answers come from the server (/api/chat), where a language model reads the
   store's real products, orders and policies. This file is only the chat window:
   a full-screen sheet on phones, a floating panel on larger screens. */

interface ChatButton { label: string; url: string }
interface ChatProduct { id: number; name: string; price: number; salePrice: number | null; image: string; url: string }
interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  buttons?: ChatButton[];
  products?: ChatProduct[];
  suggestions?: string[];
  failed?: boolean;
}

const STORE_KEY = "lucerne-chat-v2";
const FAB = 52;

const COPY = {
  ar: {
    name: "لوسي",
    role: "مساعدة لوسيرن",
    hello: "أهلاً، بماذا أساعدك؟",
    placeholder: "اكتبي سؤالك",
    starters: ["شو الجديد عندكم؟", "وين وصل طلبي؟", "ساعديني أعرف مقاسي", "كم يوم التوصيل؟"],
    open: "افتحي المحادثة",
    close: "إغلاق",
    reset: "محادثة جديدة",
    send: "إرسال",
    error: "ما وصلت رسالتك. تأكدي من الإنترنت وحاولي مرة ثانية.",
    retry: "إعادة المحاولة",
  },
  en: {
    name: "Lucy",
    role: "Lucerne assistant",
    hello: "Hi, how can I help?",
    placeholder: "Ask anything",
    starters: ["What's new?", "Where is my order?", "Help me find my size", "How long is delivery?"],
    open: "Open chat",
    close: "Close",
    reset: "New chat",
    send: "Send",
    error: "Your message didn't go through. Check your connection and try again.",
    retry: "Try again",
  },
};

/* Reads the CSS zoom applied to <html> on some desktop pages. Pointer positions are
   in zoomed pixels while inline left/top are not, so dragging has to convert. */
function pageZoom(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom || "1");
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function loadMessages(): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(saved) ? saved.slice(-40) : [];
  } catch {
    return [];
  }
}

const price = (n: number) => `₪${Number.isInteger(n) ? n : n.toFixed(2)}`;

export default function ChatBot({ igVisible = true }: { igVisible?: boolean }) {
  const { language } = useLanguage();
  const lang: "ar" | "en" = language === "en" ? "en" : "ar";
  const copy = COPY[lang];
  const [, navigate] = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [isPhone, setIsPhone] = useState(() => window.innerWidth < 640);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<Record<string, unknown>>({});
  const drag = useRef({ active: false, moved: false, dx: 0, dy: 0 });

  /* Keep the conversation while the customer browses; it ends with the tab. */
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* private mode: the chat still works, it just isn't remembered */
    }
  }, [messages]);

  useEffect(() => {
    const onResize = () => {
      setIsPhone(window.innerWidth < 640);
      setFabPos((prev) => {
        if (!prev) return prev;
        const zoom = pageZoom();
        return {
          x: Math.max(0, Math.min(window.innerWidth - FAB * zoom, prev.x * zoom)) / zoom,
          y: Math.max(0, Math.min(window.innerHeight - FAB * zoom, prev.y * zoom)) / zoom,
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* On phones the sheet follows the visible area, so the keyboard never covers the input. */
  useEffect(() => {
    if (!open || !isPhone) {
      setViewport(null);
      return;
    }
    const vv = window.visualViewport;
    const update = () => setViewport(vv ? { height: vv.height, top: vv.offsetTop } : null);
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.body.style.overflow = previous;
    };
  }, [open, isPhone]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    if (!isPhone) inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isPhone]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, waiting, open, viewport?.height]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, 500);
      if (!text || waiting) return;
      const history = messages.filter((m) => !m.failed).slice(-10).map((m) => ({ role: m.role, text: m.text }));
      setMessages((prev) => [...prev.filter((m) => !m.failed), { id: `u${Date.now()}`, role: "user", text }]);
      setDraft("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setWaiting(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: text, lang, context: contextRef.current, history }),
        });
        const data = await res.json().catch(() => null);
        if (!data || typeof data.reply !== "string" || !data.reply) throw new Error("empty");
        contextRef.current = data.context && typeof data.context === "object" ? data.context : {};
        setMessages((prev) => [
          ...prev,
          {
            id: `a${Date.now()}`,
            role: "assistant",
            text: data.reply,
            buttons: Array.isArray(data.buttons) ? data.buttons.slice(0, 3) : [],
            products: Array.isArray(data.products) ? data.products.slice(0, 6) : [],
            suggestions: Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : [],
          },
        ]);
      } catch {
        setMessages((prev) => [...prev, { id: `e${Date.now()}`, role: "assistant", text: copy.error, failed: true, suggestions: [] }]);
      } finally {
        setWaiting(false);
      }
    },
    [messages, waiting, lang, copy.error],
  );

  const follow = (url: string) => {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(url);
    if (isPhone) setOpen(false);
  };

  const reset = () => {
    setMessages([]);
    contextRef.current = {};
    setDraft("");
  };

  /* ── The round button: tap to open, drag to move it out of the way ── */
  const startPos = () => ({ x: 24, y: window.innerHeight / pageZoom() - (igVisible ? 96 : 24) - FAB });
  const pos = fabPos ?? null;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { active: true, moved: false, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const zoom = pageZoom();
    const x = Math.max(0, Math.min(window.innerWidth - FAB * zoom, e.clientX - d.dx));
    const y = Math.max(0, Math.min(window.innerHeight - FAB * zoom, e.clientY - d.dy));
    const current = fabPos ?? startPos();
    if (!d.moved && Math.hypot(x / zoom - current.x, y / zoom - current.y) < 6) return;
    d.moved = true;
    setFabPos({ x: x / zoom, y: y / zoom });
  };
  const onPointerUp = () => {
    const moved = drag.current.moved;
    drag.current.active = false;
    if (!moved) setOpen(true);
  };

  /* Desktop panel sits just above the button, kept inside the window. */
  const panelStyle = (): React.CSSProperties => {
    if (isPhone) {
      // A sheet that rises from the bottom and leaves the page visible above it. Once the
      // keyboard is open there is little room left, so it takes all of it.
      const vh = viewport?.height ?? window.innerHeight;
      const vt = viewport?.top ?? 0;
      const height = vh < 520 ? vh : Math.round(vh * 0.8);
      return { top: vt + vh - height, height, left: 0, right: 0 };
    }
    const zoom = pageZoom();
    const width = 384;
    const winW = window.innerWidth / zoom;
    const winH = window.innerHeight / zoom;
    const anchor = pos ?? startPos();
    const left = Math.max(12, Math.min(winW - width - 12, anchor.x));
    const height = Math.min(620, winH - 32);
    const top = Math.max(16, Math.min(winH - height - 16, anchor.y - height - 12));
    return { left, top, width, height };
  };

  const last = messages[messages.length - 1];
  const chips = !waiting && last?.role === "assistant" && !last.failed ? last.suggestions || [] : [];
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text || "";

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label={copy.open}
          data-testid="button-chat-open"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
          style={pos ? { left: pos.x, top: pos.y, width: FAB, height: FAB } : { left: 24, bottom: igVisible ? 96 : 24, width: FAB, height: FAB }}
          className="fixed z-[60] flex touch-none select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <MessageCircle className="h-6 w-6" strokeWidth={1.8} />
        </button>
      )}

      {open && isPhone && <div className="fixed inset-0 z-[69] bg-black/40" onClick={() => setOpen(false)} data-testid="chat-backdrop" />}
      {open && (
        <div
          role="dialog"
          aria-label={copy.name}
          dir={lang === "ar" ? "rtl" : "ltr"}
          data-testid="chat-panel"
          style={panelStyle()}
          className="lucy-panel fixed z-[70] flex flex-col overflow-hidden rounded-t-[1.5rem] bg-background text-foreground shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl sm:shadow-black/20"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3" >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{lang === "ar" ? "ل" : "L"}</div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[15px] font-semibold">{copy.name}</p>
              <p className="text-xs text-muted-foreground">{copy.role}</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={reset} aria-label={copy.reset} title={copy.reset} data-testid="button-chat-reset" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <RotateCcw className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label={copy.close} data-testid="button-chat-close" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col justify-end gap-4 pb-1">
                <p className="text-2xl font-semibold leading-snug">{copy.hello}</p>
                <div className="flex flex-col items-start gap-2">
                  {copy.starters.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-2xl border border-border px-4 py-2.5 text-start text-[15px] transition-colors hover:bg-muted active:bg-muted">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="max-w-[82%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-primary px-3.5 py-2.5 text-[15px] leading-relaxed text-primary-foreground">
                      {m.text}
                    </div>
                  ) : (
                    <div key={m.id} className="lucy-in flex flex-col gap-2.5">
                      <p className={`max-w-[92%] whitespace-pre-wrap break-words text-[15px] leading-relaxed ${m.failed ? "text-destructive" : ""}`} dir="auto">
                        {m.text}
                      </p>
                      {m.failed && lastUserText && (
                        <button type="button" onClick={() => send(lastUserText)} className="self-start rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                          {copy.retry}
                        </button>
                      )}
                      {!!m.products?.length && (
                        <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {m.products.map((p) => (
                            <button key={p.id} type="button" onClick={() => follow(p.url)} data-testid={`chat-product-${p.id}`} className="w-[132px] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card text-start transition-shadow hover:shadow-md">
                              <div className="aspect-[3/4] w-full bg-muted">
                                {p.image && <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                              </div>
                              <div className="p-2">
                                <p className="truncate text-[13px] font-medium">{p.name}</p>
                                <p className="mt-0.5 text-[13px]">
                                  <span className="font-semibold">{price(p.salePrice ?? p.price)}</span>
                                  {p.salePrice != null && <span className="ms-1.5 text-xs text-muted-foreground line-through">{price(p.price)}</span>}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {!!m.buttons?.length && (
                        <div className="flex flex-wrap gap-2">
                          {m.buttons.map((b) => (
                            <button key={b.url + b.label} type="button" onClick={() => follow(b.url)} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                              {b.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                )}
                {waiting && (
                  <div className="flex h-6 items-center gap-1.5" aria-label="…">
                    <span className="lucy-dot" />
                    <span className="lucy-dot" style={{ animationDelay: "0.15s" }} />
                    <span className="lucy-dot" style={{ animationDelay: "0.3s" }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chips.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm transition-colors hover:bg-muted">
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="shrink-0 px-3 pt-1"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-end gap-2 rounded-3xl border border-border bg-card py-1.5 pe-1.5 ps-4 focus-within:border-foreground/40">
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={500}
                dir="auto"
                placeholder={copy.placeholder}
                data-testid="input-chat"
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                /* 16px keeps iPhones from zooming the page when the field is focused */
                className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-6 outline-none placeholder:text-muted-foreground"
              />
              <button type="submit" disabled={!draft.trim() || waiting} aria-label={copy.send} data-testid="button-chat-send" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
                <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .lucy-panel { animation: lucy-up .22s cubic-bezier(.2,.8,.2,1); }
        .lucy-in { animation: lucy-fade .25s ease-out; }
        .lucy-dot { width: 7px; height: 7px; border-radius: 9999px; background: currentColor; opacity: .25; animation: lucy-blink 1s infinite ease-in-out; }
        @keyframes lucy-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes lucy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lucy-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: .9; } }
        @media (prefers-reduced-motion: reduce) { .lucy-panel, .lucy-in, .lucy-dot { animation: none; } }
      `}</style>
    </>
  );
}
