import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, Sparkles, Loader2, ChevronDown, ChevronUp, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* فحص اللغات: يعرض كل اسم ونص في الموقع بالعربي والإنجليزي جنباً إلى جنب، يحدد الناقص،
   ويكتب الناقص بالذكاء الاصطناعي — للكل، لنوع واحد، أو لما تختاره الإدارة فقط.
   كل خانة قابلة للتعديل باليد وتُحفظ عند الخروج منها. */

type Row = {
  key: string;
  kind: "category" | "subcategory" | "product" | "text";
  field: "name" | "description" | "text";
  label: string;
  ar: string;
  en: string;
  missing: "en" | "ar" | null;
};

const GROUPS: { id: string; label: string; match: (r: Row) => boolean }[] = [
  { id: "category", label: "الفئات", match: (r) => r.kind === "category" },
  { id: "subcategory", label: "الفئات الفرعية", match: (r) => r.kind === "subcategory" },
  { id: "product-name", label: "أسماء المنتجات", match: (r) => r.kind === "product" && r.field === "name" },
  { id: "product-description", label: "أوصاف المنتجات", match: (r) => r.kind === "product" && r.field === "description" },
  { id: "text", label: "عناوين ونصوص الموقع", match: (r) => r.kind === "text" },
];

const STOP_TEXT: Record<string, string> = {
  no_key: "مفتاح Gemini غير مضاف على السيرفر (GEMINI_API_KEY).",
  no_credit: "رصيد Gemini خلص. اشحن الرصيد ثم أعد المحاولة — توقفنا عن إرسال طلبات.",
  busy: "Gemini مشغول الآن. جرّب بعد دقيقة.",
  failed: "تعذّر إكمال الترجمة. ما تم حفظه بقي محفوظاً — أعد المحاولة للباقي.",
};

