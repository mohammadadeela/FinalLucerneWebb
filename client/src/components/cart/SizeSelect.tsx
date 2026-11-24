import { ChevronDown } from "lucide-react";
import { sizeOptions } from "@/lib/cartSizes";

/* The size of a piece in the cart, as a small pill. When other sizes are in stock it is a
   menu, so the size can be changed on the spot. */
export function SizeSelect({
  product,
  color,
  size,
  onChange,
  isAr,
  testId,
}: {
  product: any;
  color?: string | null;
  size?: string | null;
  onChange: (size: string) => void;
  isAr: boolean;
  testId?: string;
}) {
  if (!size) return null;
  const options = sizeOptions(product, color).filter((o) => o.stock > 0 || o.size === size);
  const pill = "inline-flex h-7 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-secondary text-[12.5px] font-semibold";
  if (options.length < 2) return <span className={pill + " px-2.5"}>{size}</span>;
  return (
    <span className={pill + " relative"}>
      <select
        value={size}
        onChange={(e) => onChange(e.target.value)}
        aria-label={isAr ? "تغيير المقاس" : "Change size"}
        className="h-7 cursor-pointer appearance-none rounded-full bg-transparent pe-6 ps-2.5 text-[12.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid={testId}
      >
        {options.map((o) => (
          <option key={o.size} value={o.size}>
            {o.size}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-1.5 h-3.5 w-3.5 text-foreground/60" />
    </span>
  );
}
