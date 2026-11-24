import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/i18n";

/* The sort order as a soft pill that opens a rounded list — instead of the browser's own
   grey drop-down, which looks different (and dated) on every device. */
export function SortMenu<T extends string>({
  value,
  options,
  onChange,
  testId = "select-sort",
  className = "",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testId?: string;
  className?: string;
}) {
  const { language } = useLanguage();
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <DropdownMenu dir={language === "ar" ? "rtl" : "ltr"}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={language === "ar" ? "الترتيب" : "Sort"}
          className={`group inline-flex h-10 items-center justify-between gap-2 rounded-full border border-foreground/15 bg-card pe-3 ps-4 text-[13px] font-medium outline-none transition-colors hover:border-foreground/40 focus-visible:border-foreground data-[state=open]:border-foreground ${className}`}
          data-testid={testId}
          data-value={value}
        >
          <span className="truncate">{current?.label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-foreground/60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="min-w-[13rem] rounded-2xl border border-border bg-card p-1.5 shadow-[0_18px_40px_-18px_rgba(45,15,36,0.35)]"
      >
        {options.map((option) => {
          const on = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onChange(option.value)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[13.5px] outline-none ${on ? "bg-secondary font-semibold text-foreground" : "text-foreground/80"}`}
              data-testid={`${testId}-option-${option.value || "default"}`}
            >
              {option.label}
              {on && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
