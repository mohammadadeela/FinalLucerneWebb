import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface CountryOption {
  code: string;
  flag: string;
  label: string;
}

export const PHONE_COUNTRIES: CountryOption[] = [
  { code: "+970", flag: "🇵🇸", label: "فلسطين · Palestine" },
  { code: "+972", flag: "🇵🇸", label: "فلسطين ٤٨ · Palestine 48" },
];

interface DropdownPos {
  top: number;
  left: number;
  width: number;
}

interface PhoneCountrySelectProps {
  value: string;
  onChange: (code: string) => void;
  height?: "h-10" | "h-12";
  testId?: string;
}

export function PhoneCountrySelect({
  value,
  onChange,
  height = "h-10",
  testId,
}: PhoneCountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const selected = PHONE_COUNTRIES.find((c) => c.code === value) ?? PHONE_COUNTRIES[0];

  const openDropdown = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + window.scrollY + 6,
      left: r.left + window.scrollX,
      width: Math.max(r.width, 240),
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onScroll() { setOpen(false); }
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      {/* Trigger button — dark luxury style */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`
          flex items-center gap-2 ${height} shrink-0
          bg-foreground text-background
          border-0 border-e border-border
          px-3.5 text-sm font-semibold
          rounded-s-md
          cursor-pointer select-none
          transition-opacity duration-150
          hover:opacity-80
          focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
          dark:bg-foreground dark:text-background
        `}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={testId}
      >
        <span className="text-lg leading-none">{selected.flag}</span>
        <span className="tabular-nums tracking-wide">{selected.code}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Portal dropdown */}
      {open && pos && createPortal(
        <div
          style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            minWidth: pos.width,
            zIndex: 9999,
          }}
          className="rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Header label */}
          <div className="px-4 pt-3 pb-1.5">
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500 font-semibold">
              Country Code
            </p>
          </div>

          {PHONE_COUNTRIES.map((c, i) => {
            const isSelected = c.code === value;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); }}
                className={`
                  flex items-center gap-3 w-full px-4 py-3 text-sm text-start
                  transition-colors duration-100
                  ${isSelected
                    ? "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                  }
                  ${i < PHONE_COUNTRIES.length - 1 && !isSelected ? "border-b border-zinc-100 dark:border-zinc-800" : ""}
                `}
              >
                <span className="text-2xl leading-none">{c.flag}</span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-bold text-[13px] leading-tight">{c.code}</span>
                  <span className={`text-[11px] leading-tight mt-0.5 ${isSelected ? "opacity-70" : "text-zinc-400 dark:text-zinc-500"}`}>
                    {c.label}
                  </span>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </button>
            );
          })}

          {/* Footer */}
          <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center">
              {value} · Tap to change
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
