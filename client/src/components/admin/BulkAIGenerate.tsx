import { useEffect, useState } from "react";
import { Bot, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BulkAIItem {
  key: string;
  label: string;
  /** What the photo shows (the server adds the theme and the slot's composition rule). */
  prompt: string;
  slot?: string;
  aspect?: "square" | "portrait" | "landscape";
  /** "row" = a category banner row (products on white, trimmed on the server). */
  style?: "row";
  /** Called with the server's answer ({ url, bg?, ar? }) once this item is generated. */
  apply: (data: { url: string; bg?: string; ar?: number }) => void | Promise<void>;
}

/**
 * "Generate all" for a group of photos: lists every item with a tick box so the admin can
 * leave out the ones she does not want, then generates the ticked ones one after another
 * and shows what happened to each.
 */
export default function BulkAIGenerate({ items, label = "توليد كل الصور بالذكاء الاصطناعي", note }: { items: BulkAIItem[]; label?: string; note?: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<Record<string, "wait" | "run" | "ok" | string>>({});
  const [running, setRunning] = useState(false);
  const [stop, setStop] = useState(false);

  // Everything is ticked by default; new items appear ticked too.
  useEffect(() => {
    setPicked((prev) => {
      const next: Record<string, boolean> = {};
      for (const it of items) next[it.key] = prev[it.key] ?? true;
      return next;
    });
  }, [items.map((i) => i.key).join("|")]);

  const chosen = items.filter((i) => picked[i.key]);
  const setAll = (v: boolean) => setPicked(Object.fromEntries(items.map((i) => [i.key, v])));

  const run = async () => {
    setRunning(true);
    setStop(false);
    setState(Object.fromEntries(chosen.map((i) => [i.key, "wait"])));
    let stopped = false;
    for (const it of chosen) {
      if (stopped) break;
      setState((s) => ({ ...s, [it.key]: "run" }));
      try {
        const res = await fetch("/api/admin/ai-generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: it.prompt, slot: it.slot, aspect: it.aspect, style: it.style }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
          if (data?.noKey) stopped = true; // nothing else can work without the key
          throw new Error(data?.noKey ? "مفتاح الذكاء الاصطناعي غير موجود على السيرفر" : data?.message || "فشل التوليد");
        }
        await it.apply(data);
        setState((s) => ({ ...s, [it.key]: "ok" }));
      } catch (err: any) {
        setState((s) => ({ ...s, [it.key]: String(err?.message || "فشل التوليد").slice(0, 120) }));
      }
      // The stop button is read through a state setter so the loop sees the latest value.
      await new Promise<void>((resolve) => setStop((v) => { if (v) stopped = true; resolve(); return v; }));
    }
    setRunning(false);
  };

  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.03]" data-testid="bulk-ai-generate">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right"
        data-testid="button-bulk-ai-toggle"
      >
        <span className="text-xs text-muted-foreground">{open ? "إخفاء" : `${items.length} صورة`}</span>
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          {label}
          <Bot className="h-4 w-4" />
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-primary/15 px-4 py-3">
          <p className="text-[11px] text-muted-foreground text-right">
            أزيلي العلامة عن أي صورة لا تريدين توليدها، ثم ابدئي. تُولَّد الصور واحدة تلو الأخرى وتستبدل الصورة الحالية لكل عنصر. {note}
          </p>
          <div className="flex items-center justify-end gap-3 text-[11px]">
            <button type="button" className="text-primary underline underline-offset-2" onClick={() => setAll(false)} disabled={running}>إلغاء تحديد الكل</button>
            <button type="button" className="text-primary underline underline-offset-2" onClick={() => setAll(true)} disabled={running}>تحديد الكل</button>
          </div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {items.map((it) => {
              const st = state[it.key];
              return (
                <li key={it.key} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" dir="auto">
                    {st === "run" ? "جاري التوليد…" : st === "wait" ? "في الانتظار" : st === "ok" ? "" : st || ""}
                  </span>
                  {st === "run" && <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
                  {st === "ok" && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                  {st && !["run", "wait", "ok"].includes(st) && <X className="h-4 w-4 shrink-0 text-destructive" />}
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                    <span className="max-w-[11rem] truncate">{it.label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={!!picked[it.key]}
                      disabled={running}
                      onChange={(e) => setPicked((p) => ({ ...p, [it.key]: e.target.checked }))}
                      data-testid={`bulk-pick-${it.key}`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2">
            {running && (
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setStop(true)} data-testid="button-bulk-ai-stop">
                إيقاف بعد الصورة الحالية
              </Button>
            )}
            <Button type="button" size="sm" className="h-9 gap-2" onClick={run} disabled={running || chosen.length === 0} data-testid="button-bulk-ai-start">
              <Bot className="h-4 w-4" />
              {running ? "جاري التوليد…" : `توليد ${chosen.length} صورة`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
