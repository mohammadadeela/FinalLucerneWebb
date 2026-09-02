import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Sparkles,
  ExternalLink,
  ArrowRight,
  MessageCircle,
  Globe,
} from "lucide-react";

/* Reads the CSS `zoom` factor currently applied to <html> (e.g. the 0.87
   desktop scale on product/home pages). Mouse coordinates (clientX/clientY)
   and getBoundingClientRect() are reported in on-screen, already-zoomed
   pixels, but inline `left`/`top` style values are pre-zoom CSS pixels that
   the browser multiplies by this factor when painting. Dragging math must
   convert between the two spaces or the icon drifts away from the cursor. */
function getPageZoom(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom || "1");
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/* ─── Inline SVG icons ───────────────────────────────────────────────────── */
function IconBubble({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="white"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  );
}
function IconSend({
  size = 16,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22 2L11 13"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconChevronRight({
  size = 15,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline
        points="9 18 15 12 9 6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── types ─────────────────────────────────────────────────────────────── */
interface ChatButton {
  label: string;
  url: string;
}
interface Message {
  id: string;
  role: "bot" | "user";
  text: string;
  buttons?: ChatButton[];
}
interface Context {
  lastIntent?: string;
  lastFilters?: Record<string, string>;
}

function isArabic(t: string) {
  return /[\u0600-\u06FF]/.test(t);
}

/* ─── Size Wizard data & helpers ─────────────────────────────────────────── */
const SW_CLOTHING = [
  { label:"XS", cMin:80, cMax:84, wMin:62, wMax:66, hMin:86, hMax:90 },
  { label:"S",  cMin:84, cMax:88, wMin:66, wMax:70, hMin:90, hMax:94 },
  { label:"M",  cMin:88, cMax:92, wMin:70, wMax:74, hMin:94, hMax:98 },
  { label:"L",  cMin:92, cMax:96, wMin:74, wMax:78, hMin:98, hMax:102 },
  { label:"XL", cMin:96, cMax:100, wMin:78, wMax:82, hMin:102, hMax:106 },
  { label:"XXL",cMin:100, cMax:106, wMin:82, wMax:88, hMin:106, hMax:112 },
];
const SW_PANTS = [
  { label:"XS", eu:34, wMin:60, wMax:64 },
  { label:"S",  eu:36, wMin:65, wMax:69 },
  { label:"M",  eu:38, wMin:70, wMax:74 },
  { label:"L",  eu:40, wMin:75, wMax:79 },
  { label:"XL", eu:42, wMin:80, wMax:85 },
];
const SW_SHOES: Record<string, { cm:number; eu:number }[]> = {
  women: [{cm:22,eu:35},{cm:22.5,eu:36},{cm:23,eu:37},{cm:23.5,eu:37.5},{cm:24,eu:38},{cm:24.5,eu:39},{cm:25,eu:39.5},{cm:25.5,eu:40},{cm:26,eu:41},{cm:26.5,eu:42}],
  men:   [{cm:24,eu:38},{cm:24.5,eu:39},{cm:25,eu:40},{cm:25.5,eu:41},{cm:26,eu:42},{cm:26.5,eu:43},{cm:27,eu:44},{cm:27.5,eu:45},{cm:28,eu:46}],
  unisex:[{cm:23,eu:36},{cm:23.5,eu:37},{cm:24,eu:38},{cm:24.5,eu:39},{cm:25,eu:40},{cm:25.5,eu:41},{cm:26,eu:42},{cm:26.5,eu:43},{cm:27,eu:44},{cm:27.5,eu:45}],
};
const SW_FIT_OFFSET: Record<string,number> = { tight:-1, slim:0, normal:0, relaxed:1, loose:2 };

function swCalcClothing(chest:number, waist:number, hip:number, fit:string): string {
  let best=0, bestScore=Infinity;
  SW_CLOTHING.forEach((sz,i)=>{
    const score=Math.abs(chest-(sz.cMin+sz.cMax)/2)+Math.abs(waist-(sz.wMin+sz.wMax)/2)+Math.abs(hip-(sz.hMin+sz.hMax)/2);
    if(score<bestScore){bestScore=score;best=i;}
  });
  return SW_CLOTHING[Math.min(Math.max(best+(SW_FIT_OFFSET[fit]||0),0),SW_CLOTHING.length-1)].label;
}
function swCalcPants(waist:number, fit:string): { label:string; eu:number } {
  let best=0, bestScore=Infinity;
  SW_PANTS.forEach((sz,i)=>{
    const score=Math.abs(waist-(sz.wMin+sz.wMax)/2);
    if(score<bestScore){bestScore=score;best=i;}
  });
  return SW_PANTS[Math.min(Math.max(best+(SW_FIT_OFFSET[fit]||0),0),SW_PANTS.length-1)];
}
function swCalcShoe(footCm:number, gender:string): { cm:number; eu:number } {
  const data = SW_SHOES[gender] ?? SW_SHOES.women;
  return data.reduce((best,row)=>Math.abs(row.cm-footCm)<Math.abs(best.cm-footCm)?row:best, data[0]);
}

type SWType = 'clothes'|'pants'|'shoes';
type SWStep = 'type'|'measurements'|'fit'|'result';
interface SizeWizard {
  active: boolean; step: SWStep; type: SWType|null;
  chest:string; waist:string; hip:string; footCm:string;
  gender: 'women'|'men'|'unisex'; fit:string;
  result:string; resultEU?:number;
}
const DEFAULT_WIZARD: SizeWizard = {
  active:false, step:'type', type:null,
  chest:'', waist:'', hip:'', footCm:'', gender:'women', fit:'normal', result:'',
};

const SW_TRIGGERS = [
  'اكتشف مقاسي','اعرف مقاسي','ما مقاسي','ايش مقاسي','احتاج مقاس','قياسي',
  'كيف اعرف قياسي','كيف اعرف مقاسي','وش مقاسي','ابي اعرف مقاسي','بدي اعرف مقاسي',
  'بدي مقاسي','ساعدني اعرف مقاسي','ساعدني اعرف قياسي','ساعدني اعرف قياساتي',
  'دليل المقاسات','جدول المقاسات','كيف اختار المقاس','المقاس الصح','ما هو مقاسي',
  'مقاس مناسب','ما المقاس المناسب','مقاس الملابس','مقاس الحذاء','مقاس البنطلون',
  // extra variations the user types naturally
  'مقاساتي','قياساتي',
  'كيف اعرف قياساتي','ايش قياساتي','ايش مقاساتي',
  'شو قياسي','شو مقاسي','شو قياساتي','شو مقاساتي',
  'ساعدني اعرف','بدي اعرف','اريد اعرف مقاسي','اريد اعرف قياسي',
  'وش قياسي','وش قياساتي','وش مقاساتي',
  'find my size',"what's my size",'size guide','size chart','my size','sizing','size finder','help me find','what size am i',
];
function isSizeWizardTrigger(text:string): boolean {
  const n = text.toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآاٱ]/g,'ا').trim();
  return SW_TRIGGERS.some(t=>n.includes(t.toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآاٱ]/g,'ا')));
}

