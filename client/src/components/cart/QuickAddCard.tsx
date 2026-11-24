import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useCart } from "@/store/use-cart";
import { optimizeCloudinaryUrl } from "@/lib/utils";
import { colourOptions, colourStock, sizeOptions } from "@/lib/cartSizes";
import { translateColorName } from "@/lib/colorFamilies";

/* A suggested piece inside the cart. The plus button adds it right there: if the piece has
   colours or sizes they are picked in the card itself, with no trip to the product page. */
export function QuickAddCard({ product, isAr, onOpen }: { product: any; isAr: boolean; onOpen: () => void }) {
  const { addToCart } = useCart();
  const colours = colourOptions(product).filter((c) => colourStock(product, c.name) > 0);
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState<string | undefined>(colours[0]?.name);
  const [added, setAdded] = useState(false);
  const sizes = sizeOptions(product, color);
  const needsChoice = colours.length > 1 || sizes.length > 0;
  const sale = product.discountPrice && Number(product.discountPrice) > 0 && Number(product.discountPrice) < Number(product.price);
  const image = colours.find((c) => c.name === color)?.mainImage || product.mainImage;

  const add = (size?: string) => {
    addToCart(product, 1, size, color);
    setAdded(true);
    setOpen(false);
  };

  return (
    <div className="rounded-2xl bg-background p-2 shadow-sm" data-testid={`card-cart-suggestion-${product.id}`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
          <img src={optimizeCloudinaryUrl(image, 200) || image} alt="" loading="lazy" className="h-14 w-12 shrink-0 rounded-xl object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">{product.name}</span>
            <span className="text-[13px] text-muted-foreground">
              ₪{Number(sale ? product.discountPrice : product.price)}
              {sale && <s className="ms-1.5 text-[11px]">₪{Number(product.price)}</s>}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => (needsChoice ? setOpen((v) => !v) : add())}
          aria-expanded={needsChoice ? open : undefined}
          aria-label={isAr ? "أضيفي للسلة" : "Add to cart"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-background transition-colors ${added ? "bg-primary" : "bg-foreground hover:bg-primary"}`}
          data-testid={`button-quick-add-${product.id}`}
        >
          {open ? <X className="h-[17px] w-[17px]" /> : added ? <Check className="h-[17px] w-[17px]" /> : <Plus className="h-[17px] w-[17px]" />}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 border-t border-border/70 px-1 pb-1 pt-2.5" data-testid={`panel-quick-add-${product.id}`}>
          {colours.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              {colours.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setColor(c.name)}
                  aria-pressed={color === c.name}
                  title={translateColorName(c.name, isAr ? "ar" : "en")}
                  className={`h-7 w-7 rounded-full border border-black/10 transition-shadow ${color === c.name ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  style={{ background: c.colorCode || "#ddd" }}
                  data-testid={`button-quick-colour-${product.id}-${c.name}`}
                />
              ))}
              <span className="text-[12px] text-muted-foreground">{color ? translateColorName(color, isAr ? "ar" : "en") : ""}</span>
            </div>
          )}
          {sizes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-[12px] font-medium text-muted-foreground">{isAr ? "اختاري المقاس:" : "Pick a size:"}</span>
              {sizes.map((s) => (
                <button
                  key={s.size}
                  type="button"
                  disabled={s.stock <= 0}
                  onClick={() => add(s.size)}
                  className="h-8 min-w-[42px] rounded-full border border-foreground/15 bg-card px-2.5 text-[12.5px] font-semibold transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through"
                  data-testid={`button-quick-size-${product.id}-${s.size}`}
                >
                  {s.size}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => add()} className="h-9 w-full rounded-full bg-primary text-[13px] font-semibold text-primary-foreground" data-testid={`button-quick-confirm-${product.id}`}>
              {isAr ? "أضيفي للسلة" : "Add to cart"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
