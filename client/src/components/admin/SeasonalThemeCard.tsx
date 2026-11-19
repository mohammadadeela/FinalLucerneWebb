import { useState } from "react";
import { PartyPopper, ChevronDown, ChevronUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SeasonThumb } from "@/components/seasonal/SeasonalDecor";
import { SEASONS, SEASONAL_THEMES, getActiveTheme, seasonBarText, daysUntil, daysLabel, type SeasonalTheme } from "@/lib/seasonal";

/** Pick ONE seasonal theme. The choice is stored as a single value (`seasonal_theme`), so two can never be on together. */
export default function SeasonalThemeCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const active = getActiveTheme(values);
  const info = active ? SEASONS[active] : null;
  const days = daysUntil(values["seasonal_countdown_date"]);

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-seasonal">
      <button
        type="button"
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${active ? "bg-foreground/[0.04] hover:bg-foreground/[0.07]" : "bg-muted/30 hover:bg-muted/60"}`}
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-seasonal"
      >
        <div className="flex items-center gap-2.5">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          {info ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مفعّل: {info.nameAr}
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">معطّل</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-sm">المواسم والأعياد</p>
            <p className="text-xs text-muted-foreground">Seasonal Themes</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground"}`}>
            <PartyPopper className="w-4 h-4" />
          </div>
        </div>
      </button>

      {open && (
        <div className="bg-background px-5 pt-4 pb-5 space-y-4">
          <p className="text-xs text-muted-foreground text-right" data-testid="text-seasonal-hint">
            يمكن تفعيل موسم واحد فقط في كل مرة — تفعيل موسم يُطفئ الآخر تلقائياً.
          </p>

          <div className="grid sm:grid-cols-3 gap-3" data-testid="season-cards">
            {SEASONAL_THEMES.map((id) => {
              const s = SEASONS[id];
              const on = active === id;
              const swatches = [s.palette.night, s.palette.deep, s.palette.glow, s.palette.light, s.palette.gold];
              return (
                <div
                  key={id}
                  className={`rounded-xl border overflow-hidden bg-background transition-all ${on ? "border-foreground ring-1 ring-foreground shadow-md" : "border-border hover:border-foreground/40"}`}
                  data-testid={`card-season-${id}`}
                >
                  <SeasonThumb id={id} />
                  <div className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={s.nameAr}
                        onClick={() => onChange("seasonal_theme", on ? "none" : id)}
                        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-foreground" : "bg-muted-foreground/30"}`}
                        data-testid={`toggle-seasonal-${id}`}
                      >
                        <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-background shadow-sm transition-transform duration-200 left-[3px] ${on ? "translate-x-[20px]" : "translate-x-0"}`} />
                      </button>
                      <div className="text-right min-w-0">
                        <p className="font-semibold text-sm">{s.nameAr}</p>
                        <p className="text-[11px] text-muted-foreground">{s.nameEn}</p>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground text-right">{s.ideaAr}</p>
                    <div className="flex justify-end gap-1.5" aria-hidden="true">
                      {swatches.map((c) => (
                        <span key={c} className="w-4 h-4 rounded-full border border-black/10" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {info && active && (
            <div className="space-y-4" data-testid="seasonal-settings">
              <div
                className="rounded-lg overflow-hidden text-xs font-light tracking-[0.2em] py-2.5 px-3 text-center whitespace-nowrap overflow-ellipsis"
                style={{ background: info.barBg, color: info.barText }}
                data-testid="seasonal-preview"
              >
                <span style={{ color: info.accent }}>✦</span>
                <span className="mx-3">{seasonBarText(values, active, "ar").split("|")[0].trim()}</span>
                <span style={{ color: info.accent }}>✦</span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium block text-right">تاريخ المناسبة للعدّ التنازلي (اختياري)</Label>
                <Input
                  type="date"
                  value={values["seasonal_countdown_date"] ?? ""}
                  onChange={(e) => onChange("seasonal_countdown_date", e.target.value)}
                  className="max-w-[220px] ms-auto"
                  data-testid="input-seasonal-date"
                />
                <p className="text-[11px] text-muted-foreground text-right">
                  {days === null
                    ? "مواعيد الأعياد تتبع رؤية الهلال، لذا أدخليها يدوياً. اتركيه فارغاً لإخفاء العدّاد."
                    : days < 0
                      ? "هذا التاريخ مضى — لن يظهر العدّاد."
                      : days === 0
                        ? "المناسبة اليوم!"
                        : `سيظهر على البانر: باقي ${daysLabel(days, "ar")}`}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium block text-right">نص الشريط بالعربية (اختياري)</Label>
                  <Input
                    dir="rtl"
                    value={values["seasonal_text_ar"] ?? ""}
                    onChange={(e) => onChange("seasonal_text_ar", e.target.value)}
                    placeholder={info.defaultBarAr[0]}
                    data-testid="input-seasonal-text-ar"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium block text-right">Bar text in English (optional)</Label>
                  <Input
                    dir="ltr"
                    value={values["seasonal_text_en"] ?? ""}
                    onChange={(e) => onChange("seasonal_text_en", e.target.value)}
                    placeholder={info.defaultBarEn[0]}
                    data-testid="input-seasonal-text-en"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground text-right">
                افصلي بين الرسائل بالرمز | — وإن تركتِ الحقول فارغة تظهر رسائل احتفالية جاهزة.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