const GREETING = {
  ar: "أهلاً وسهلاً\nأنا **لوسي** — مساعدتك الشخصية في لوسيرن بوتيك.\n\nاختاري من الاقتراحات أدناه أو اكتبي سؤالك",
  en: "Welcome\nI'm **Lucie** — your personal Lucerne Boutique assistant.\n\nChoose from the suggestions below or type your question",
};

/* ─── RichText ───────────────────────────────────────────────────────────── */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ fontWeight: 600 }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/* ─── ActionButton ───────────────────────────────────────────────────────── */
function ActionButton({
  btn,
  onClose,
  small,
}: {
  btn: ChatButton;
  onClose: () => void;
  small?: boolean;
}) {
  const isExternal = btn.url.startsWith("http");
  const cls = small ? "lb-action-sm" : "lb-action";
  const inner = (
    <>
      <span>{btn.label}</span>
      {isExternal ? (
        <ExternalLink className="lb-action-icon" />
      ) : (
        <ArrowRight className="lb-action-icon" />
      )}
    </>
  );
  if (isExternal)
    return (
      <a
        href={btn.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {inner}
      </a>
    );
  return (
    <Link href={btn.url} onClick={onClose}>
      <span className={cls}>{inner}</span>
    </Link>
  );
}

/* ─── MessageBubble ──────────────────────────────────────────────────────── */
function MessageBubble({
  msg,
  onClose,
}: {
  msg: Message;
  onClose: () => void;
}) {
  const isBot = msg.role === "bot";
  return (
    <div className={`lb-row ${isBot ? "lb-row-bot" : "lb-row-user"}`}>
      {isBot && (
        <div className="lb-avatar">
          <Sparkles className="lb-avatar-icon" />
        </div>
      )}
      <div className="lb-bubble-wrap">
        {msg.text && (
          <div className={isBot ? "lb-bubble-bot" : "lb-bubble-user"}>
            <RichText text={msg.text} />
          </div>
        )}
        {msg.buttons && msg.buttons.length > 0 && (
          <div className="lb-btns">
            {msg.buttons.map((b, i) => (
              <ActionButton
                key={i}
                btn={b}
                onClose={onClose}
                small={msg.buttons!.length > 4}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── TypingIndicator ────────────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="lb-row lb-row-bot">
      <div className="lb-avatar">
        <Sparkles className="lb-avatar-icon" />
      </div>
      <div className="lb-typing">
        {[0, 0.18, 0.36].map((delay, i) => (
          <span
            key={i}
            className="lb-dot"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── QuickSuggestions ───────────────────────────────────────────────────── */
function QuickSuggestions({
  items,
  onSelect,
}: {
  items: { label: string; query: string }[];
  onSelect: (q: string) => void;
}) {
  return (
    <div className="lb-quick-wrap">
      {items.map((item) => (
        <button
          key={item.query}
          onClick={() => onSelect(item.query)}
          className="lb-chip"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ─── HelpPopup (mini pill input) ───────────────────────────────────────── */
function HelpPopup({
  lang,
  onOpen,
  onSend,
}: {
  lang: "ar" | "en";
  onOpen: () => void;
  onSend: (msg: string) => void;
}) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hasText = val.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasText) onSend(val.trim());
    else onOpen();
  };

  return (
    <form
      className="lb-pill"
      dir={lang === "ar" ? "rtl" : "ltr"}
      onSubmit={handleSubmit}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={lang === "ar" ? "اكتبي سؤالك…" : "Ask me anything…"}
        className="lb-pill-input"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !hasText) {
            e.preventDefault();
            onOpen();
          }
        }}
      />
      <button
        type="submit"
        className={`lb-pill-btn ${hasText ? "lb-pill-btn-send" : "lb-pill-btn-open"}`}
        aria-label={hasText ? "Send" : "Open chat"}
      >
        {hasText ? (
          <IconSend
            size={14}
            color={hasText ? "#111" : "rgba(255,255,255,0.7)"}
          />
        ) : (
          <IconChevronRight size={15} color="rgba(255,255,255,0.7)" />
        )}
      </button>
    </form>
  );
}

/* ─── SizeWizardPanel ────────────────────────────────────────────────────── */
function SizeWizardPanel({
  wizard, setWizard, lang,
}: {
  wizard: SizeWizard;
  setWizard: React.Dispatch<React.SetStateAction<SizeWizard>>;
  lang: "ar" | "en";
}) {
  const ar = lang === "ar";
  const [err, setErr] = useState("");
  const upd = (patch: Partial<SizeWizard>) => setWizard(w => ({ ...w, ...patch }));
  const reset = () => setWizard({ ...DEFAULT_WIZARD, active: true });

  /* ── Step: type ── */
  if (wizard.step === "type") return (
    <div className="lb-wizard" dir={ar ? "rtl" : "ltr"}>
      <div className="lb-wiz-title">{ar ? "اختاري نوع المقاس" : "What type of size?"}</div>
      <div className="lb-wiz-types">
        {([
          ["clothes","👗", ar?"ملابس":"Clothes"],
          ["pants",  "👖", ar?"بنطلون":"Pants"],
          ["shoes",  "👠", ar?"أحذية":"Shoes"],
        ] as const).map(([t, emoji, lbl]) => (
          <button key={t} className="lb-wiz-type-btn"
            onClick={() => upd({ type: t, step: "measurements" })}>
            <span className="lb-wiz-emoji">{emoji}</span>
            <span>{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );

  /* ── Step: measurements ── */
  if (wizard.step === "measurements") {
    if (wizard.type === "clothes") return (
      <div className="lb-wizard" dir={ar ? "rtl" : "ltr"}>
        <div className="lb-wiz-title">{ar ? "قياساتك بالسنتيمتر (سم)" : "Your measurements in cm"}</div>
        <div className="lb-wiz-inputs">
          <div className="lb-wiz-row">
            {([
              ["chest", ar?"الصدر":"Chest",  wizard.chest],
              ["waist", ar?"الخصر":"Waist",  wizard.waist],
              ["hip",   ar?"الورك":"Hip",    wizard.hip],
            ] as const).map(([key, lbl, val]) => (
              <div key={key} className="lb-wiz-field">
                <span className="lb-wiz-label">{lbl}</span>
                <input type="number" className="lb-wiz-input" value={val} min={55} max={160}
                  placeholder="سم" onChange={e => { upd({ [key]: e.target.value }); setErr(""); }} />
              </div>
            ))}
          </div>
          {err && <div className="lb-wiz-err">{err}</div>}
          <button className="lb-wiz-submit" onClick={() => {
            if (!wizard.chest || !wizard.waist || !wizard.hip) {
              setErr(ar ? "يرجى إدخال جميع القياسات" : "Please enter all 3 measurements"); return;
            }
            upd({ step: "fit" });
          }}>{ar ? "التالي ←" : "Next →"}</button>
        </div>
      </div>
    );

    if (wizard.type === "pants") return (
      <div className="lb-wizard" dir={ar ? "rtl" : "ltr"}>
        <div className="lb-wiz-title">{ar ? "قياس الخصر بالسنتيمتر" : "Waist measurement in cm"}</div>
        <div className="lb-wiz-inputs">
          <div className="lb-wiz-field" style={{ width: "100%" }}>
            <span className="lb-wiz-label">{ar ? "الخصر (سم)" : "Waist (cm)"}</span>
            <input type="number" className="lb-wiz-input" style={{ textAlign:"center" }} value={wizard.waist}
              min={50} max={140} placeholder="سم"
              onChange={e => { upd({ waist: e.target.value }); setErr(""); }} />
          </div>
          {err && <div className="lb-wiz-err">{err}</div>}
          <button className="lb-wiz-submit" onClick={() => {
            if (!wizard.waist) { setErr(ar ? "يرجى إدخال قياس الخصر" : "Please enter your waist"); return; }
            upd({ step: "fit" });
          }}>{ar ? "التالي ←" : "Next →"}</button>
        </div>
      </div>
    );

    if (wizard.type === "shoes") return (
      <div className="lb-wizard" dir={ar ? "rtl" : "ltr"}>
        <div className="lb-wiz-title">{ar ? "طول القدم بالسنتيمتر" : "Foot length in cm"}</div>
        <div className="lb-wiz-inputs">
          <div className="lb-wiz-field" style={{ width:"100%" }}>
            <span className="lb-wiz-label">{ar ? "طول القدم (سم)" : "Foot length (cm)"}</span>
            <input type="number" className="lb-wiz-input" style={{ textAlign:"center" }} value={wizard.footCm}
              min={20} max={32} step={0.5} placeholder="e.g. 24.5"
              onChange={e => { upd({ footCm: e.target.value }); setErr(""); }} />
          </div>
          <div className="lb-wiz-fits" style={{ marginTop:4 }}>
            {([["women", ar?"نساء":"Women"],["men", ar?"رجال":"Men"],["unisex", ar?"للجنسين":"Unisex"]] as const).map(([g,lbl]) => (
              <button key={g} className={`lb-wiz-fit-btn ${wizard.gender===g?"lb-wiz-fit-active":""}`}
                onClick={() => upd({ gender: g })}>{lbl}</button>
            ))}
          </div>
          {err && <div className="lb-wiz-err">{err}</div>}
          <button className="lb-wiz-submit" onClick={() => {
            if (!wizard.footCm) { setErr(ar ? "يرجى إدخال طول القدم" : "Please enter your foot length"); return; }
            const res = swCalcShoe(+wizard.footCm, wizard.gender);
            upd({ result: `EU ${res.eu}`, resultEU: res.eu, step: "result" });
          }}>{ar ? "اعرضي مقاسي ✨" : "Show my size ✨"}</button>
        </div>
      </div>
    );
  }

  /* ── Step: fit ── */
  if (wizard.step === "fit") return (
    <div className="lb-wizard" dir={ar ? "rtl" : "ltr"}>
      <div className="lb-wiz-title">{ar ? "كيف تفضلين القصة؟" : "How do you prefer the fit?"}</div>
      <div className="lb-wiz-fits">
        {(ar
          ? [["tight","ضيق جداً"],["slim","ضيق"],["normal","عادي"],["relaxed","مريح"],["loose","فضفاض"]]
          : [["tight","Tight"],["slim","Slim"],["normal","Normal"],["relaxed","Relaxed"],["loose","Loose"]]
        ).map(([val,lbl]) => (
          <button key={val} className={`lb-wiz-fit-btn ${wizard.fit===val?"lb-wiz-fit-active":""}`}
            onClick={() => upd({ fit: val })}>{lbl}</button>
        ))}
      </div>
      <button className="lb-wiz-submit" style={{ marginTop:10 }} onClick={() => {
        let result = "";
        if (wizard.type === "clothes") {
          result = swCalcClothing(+wizard.chest, +wizard.waist, +wizard.hip, wizard.fit);
        } else {
          const r = swCalcPants(+wizard.waist, wizard.fit);
          result = `${r.label}|EU ${r.eu}`;
        }
        upd({ result, step: "result" });
      }}>{ar ? "اعرضي مقاسي ✨" : "Show my size ✨"}</button>
    </div>
  );

  /* ── Step: result ── */
  if (wizard.step === "result") {
    const isShoes = wizard.type === "shoes";
    const isPants = wizard.type === "pants";
    const [mainLabel, euLabel] = isPants ? wizard.result.split("|") : [wizard.result, ""];
    const displayLabel = isShoes ? `EU ${wizard.resultEU}` : mainLabel;
    return (
      <div className="lb-wizard" dir={ar ? "rtl" : "ltr"}>
        <div className="lb-wiz-result-wrap">
          <div className="lb-wiz-result-badge">
            <div className="lb-wiz-result-size">{displayLabel}</div>
            <div className="lb-wiz-result-sub">
              {isShoes ? (ar?"مقاس الحذاء":"Shoe size")
               : isPants ? (ar?"مقاس البنطلون":"Pants size")
               : (ar?"مقاس الملابس":"Clothing size")}
            </div>
          </div>
          {isPants && euLabel && (
            <div className="lb-wiz-result-detail">{euLabel}</div>
          )}
          {wizard.type === "clothes" && (
            <div className="lb-wiz-result-grid">
              {[
                { label: ar?"الصدر":"Chest", val:`${wizard.chest}cm` },
                { label: ar?"الخصر":"Waist", val:`${wizard.waist}cm` },
                { label: ar?"الورك":"Hip",   val:`${wizard.hip}cm`   },
              ].map(({ label, val }) => (
                <div key={label} className="lb-wiz-result-cell">
                  <div className="lb-wiz-cell-val">{val}</div>
                  <div className="lb-wiz-cell-sub">{label}</div>
                </div>
              ))}
            </div>
          )}
          <button className="lb-wiz-restart" onClick={reset}>
            {ar ? "↺ ابدأ من جديد" : "↺ Start over"}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

/* ─── Main ChatBot ───────────────────────────────────────────────────────── */
export default function ChatBot({ igVisible = true }: { igVisible?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [context, setContext] = useState<Context>({});
  const [showHelp, setShowHelp] = useState(true);
  const [helpDismissed, setHelpDismissed] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);
  const [sizeWizard, setSizeWizard] = useState<SizeWizard>(DEFAULT_WIZARD);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabWrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ── Draggable FAB ──────────────────────────────────────────────────── */
  // Position is kept in memory only (not persisted to localStorage), so the
  // icon always returns to its default corner spot on every page refresh —
  // dragging only repositions it for the current page view.
  const [fabPos, setFabPosState] = useState<{ x: number; y: number } | null>(
    null,
  );
  const setFabPos = (pos: { x: number; y: number } | null) => {
    setFabPosState(pos);
  };
  // Keep the current spot valid if the viewport size changes (rotation, resize).
  useEffect(() => {
    const onResize = () => {
      setFabPosState((prev) => {
        if (!prev) return prev;
        const zoom = getPageZoom();
        const screenX = prev.x * zoom;
        const screenY = prev.y * zoom;
        const iconSize = 56 * zoom;
        const clampedScreenX = Math.max(0, Math.min(window.innerWidth - iconSize, screenX));
        const clampedScreenY = Math.max(0, Math.min(window.innerHeight - iconSize, screenY));
        return { x: clampedScreenX / zoom, y: clampedScreenY / zoom };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isDraggingFab = useRef(false);
  const hasMovedfab = useRef(false);
  const dragOffsetFab = useRef({ x: 0, y: 0 });

  const getFabInitPos = () => ({
    x: 24,
    y: window.innerHeight - (igVisible ? 96 : 24) - 56,
  });
  const currentFabPos = fabPos ?? getFabInitPos();

  const beginFabDrag = (clientX: number, clientY: number) => {
    const rect = fabWrapRef.current?.getBoundingClientRect();
    const actualX = rect ? rect.left : (fabPos?.x ?? 24);
    const actualY = rect ? rect.top : (fabPos?.y ?? window.innerHeight - (igVisible ? 96 : 24) - 56);
    dragOffsetFab.current = {
      x: clientX - actualX,
      y: clientY - actualY,
    };
    isDraggingFab.current = true;
    hasMovedfab.current = false;
  };

  const handleFabMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    beginFabDrag(e.clientX, e.clientY);
    let lastPos = fabPos ?? getFabInitPos();
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingFab.current) return;
      hasMovedfab.current = true;
      const zoom = getPageZoom();
      const iconSize = 56 * zoom;
      const screenX = Math.max(
        0,
        Math.min(window.innerWidth - iconSize, ev.clientX - dragOffsetFab.current.x),
      );
      const screenY = Math.max(
        0,
        Math.min(window.innerHeight - iconSize, ev.clientY - dragOffsetFab.current.y),
      );
      lastPos = { x: screenX / zoom, y: screenY / zoom };
      setFabPosState(lastPos);
    };
    const onUp = () => {
      isDraggingFab.current = false;
      if (hasMovedfab.current) setFabPos(lastPos);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleFabTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    beginFabDrag(touch.clientX, touch.clientY);
    let lastPos = fabPos ?? getFabInitPos();
    const onMove = (ev: TouchEvent) => {
      if (!isDraggingFab.current) return;
      hasMovedfab.current = true;
      const t = ev.touches[0];
      const zoom = getPageZoom();
      const iconSize = 56 * zoom;
      const screenX = Math.max(
        0,
        Math.min(window.innerWidth - iconSize, t.clientX - dragOffsetFab.current.x),
      );
      const screenY = Math.max(
        0,
        Math.min(window.innerHeight - iconSize, t.clientY - dragOffsetFab.current.y),
      );
      lastPos = { x: screenX / zoom, y: screenY / zoom };
      setFabPosState(lastPos);
    };
    const onEnd = () => {
      isDraggingFab.current = false;
      if (hasMovedfab.current) setFabPos(lastPos);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
  };

  /* ── Panel position (desktop only; mobile = full-screen bottom sheet) ── */
  const getPanelStyle = (): React.CSSProperties => {
    const mobile = window.innerWidth < 640;
    if (mobile) return {};
    const panelW = 360;
    const gap = 12;
    const fabX = fabPos ? fabPos.x : 24;
    let left = fabX;
    if (left + panelW > window.innerWidth - gap)
      left = window.innerWidth - gap - panelW;
    if (left < gap) left = gap;
    const fabBottom = fabPos
      ? window.innerHeight - fabPos.y
      : igVisible ? 96 + 56 : 24 + 56;
    const bottom = fabBottom + gap;
    return { bottom, left, right: "auto", transition: "none" };
  };

  const { data: suggestions } = useQuery<{
    ar: { label: string; query: string }[];
    en: { label: string; query: string }[];
  }>({
    queryKey: ["/api/chat/suggestions"],
    staleTime: Infinity,
  });

  // ── All hooks must come before any conditional returns ──────────────
  useEffect(() => {
    if (open) setShowHelp(false);
    else if (!helpDismissed) setShowHelp(true);
  }, [open, helpDismissed]);

  useEffect(() => {
    if (open) {
      setShowHelp(false);
      if (!greeted) {
        setMessages([{ id: "0", role: "bot", text: GREETING[lang] }]);
        setGreeted(true);
        setShowQuick(true);
      }
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const close = useCallback(() => setOpen(false), []);

  const handleSend = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q || typing) return;
      setShowQuick(false);
      // Only switch language when the message carries a real language signal.
      // Pure numbers/symbols (e.g. an order number like "#000003") have no
      // letters, so keep the current language instead of defaulting to English.
      const detectedLang: "ar" | "en" = isArabic(q)
        ? "ar"
        : /[a-zA-Z]/.test(q)
          ? "en"
          : lang;
      if (detectedLang !== lang) setLang(detectedLang);

      /* ── Size wizard intercept ── */
      if (isSizeWizardTrigger(q)) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", text: q }]);
        setInput("");
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setMessages(prev => [...prev, {
            id: (Date.now()+1).toString(), role: "bot",
            text: detectedLang === "ar"
              ? "بكل سرور! 📏 سأساعدك تجدين مقاسك الصحيح.\n\nاختاري أولاً نوع المقاس من الأسفل:"
              : "Happy to help! 📏 I'll guide you to your perfect size.\n\nChoose a size type below:",
          }]);
          setSizeWizard({ ...DEFAULT_WIZARD, active: true, step: "type" });
        }, 700);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "user", text: q },
      ]);
      setInput("");
      setTyping(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: q, lang: detectedLang, context }),
        });
        const data = await res.json();
        setContext(data.context ?? {});
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "bot",
            text:
              data.reply ||
              (detectedLang === "ar"
                ? "آسف، حدث خطأ."
                : "Sorry, something went wrong."),
            buttons: data.buttons ?? [],
          },
        ]);
      } catch {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "bot",
            text:
              detectedLang === "ar"
                ? "آسف، حدث خطأ في الاتصال."
                : "Connection error. Please try again.",
          },
        ]);
      }
    },
    [lang, context, typing],
  );

  const handlePillSend = useCallback(
    (query: string) => {
      setOpen(true);
      setShowHelp(false);
      setTimeout(() => handleSend(query), 120);
    },
    [handleSend],
  );

  // ── Close on outside click ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        fabWrapRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Guard: hide on admin pages — MUST be after all hooks ─────────────
  if (location.startsWith("/admin")) return null;

  const dir = lang === "ar" ? "rtl" : "ltr";

  /* ── Teaser bubble: shows on hover, hides when chat opens ──────────── */
  const handleFabHoverIn = () => { if (!open) setShowTeaser(true); };
  const handleFabHoverOut = () => setShowTeaser(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };
  const currentSuggestions = suggestions?.[lang] ?? [];

  return (
    <>
      <style>{`
        /* ── Keyframes ── */
        @keyframes lb-in    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes lb-up    { from{opacity:0;transform:translateY(18px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes lb-pop   { from{opacity:0;transform:scale(0.9) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes lb-dot   { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }
        @keyframes lb-ring  { 0%{box-shadow:0 0 0 0 rgba(168,85,247,0.45)} 70%{box-shadow:0 0 0 14px rgba(168,85,247,0)} 100%{box-shadow:0 0 0 0 rgba(168,85,247,0)} }
        @keyframes lb-teaser {
          from { opacity:0; transform:translateY(-50%) translateX(-10px) scale(0.94); }
          to   { opacity:1; transform:translateY(-50%) translateX(0)     scale(1);    }
        }

        /* ── Teaser bubble ── */
        .lb-teaser {
          position:absolute;
          left:66px;
          top:50%;
          transform:translateY(-50%);
          white-space:nowrap;
          background:linear-gradient(135deg, #7c3aed, #a855f7);
          color:#fff;
          font-size:13px;
          font-weight:600;
          letter-spacing:0.015em;
          padding:10px 18px;
          border-radius:24px;
          box-shadow:0 8px 24px rgba(124,58,237,0.45), 0 2px 6px rgba(124,58,237,0.25);
          pointer-events:none;
          animation: lb-teaser 0.28s cubic-bezier(0.34,1.2,0.64,1) forwards;
        }
        .lb-teaser::before {
          content:'';
          position:absolute;
          right:100%;
          top:50%;
          transform:translateY(-50%);
          border:6px solid transparent;
          border-right-color:#7c3aed;
          margin-right:-1px;
        }

        /* ── Size Wizard ── */
        .lb-wizard {
          padding:12px 14px 14px;
          border-top:1px solid #f0f0f0;
          background:#fafafa;
          flex-shrink:0;
          animation:lb-in 0.22s ease;
        }
        .lb-wiz-title {
          font-size:10.5px;font-weight:700;letter-spacing:0.08em;
          text-transform:uppercase;color:#888;
          margin-bottom:10px;text-align:center;
        }
        .lb-wiz-types { display:flex;gap:8px; }
        .lb-wiz-type-btn {
          flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;
          padding:12px 6px;background:#fff;
          border:1.5px solid #e8e8e8;border-radius:12px;
          cursor:pointer;transition:all 0.15s;
          font-size:11.5px;font-weight:600;color:#333;
        }
        .lb-wiz-type-btn:hover { border-color:#7c3aed;background:#faf5ff;color:#7c3aed; }
        .lb-wiz-emoji { font-size:22px; }

        .lb-wiz-inputs { display:flex;flex-direction:column;gap:8px; }
        .lb-wiz-row { display:flex;gap:7px; }
        .lb-wiz-field { flex:1;display:flex;flex-direction:column;gap:3px; }
        .lb-wiz-label { font-size:10px;color:#888;font-weight:600;letter-spacing:0.04em; }
        .lb-wiz-input {
          border:1.5px solid #e8e8e8;border-radius:8px;
          padding:8px 6px;font-size:14px;background:#fff;
          text-align:center;outline:none;width:100%;
          transition:border-color 0.15s;
          -moz-appearance:textfield;
        }
        .lb-wiz-input::-webkit-outer-spin-button,
        .lb-wiz-input::-webkit-inner-spin-button { -webkit-appearance:none;margin:0; }
        .lb-wiz-input:focus { border-color:#7c3aed; }
        .lb-wiz-err { font-size:11px;color:#ef4444;text-align:center; }

        .lb-wiz-fits { display:flex;flex-wrap:wrap;gap:6px;justify-content:center; }
        .lb-wiz-fit-btn {
          padding:7px 13px;border:1.5px solid #e8e8e8;border-radius:20px;
          font-size:12px;font-weight:500;cursor:pointer;
          background:#fff;transition:all 0.15s;color:#333;
        }
        .lb-wiz-fit-btn:hover { border-color:#7c3aed;color:#7c3aed; }
        .lb-wiz-fit-active { border-color:#7c3aed !important;background:#7c3aed !important;color:#fff !important; }

        .lb-wiz-submit {
          width:100%;padding:10px;
          background:linear-gradient(135deg,#111,#333);
          color:#fff;border:none;border-radius:10px;
          font-size:12px;font-weight:700;letter-spacing:0.06em;
          cursor:pointer;transition:opacity 0.15s;
        }
        .lb-wiz-submit:hover { opacity:0.85; }

        .lb-wiz-result-wrap { display:flex;flex-direction:column;align-items:center;gap:10px; }
        .lb-wiz-result-badge {
          background:linear-gradient(135deg,#7c3aed,#a855f7);
          border-radius:16px;padding:14px 28px;
          text-align:center;color:#fff;width:100%;
        }
        .lb-wiz-result-size { font-size:46px;font-weight:800;letter-spacing:-0.02em;line-height:1; }
        .lb-wiz-result-sub { font-size:10px;opacity:0.8;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px; }
        .lb-wiz-result-detail { font-size:13px;color:#7c3aed;font-weight:600; }
        .lb-wiz-result-grid {
          display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%;
        }
        .lb-wiz-result-cell {
          background:#fff;border:1px solid #ebebeb;border-radius:8px;
          padding:8px 4px;text-align:center;
        }
        .lb-wiz-cell-val { font-size:12px;font-weight:700; }
        .lb-wiz-cell-sub { font-size:10px;color:#888;margin-top:2px; }
        .lb-wiz-restart {
          font-size:11.5px;color:#888;cursor:pointer;
          background:none;border:none;padding:0;
          text-decoration:underline;text-underline-offset:2px;
        }
        .lb-wiz-restart:hover { color:#7c3aed; }

        /* ── Help pill (mini input) ── */
        .lb-pill {
          position:absolute;
          left:66px;
          top:50%;
          transform:translateY(-50%);
          display:flex;align-items:center;gap:8px;
          background:#111;
          border:1px solid #2e2e2e;
          border-radius:28px;
          padding:6px 6px 6px 14px;
          height:46px;
          min-width:200px;max-width:260px;
          box-shadow:0 6px 24px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2);
          animation:lb-pop 0.3s cubic-bezier(0.34,1.56,0.64,1);
          z-index:60;
          cursor:text;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .lb-pill:focus-within {
          border-color:#444;
          box-shadow:0 6px 28px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.06);
        }
        .lb-pill-input {
          flex:1;min-width:0;
          background:transparent;border:none;outline:none;
          color:#fff;font-size:13px;font-weight:400;
          caret-color:#fff;letter-spacing:0.01em;
        }
        .lb-pill-input::placeholder { color:rgba(255,255,255,0.35); font-weight:400; }
        .lb-pill-btn {
          width:34px;height:34px;border-radius:50%;
          border:none;cursor:pointer;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
          transition:all 0.15s;
        }
        .lb-pill-btn-open {
          background:rgba(255,255,255,0.1);
          color:rgba(255,255,255,0.7);
        }
        .lb-pill-btn-open:hover { background:rgba(255,255,255,0.2);color:#fff; }
        .lb-pill-btn-send {
          background:#fff;color:#111;
        }
        .lb-pill-btn-send:hover { background:#e8e8e8;transform:scale(1.06); }
        .lb-pill-btn-send:active { transform:scale(0.95); }
        @media (max-width:639px) {
          .lb-pill { min-width:160px; max-width:220px; }
        }

        /* ── FAB ── */
        .lb-fab {
          width:56px;height:56px;border-radius:50%;
          background:#000;
          border:none;cursor:pointer;
          display:flex;align-items:center;justify-content:center;
          transition:transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
          box-shadow:0 6px 24px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .lb-fab:hover { transform:scale(1.08); box-shadow:0 10px 32px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3); }
        .lb-fab:active { transform:scale(0.94); }
        .lb-fab-ring { animation:lb-ring 2.4s ease-out infinite; }

        /* ── Panel ── */
        .lb-panel {
          position:fixed;
          bottom:96px;left:24px;
          z-index:50;
          width:320px;max-height:460px;
          display:flex;flex-direction:column;
          border-radius:18px;overflow:hidden;
          animation:lb-up 0.3s cubic-bezier(0.34,1.56,0.64,1);
          background:#fff;
          border:1.5px solid rgba(124,58,237,0.25);
          box-shadow:0 24px 64px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(168,85,247,0.08);
        }

        /* ── Header ── */
        .lb-header {
          display:flex;align-items:center;gap:12px;
          padding:14px 16px;flex-shrink:0;
          background:#000;
          border-bottom:none;
        }
        .lb-header-avatar {
          width:40px;height:40px;border-radius:50%;
          background:#1a1a1a;
          display:flex;align-items:center;justify-content:center;
          flex-shrink:0;
          box-shadow:0 0 0 2px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.4);
        }
        .lb-header-avatar-icon { width:17px;height:17px;color:#fff; }
        .lb-header-name {
          font-size:15px;font-weight:700;
          color:#fff;letter-spacing:0.03em;
        }
        .lb-header-sub {
          font-size:10.5px;color:rgba(255,255,255,0.5);
          margin-top:2px;letter-spacing:0.02em;
        }
        /* ── Language toggle pill ── */
        .lb-lang-toggle {
          display:flex;align-items:center;gap:5px;
          background:rgba(255,255,255,0.08);
          border:1px solid rgba(255,255,255,0.15);
          border-radius:20px;
          padding:3px 9px 3px 6px;
          cursor:pointer;
          transition:background 0.15s, border-color 0.15s;
          color:rgba(255,255,255,0.8);
        }
        .lb-lang-toggle:hover {
          background:rgba(255,255,255,0.16);
          border-color:rgba(255,255,255,0.3);
          color:#fff;
        }
        .lb-lang-globe { width:13px;height:13px;flex-shrink:0;opacity:0.7; }
        .lb-lang-divider {
          width:1px;height:10px;
          background:rgba(255,255,255,0.25);
          flex-shrink:0;
        }
        .lb-lang-opt {
          font-size:10px;font-weight:700;letter-spacing:0.07em;
          padding:1px 5px;border-radius:10px;
          transition:all 0.15s;line-height:1.6;
        }
        .lb-lang-opt-active {
          background:#fff;color:#111;
        }
        .lb-lang-opt-inactive {
          color:rgba(255,255,255,0.45);
        }
        .lb-close-btn {
          width:28px;height:28px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);
          border:1px solid rgba(255,255,255,0.15);
          cursor:pointer;transition:all 0.15s;
        }
        .lb-close-btn:hover { background:rgba(255,255,255,0.18);color:#fff; border-color:rgba(255,255,255,0.3); }

        /* ── Status bar ── */
        .lb-status {
          display:flex;align-items:center;gap:7px;
          padding:6px 16px;
          background:#111;
          border-bottom:1px solid rgba(255,255,255,0.08);
          flex-shrink:0;
        }
        .lb-status-dot {
          width:6px;height:6px;border-radius:50%;
          background:#22c55e;
          box-shadow:0 0 0 2px rgba(34,197,94,0.2);
          flex-shrink:0;
        }
        .lb-status-txt { font-size:10.5px;color:rgba(255,255,255,0.65);letter-spacing:0.01em; }

        /* ── Messages ── */
        .lb-msgs {
          flex:1;overflow-y:auto;
          padding:12px 12px;
          display:flex;flex-direction:column;gap:10px;
          background:#fff;min-height:0;
        }
        .lb-msgs::-webkit-scrollbar { width:3px; }
        .lb-msgs::-webkit-scrollbar-track { background:transparent; }
        .lb-msgs::-webkit-scrollbar-thumb { background:#ddd;border-radius:9px; }

        .lb-row { display:flex;gap:9px;animation:lb-in 0.2s ease-out; }
        .lb-row-bot  { align-items:flex-start; }
        .lb-row-user { align-items:flex-end;justify-content:flex-end; }

        .lb-avatar {
          width:30px;height:30px;border-radius:50%;
          background:linear-gradient(135deg,#1f1f1f,#000);
          box-shadow:0 2px 8px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.1);
          display:flex;align-items:center;justify-content:center;
          flex-shrink:0;margin-top:1px;
        }
        .lb-avatar-icon { width:14px;height:14px;color:#fff; }

        .lb-bubble-wrap { max-width:82%;display:flex;flex-direction:column;gap:7px; }

        .lb-bubble-bot {
          font-size:13px;line-height:1.65;
          padding:11px 14px;
          white-space:pre-wrap;
          color:#111;
          background:#f5f5f5;
          border:1px solid #e4e4e4;
          border-radius:3px 14px 14px 14px;
          letter-spacing:0.01em;
        }
        .lb-bubble-user {
          font-size:13px;line-height:1.65;
          padding:11px 14px;
          white-space:pre-wrap;
          color:#fff;
          background:#111;
          border-radius:14px 14px 3px 14px;
          letter-spacing:0.01em;
        }

        /* ── Typing ── */
        .lb-typing {
          display:flex;gap:5px;align-items:center;
          padding:12px 15px;
          background:#f5f5f5;
          border:1px solid #e4e4e4;
          border-radius:3px 14px 14px 14px;
        }
        .lb-dot {
          width:6px;height:6px;border-radius:50%;
          background:#999;
          display:inline-block;
          animation:lb-dot 1.2s ease-in-out infinite;
        }

        /* ── Action buttons ── */
        .lb-btns { display:flex;flex-wrap:wrap;gap:6px; }
        .lb-action {
          display:inline-flex;align-items:center;gap:6px;
          font-size:11.5px;font-weight:600;letter-spacing:0.02em;
          padding:7px 14px 7px 13px;border-radius:20px;
          color:#111;background:#fff;
          border:1.5px solid #ddd;
          text-decoration:none;cursor:pointer;
          transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow:0 1px 4px rgba(0,0,0,0.06);
        }
        .lb-action:hover {
          background:#111;color:#fff;border-color:#111;
          transform:translateY(-2px);
          box-shadow:0 4px 14px rgba(0,0,0,0.18);
        }
        .lb-action:active { transform:scale(0.96) translateY(0); }
        .lb-action-icon { width:12px;height:12px;flex-shrink:0;transition:transform 0.18s; }
        .lb-action:hover .lb-action-icon { transform:translateX(2px); }

        .lb-action-sm {
          display:inline-flex;align-items:center;gap:4px;
          font-size:10.5px;font-weight:600;
          padding:5px 11px;border-radius:16px;
          color:#333;background:#fff;
          border:1px solid #e0e0e0;
          text-decoration:none;cursor:pointer;
          transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow:0 1px 3px rgba(0,0,0,0.05);
        }
        .lb-action-sm:hover {
          background:#111;color:#fff;border-color:#111;
          transform:translateY(-1px);
          box-shadow:0 3px 10px rgba(0,0,0,0.15);
        }

        /* ── Quick chips ── */
        .lb-quick-area {
          flex-shrink:0;
          border-top:1px solid #eee;
          background:#fafafa;
          padding-bottom:2px;
        }
        .lb-quick-label {
          font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;
          color:#bbb;padding:10px 14px 4px;
        }
        .lb-quick-wrap {
          display:flex;flex-wrap:wrap;gap:6px;
          padding:4px 14px 12px;
        }
        .lb-chip {
          font-size:11.5px;font-weight:500;
          padding:5px 13px;border-radius:20px;
          color:#333;background:#fff;
          border:1px solid #d0d0d0;
          cursor:pointer;transition:all 0.15s;
          letter-spacing:0.01em;
        }
        .lb-chip:hover { background:#111;color:#fff;border-color:#111;transform:translateY(-1px); }
        .lb-chip:active { transform:scale(0.96); }

        /* ── Input ── */
        .lb-input-bar {
          flex-shrink:0;
          display:flex;align-items:center;gap:10px;
          padding:10px 12px;
          border-top:1px solid #e8e8e8;
          background:#fff;
        }
        .lb-input {
          flex:1;
          font-size:13px;
          padding:9px 14px;
          border-radius:10px;
          background:#f5f5f5;
          border:1.5px solid #e0e0e0;
          color:#111;outline:none;
          transition:border-color 0.15s, box-shadow 0.15s;
          caret-color:#111;
          letter-spacing:0.01em;
        }
        .lb-input::placeholder { color:#aaa; }
        .lb-input:focus { border-color:#111;box-shadow:0 0 0 3px rgba(0,0,0,0.06); }
        .lb-input:disabled { opacity:0.4; }
        .lb-send {
          width:40px;height:40px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          flex-shrink:0;border:none;cursor:pointer;
          transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .lb-send-on  { background:linear-gradient(145deg,#1a1a1a,#000); box-shadow:0 3px 10px rgba(0,0,0,0.22); }
        .lb-send-on:hover  { transform:scale(1.1); box-shadow:0 5px 16px rgba(0,0,0,0.3); }
        .lb-send-on:active { transform:scale(0.93); }
        .lb-send-off { background:#c8c8c8;cursor:not-allowed;opacity:0.5; }
        .lb-send-icon { display:flex;align-items:center;justify-content:center; }

        /* ── Divider line in header ── */
        .lb-header-divider {
          height:1px;background:#e8e8e8;flex-shrink:0;
        }

        /* ── Mobile bottom-sheet ── */
        @keyframes lb-sheet {
          from { transform:translateY(100%); opacity:0.6; }
          to   { transform:translateY(0);   opacity:1; }
        }
        @media (max-width:639px) {
          .lb-panel {
            position:fixed !important;
            bottom:80px !important; left:50% !important;
            top:auto !important; right:auto !important;
            transform:translateX(-50%) !important;
            width:92vw !important; max-width:340px !important;
            max-height:55vh !important;
            border-radius:16px !important;
            animation:lb-up 0.28s cubic-bezier(0.34,1.56,0.64,1) !important;
          }
          .lb-msgs { padding:10px; gap:8px; }
          .lb-input-bar { padding:8px; padding-bottom:max(8px, env(safe-area-inset-bottom)); }
          .lb-input { font-size:16px; /* prevents iOS zoom */ }
          .lb-chip { padding:6px 13px; font-size:11.5px; }
          .lb-action { padding:7px 12px; font-size:11.5px; }
          .lb-action-sm { padding:5px 10px; font-size:11px; }
          .lb-header { padding:12px 14px; }
          .lb-quick-wrap { padding:4px 10px 10px; }
          .lb-fab { width:50px; height:50px; }
          .lb-popup { min-width:180px; }
        }
      `}</style>

      {/* ── FAB + popup ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          ...(fabPos
            ? { left: fabPos.x, top: fabPos.y }
            : { left: 24, bottom: igVisible ? 96 : 24 }),
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 10,
          touchAction: "none",
          cursor: "grab",
        }}
        dir="ltr"
        ref={fabWrapRef}
        onMouseDown={handleFabMouseDown}
        onTouchStart={handleFabTouchStart}
        onMouseEnter={handleFabHoverIn}
        onMouseLeave={handleFabHoverOut}
      >
        <button
          onClick={() => {
            if (hasMovedfab.current) {
              hasMovedfab.current = false;
              return;
            }
            setOpen((v) => !v);
          }}
          className={`lb-fab${!open && !showHelp ? " lb-fab-ring" : ""}`}
          style={{ cursor: "inherit" }}
          aria-label="Chat with Lucie"
        >
          {open ? (
            <X size={19} color="#fff" strokeWidth={2.5} />
          ) : (
            <MessageCircle
              size={22}
              color="#fff"
              strokeWidth={1.8}
              fill="rgba(255,255,255,0.12)"
            />
          )}
        </button>

        {/* ── Teaser bubble ── */}
        {showTeaser && !open && (
          <div
            className="lb-teaser"
            style={{ direction: "rtl" }}
          >
            مرحبا أنا هنا لمساعدتك ✨
          </div>
        )}
      </div>

      {/* ── Chat panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="lb-panel" ref={panelRef} dir={dir} style={getPanelStyle()}>
          {/* Header */}
          <div className="lb-header">
            <div className="lb-header-avatar">
              <Sparkles className="lb-header-avatar-icon" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lb-header-name">
                {lang === "ar" ? "لوسي" : "Lucie"}
              </div>
              <div className="lb-header-sub">
                {lang === "ar"
                  ? "مساعدة لوسيرن بوتيك"
                  : "Lucerne Boutique Assistant"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="lb-lang-toggle"
                onClick={() => {
                  const next = lang === "ar" ? "en" : "ar";
                  setLang(next);
                  if (greeted) {
                    setMessages((prev) => [
                      { id: "0", role: "bot", text: GREETING[next] },
                      ...prev.slice(1),
                    ]);
                    setShowQuick(true);
                  }
                }}
                aria-label="Switch language"
              >
                <Globe className="lb-lang-globe" />
                <span className={`lb-lang-opt ${lang === "ar" ? "lb-lang-opt-active" : "lb-lang-opt-inactive"}`}>ع</span>
                <span className="lb-lang-divider" />
                <span className={`lb-lang-opt ${lang === "en" ? "lb-lang-opt-active" : "lb-lang-opt-inactive"}`}>EN</span>
              </button>
              <button
                className="lb-close-btn"
                onClick={close}
                aria-label="Close"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="lb-status">
            <span className="lb-status-dot" />
            <span className="lb-status-txt">
              {lang === "ar" ? "متاحة الآن" : "Online now"}
            </span>
          </div>

          {/* Messages */}
          <div className="lb-msgs">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} onClose={close} />
            ))}
            {typing && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Size Wizard */}
          {sizeWizard.active && (
            <SizeWizardPanel
              wizard={sizeWizard}
              setWizard={setSizeWizard}
              lang={lang}
            />
          )}

          {/* Quick suggestions */}
          {showQuick && !sizeWizard.active && currentSuggestions.length > 0 && (
            <div className="lb-quick-area">
              <div className="lb-quick-label">
                {lang === "ar" ? "اقتراحات" : "Suggestions"}
              </div>
              <QuickSuggestions
                items={currentSuggestions}
                onSelect={(q) => handleSend(q)}
              />
            </div>
          )}

          {/* Input */}
          <div className="lb-input-bar">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder={
                lang === "ar" ? "اكتبي سؤالك..." : "Type your question..."
              }
              disabled={typing}
              className="lb-input"
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || typing}
              className={`lb-send ${input.trim() && !typing ? "lb-send-on" : "lb-send-off"}`}
              aria-label="Send"
            >
              <span
                className="lb-send-icon"
                style={{
                  transform:
                    lang === "ar"
                      ? "scaleX(-1) rotate(-6deg)"
                      : "rotate(-6deg)",
                  display: "flex",
                }}
              >
                <IconSend size={17} color="#fff" />
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