export default function LanguageCheckCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState("category");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState(60);

  const { data, isLoading, refetch, isFetching } = useQuery<{ rows: Row[]; aiReady: boolean }>({
    queryKey: ["/api/admin/translations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/translations", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return (await res.json()).data;
    },
    staleTime: 0,
  });
  const rows = data?.rows || [];
  const missingAll = rows.filter((r) => r.missing).length;
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.id, rows.filter((r) => g.match(r) && r.missing).length])), [rows]);
  const current = GROUPS.find((g) => g.id === group)!;
  const inGroup = rows.filter(current.match);
  const visible = inGroup.filter((r) => !onlyMissing || r.missing || picked.has(r.key));

  const generate = async (keys: string[] | null, label: string, overwrite = false) => {
    if (busy) return;
    setBusy(label);
    try {
      const res = await fetch("/api/admin/translations/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys, overwrite }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error("failed");
      const { done, asked, stopped } = body.data as { done: unknown[]; asked: number; stopped: string | null };
      toast({
        title: stopped ? `تمت كتابة ${done.length} من ${asked}` : done.length ? `تمت كتابة ${done.length} نص` : "لا يوجد شيء ناقص هنا",
        description: stopped ? STOP_TEXT[stopped] || STOP_TEXT.failed : done.length ? "راجعها هنا وعدّل أي واحد لا يعجبك." : undefined,
        variant: stopped ? "destructive" : undefined,
      });
      setPicked(new Set());
      await refetch();
      qc.invalidateQueries({ predicate: (q) => /product|categor|site-settings|settings/i.test(JSON.stringify(q.queryKey)) && !String(q.queryKey[0]).includes("translations") });
    } catch {
      toast({ title: "تعذّر الاتصال بالسيرفر", description: "لم يتغير شيء. أعد المحاولة.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const saveOne = async (row: Row, lang: "en" | "ar", value: string) => {
    const before = lang === "en" ? row.en : row.ar;
    if (value.trim() === before.trim() || !value.trim()) return;
    const res = await fetch("/api/admin/translations", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: row.key, lang, value }),
    });
    if (res.ok) {
      toast({ title: "تم الحفظ" });
      refetch();
    } else {
      toast({ title: "تعذّر الحفظ", variant: "destructive" });
    }
  };

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const pickedHere = visible.filter((r) => picked.has(r.key)).length;
  const allPicked = visible.length > 0 && pickedHere === visible.length;

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" dir="rtl" data-testid="section-language-check">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-colors" data-testid="button-toggle-language-check">
        <span className="flex items-center gap-3 text-right">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Languages className="h-[18px] w-[18px]" /></span>
          <span>
            <span className="block text-sm font-bold">فحص اللغات — عربي / إنجليزي</span>
            <span className="block text-xs text-muted-foreground">
              {isLoading ? "جارٍ الفحص…" : missingAll ? `${missingAll} اسم أو نص ناقص بإحدى اللغتين` : "كل الأسماء والنصوص موجودة باللغتين"}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {!isLoading && missingAll > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">{missingAll}</span>}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            الزبون يرى الموقع بالإنجليزي افتراضياً ويقدر يحوّله عربي. هنا ترى كل اسم بالعربي ومقابله الإنجليزي الحالي. الأصفر = ناقص.
            اضغط «اكتب الناقص» ليكتبه الذكاء الاصطناعي، أو عدّل أي خانة بيدك (تُحفظ لما تطلع منها). الذكاء الاصطناعي لا يغيّر أي اسم عربي موجود.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!!busy || !missingAll || !data?.aiReady}
              onClick={() => generate(null, "all")}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              data-testid="button-generate-all"
            >
              {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              اكتب كل الناقص في الموقع ({missingAll})
            </button>
            <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium" data-testid="button-recheck">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              افحص من جديد
            </button>
            {data && !data.aiReady && <span className="text-xs font-medium text-destructive">{STOP_TEXT.no_key}</span>}
            {busy && <span className="text-xs text-muted-foreground">يكتب الآن… قد يأخذ دقيقة أو أكثر للمنتجات الكثيرة، لا تغلق الصفحة.</span>}
          </div>

          <div className="flex flex-wrap gap-2" role="tablist">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={group === g.id}
                onClick={() => { setGroup(g.id); setShown(60); }}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${group === g.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40"}`}
                data-testid={`tab-language-${g.id}`}
              >
                {g.label}
                {counts[g.id] > 0 ? (
                  <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{counts[g.id]}</span>
                ) : (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() => setPicked((prev) => { const next = new Set(prev); visible.forEach((r) => (allPicked ? next.delete(r.key) : next.add(r.key))); return next; })}
                className="h-4 w-4 accent-pink-600"
                data-testid="checkbox-pick-all"
              />
              تحديد الكل ({visible.length})
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4 accent-pink-600" data-testid="checkbox-only-missing" />
              الناقص فقط
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy || !counts[group] || !data?.aiReady}
                onClick={() => generate(inGroup.filter((r) => r.missing).map((r) => r.key), "group")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary px-3.5 text-[13px] font-semibold text-primary disabled:opacity-40"
                data-testid="button-generate-group"
              >
                {busy === "group" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                اكتب الناقص في «{current.label}»
              </button>
              <button
                type="button"
                disabled={!!busy || !pickedHere || !data?.aiReady}
                onClick={() => generate(visible.filter((r) => picked.has(r.key)).map((r) => r.key), "picked", true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background disabled:opacity-40"
                data-testid="button-generate-picked"
              >
                {busy === "picked" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                اكتب للمحدد ({pickedHere})
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">«اكتب للمحدد» يعيد كتابة الإنجليزي حتى لو كان موجوداً — استخدمه لما اسم إنجليزي ما يعجبك.</p>

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : visible.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 px-4 py-6 text-center text-sm font-medium text-emerald-700" data-testid="text-language-complete">
              لا يوجد شيء ناقص في «{current.label}». أزل علامة «الناقص فقط» لترى كل الأسماء وتعدّلها.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[28px_1fr_1fr] gap-3 px-2 text-[11px] font-bold text-muted-foreground">
                <span />
                <span>العربي</span>
                <span>الإنجليزي (ما يراه الزبون بالموقع الإنجليزي)</span>
              </div>
              {visible.slice(0, shown).map((r) => {
                const long = r.field !== "name";
                const cell = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
                const Field: any = long ? "textarea" : "input";
                return (
                  <div key={r.key} className={`grid grid-cols-[28px_1fr] sm:grid-cols-[28px_1fr_1fr] items-start gap-x-3 gap-y-1.5 rounded-lg border p-2 ${r.missing ? "border-amber-300 bg-amber-50/60" : "border-border"}`} data-testid={`row-language-${r.key}`}>
                    <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} className="mt-2.5 h-4 w-4 accent-pink-600" aria-label="تحديد" data-testid={`checkbox-language-${r.key}`} />
                    <div className="min-w-0">
                      {r.label && <p className="mb-1 truncate text-[11px] text-muted-foreground">{r.label}</p>}
                      <Field
                        key={r.key + ":ar:" + r.ar}
                        defaultValue={r.ar}
                        dir="rtl"
                        rows={long ? 3 : undefined}
                        placeholder={r.missing === "ar" ? "ناقص بالعربي" : ""}
                        onBlur={(e: any) => saveOne(r, "ar", e.target.value)}
                        className={`${cell} ${r.missing === "ar" ? "border-amber-400" : "border-border"}`}
                        data-testid={`input-ar-${r.key}`}
                      />
                    </div>
                    <div className="col-start-2 min-w-0 sm:col-start-3">
                      {r.label && <p className="mb-1 hidden text-[11px] sm:block">&nbsp;</p>}
                      <Field
                        key={r.key + ":en:" + r.en}
                        defaultValue={r.en}
                        dir="ltr"
                        rows={long ? 3 : undefined}
                        placeholder={r.missing === "en" ? "Missing — no English yet" : ""}
                        onBlur={(e: any) => saveOne(r, "en", e.target.value)}
                        className={`${cell} text-left ${r.missing === "en" ? "border-amber-400" : "border-border"}`}
                        data-testid={`input-en-${r.key}`}
                      />
                    </div>
                  </div>
                );
              })}
              {visible.length > shown && (
                <button type="button" onClick={() => setShown((n) => n + 100)} className="w-full rounded-lg border border-dashed border-border py-2.5 text-[13px] font-semibold text-muted-foreground hover:border-foreground/40" data-testid="button-show-more-language">
                  اعرض المزيد ({visible.length - shown} باقي)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
