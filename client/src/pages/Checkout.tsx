import { useState, useEffect, useRef } from "react";
import { optimizeCloudinaryUrl, blurCloudinaryUrl } from "@/lib/utils";
import { useLocation, Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/store/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { useCreateOrder } from "@/hooks/use-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { CreditCard, Banknote, MapPin, Truck, Sparkles, CheckCircle2, Tag, X, Loader2, ArrowRight, Gift, Wallet, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PhoneCountrySelect } from "@/components/ui/PhoneCountrySelect";
import type { ColorVariant } from "@shared/schema";
import { translateColorName } from "@/lib/colorFamilies";
import { useSiteSettings, getShippingZones } from "@/hooks/use-site-settings";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const SAVED_INFO_KEY_PREFIX = "lucerne_checkout_info_";
function savedInfoKey(userId: number) {
  return `${SAVED_INFO_KEY_PREFIX}${userId}`;
}

const PHONE_PREFIXES = ["+970", "+972"];

function splitStoredPhone(stored: string): { prefix: string; digits: string } {
  const trimmed = (stored || "").trim();
  for (const p of PHONE_PREFIXES) {
    if (trimmed.startsWith(p)) {
      return { prefix: p, digits: trimmed.slice(p.length).replace(/\D/g, "") };
    }
  }
  return { prefix: PHONE_PREFIXES[0], digits: trimmed.replace(/\D/g, "") };
}

/** Browser/device autofill often inserts the saved contact's FULL international
 *  number (e.g. "+972597314193") into the digits-only field, which used to get
 *  silently truncated to 9 digits and produce a broken number. This strips a
 *  leading international access code ("00") and/or country code (970/972) so
 *  only the local number remains, and reports which country it matched so the
 *  prefix dropdown (المقدمة) can be synced automatically. */
function stripAutofillCountryCode(rawDigits: string): { digits: string; prefix?: string } {
  let digits = rawDigits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  for (const p of PHONE_PREFIXES) {
    const code = p.slice(1); // "970" | "972"
    if (digits.startsWith(code)) {
      let rest = digits.slice(code.length);
      if (rest.startsWith("0")) rest = rest.slice(1);
      return { digits: rest, prefix: p };
    }
  }
  return { digits };
}

function normalizeArabicDigits(str: string): string {
  return str
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function getItemImage(item: { product: any; color?: string }): string {
  const cv = (item.product.colorVariants as ColorVariant[] | undefined) || [];
  if (cv.length > 0 && item.color) {
    const variant = cv.find((v) => v.name === item.color);
    if (variant?.mainImage) return variant.mainImage;
  }
  return item.product.mainImage;
}

// Attaches a product photo to each sold-out entry (matched from the cart items
// that are still present at this point, before they get removed) so the
// customer can actually see what was taken out of their cart instead of just
// reading a name.
function attachSoldOutImages(
  oosList: Array<{ productId: number; name: string; color?: string | null; size?: string | null }>,
  cartItems: Array<{ product: any; size?: string; color?: string }>
): Array<{ productId: number; name: string; color?: string | null; size?: string | null; image?: string }> {
  return oosList.map((oos) => {
    const match =
      cartItems.find(
        (ci) => ci.product.id === oos.productId && (ci.size || null) === (oos.size || null) && (ci.color || null) === (oos.color || null)
      ) || cartItems.find((ci) => ci.product.id === oos.productId);
    const image = match ? getItemImage({ product: match.product, color: match.color }) : undefined;
    return { ...oos, image };
  });
}

function CheckoutItemImage({ src, alt, onClick, testId }: { src: string; alt: string; onClick: () => void; testId?: string }) {
  const [ready, setReady] = useState(false);
  const blurSrc = blurCloudinaryUrl(src);
  const optimized = optimizeCloudinaryUrl(src, 300) || src;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full h-full focus:outline-none group/img relative overflow-hidden rounded-xl"
      data-testid={testId}
      aria-label="View photo"
    >
      {blurSrc && (
        <img
          src={blurSrc}
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`}
        />
      )}
      <img
        src={optimized}
        alt={alt}
        className="w-full h-full object-cover transition-opacity duration-300"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
      />
      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/25 transition-all duration-300" />
      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
        <Plus className="w-5 h-5 text-white drop-shadow" strokeWidth={2.5} />
      </span>
    </button>
  );
}

export default function Checkout() {
  const { items, cartTotal, clearCart, removeFromCart, updateQuantity, isLoading: cartLoading } = useCart();
  const [soldOutItems, setSoldOutItems] = useState<Array<{productId: number; name: string; color?: string | null; size?: string | null; image?: string}>>([]);
  const soldOutBannerRef = useRef<HTMLDivElement>(null);
  const scrollToSoldOutBanner = () => {
    // On phones the on-screen keyboard is usually still open (the customer
    // was just typing in the form when they tapped checkout). Scrolling
    // immediately lands in the wrong spot once the keyboard closes and the
    // viewport resizes afterward — so close the keyboard first, then wait
    // for the layout to settle before scrolling to the banner.
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === "function") active.blur();
    setTimeout(() => {
      soldOutBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  };
  const { data: user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { data: siteSettings } = useSiteSettings();
  const shippingZones = getShippingZones(siteSettings);
  const cardPaymentEnabled = siteSettings?.card_payment_enabled !== "false";
  const loyaltyPointsEnabled = siteSettings?.loyalty_points_enabled !== "false";
  const whatsappNotificationsEnabled = siteSettings?.checkout_whatsapp_enabled !== "false";
  const createOrder = useCreateOrder();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "card">("cod");
  const [stripeLoading, setStripeLoading] = useState(false);
  const [shippingRegion, setShippingRegion] = useState<string>("");
  const shippingRegionRef = useRef<HTMLDivElement>(null);
  const [saveInfo, setSaveInfo] = useState(true);
  const [autoFilled, setAutoFilled] = useState(false);

  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; discountPercent: number; categoryIds?: number[] | null; subcategoryIds?: number[] | null } | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError, setDiscountError] = useState("");

  const [useCreditEnabled, setUseCreditEnabled] = useState(false);
  const [creditInput, setCreditInput] = useState<string>("");
  const [creditCardExpanded, setCreditCardExpanded] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ images: string[]; name: string; idx: number } | null>(null);
  const { data: loyalty } = useQuery<{ points: number; credit: string }>({
    queryKey: ["/api/loyalty"],
    enabled: !!user,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const availableCredit = Number(loyalty?.credit || 0);

  const [phonePrefix, setPhonePrefix] = useState("+970");
  const [phone2Prefix, setPhone2Prefix] = useState("+970");
  const [phoneValidationError, setPhoneValidationError] = useState(false);
  const [phone2ValidationError, setPhone2ValidationError] = useState(false);
  const [phoneShakeKey, setPhoneShakeKey] = useState(0);
  const [phone2ShakeKey, setPhone2ShakeKey] = useState(0);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const phone2InputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    phone2: "",
    address: "",
    city: "",
    notes: "",
  });

  useEffect(() => {
    if (!cardPaymentEnabled && paymentMethod === "card") {
      setPaymentMethod("cod");
    }
  }, [cardPaymentEnabled, paymentMethod]);

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/auth");
    }
  }, [authLoading, user, setLocation]);

  /* Load saved info from user-specific localStorage (keyed by userId) once user is available.
     Using a user-specific key ensures different accounts on the same browser never share
     checkout data. Falls back to the user's database profile for phone/address/name. */
  useEffect(() => {
    if (!user) return;
    const key = savedInfoKey(user.id);
    // Always resolve the user's current profile phone first — it is the source of truth
    const userPhone = (user as any).phone || "";
    const { prefix: profilePrefix, digits: profileDigits } = splitStoredPhone(userPhone);

    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        const parsedPhone2 = splitStoredPhone(parsed.phone2 || "");
        setFormData(prev => ({
          fullName: parsed.fullName || prev.fullName,
          // Always use the profile phone — user may have updated it since the cache was saved
          phone: profileDigits || prev.phone,
          phone2: parsedPhone2.digits || prev.phone2,
          address: parsed.address || prev.address,
          city: parsed.city || prev.city,
          notes: parsed.notes || prev.notes,
        }));
        // Phone prefix comes from profile, not cache
        if (profileDigits) setPhonePrefix(profilePrefix);
        if (parsedPhone2.digits) setPhone2Prefix(parsed.phone2Prefix || parsedPhone2.prefix);
        if (parsed.shippingRegion) setShippingRegion(parsed.shippingRegion);
        setSaveInfo(true);
        setAutoFilled(true);
        return;
      }
    } catch {}

    // No local cache for this user — load from their database profile
    setFormData(prev => ({
      ...prev,
      fullName: prev.fullName || user.fullName || "",
      phone: prev.phone || profileDigits,
      address: prev.address || (user as any).address || "",
    }));
    if (profileDigits) setPhonePrefix(profilePrefix);
    if ((user as any).shippingRegion) {
      setShippingRegion(prev => prev || (user as any).shippingRegion);
    }
  }, [user?.id]);

  useEffect(() => {
    // Never redirect while the server cart is still loading — items is
    // temporarily [] during that window and we'd bounce the customer out
    // of checkout for no reason with no explanation.
    if (cartLoading) return;
    if (items.length === 0 && user && soldOutItems.length === 0) {
      setLocation("/shop");
    }
  }, [cartLoading, items.length, user, setLocation, soldOutItems.length]);

  const stockValidatedRef = useRef(false);
  useEffect(() => {
    if (cartLoading || items.length === 0 || stockValidatedRef.current) return;
    stockValidatedRef.current = true;
    const validateStock = async () => {
      try {
        const res = await fetch("/api/cart/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(i => ({
              productId: i.product.id,
              quantity: i.quantity,
              size: i.size || null,
              color: i.color || null,
            })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.outOfStock && data.outOfStock.length > 0) {
          const trulySoldOut = data.outOfStock.filter((oos: any) => oos.reason === "sold_out" || !oos.available || oos.available <= 0);
          const insufficientStock = data.outOfStock.filter((oos: any) => oos.reason === "insufficient_stock" && oos.available > 0);
          if (trulySoldOut.length > 0) {
            setSoldOutItems(attachSoldOutImages(trulySoldOut, items));
            for (const oos of trulySoldOut) {
              removeFromCart(oos.productId, oos.size || undefined, oos.color || undefined);
            }
            const ar = language === "ar";
            toast({
              title: ar ? "منتجات نفدت من المخزون" : "Items sold out",
              description: trulySoldOut.map((oos: any) =>
                ar
                  ? `${oos.name}${oos.size ? ` (${oos.size})` : ""} — تمت إزالته من السلة`
                  : `${oos.name}${oos.size ? ` (${oos.size})` : ""} — removed from your cart`
              ).join("\n"),
              variant: "destructive",
            });
          }
          for (const oos of insufficientStock) {
            updateQuantity(oos.productId, oos.available, oos.size || undefined, oos.color || undefined);
          }
          if (insufficientStock.length > 0) {
            const ar = language === "ar";
            toast({
              title: ar ? "تم تعديل الكمية" : "Quantity adjusted",
              description: insufficientStock.map((oos: any) =>
                ar
                  ? `${oos.name} — ${oos.size || ""}: متوفر ${oos.available} فقط`
                  : `${oos.name} — ${oos.size || ""}: only ${oos.available} available`
              ).join("\n"),
            });
          }
        }
      } catch {}
    };
    validateStock();
  }, [cartLoading, items.length]);

  /* ── Derived totals + discount/credit effects ──
     MUST run before any early return: React hooks may never be
     skipped between renders (fixes React error #300 when the cart
     empties after an out-of-stock response). */
  const shippingRates: Record<string, number> = {};
  shippingZones.forEach(z => { shippingRates[z.id] = z.price; });

  const shippingCost = shippingRegion ? (shippingRates[shippingRegion] || 0) : 0;
  const subtotal = cartTotal();

  const discountableSubtotal = (() => {
    if (!appliedDiscount) return 0;
    const hasCatFilter = appliedDiscount.categoryIds && appliedDiscount.categoryIds.length > 0;
    const hasSubCatFilter = appliedDiscount.subcategoryIds && appliedDiscount.subcategoryIds.length > 0;
    if (!hasCatFilter && !hasSubCatFilter) return subtotal;
    return items.reduce((acc, item) => {
      const catMatch = hasCatFilter && appliedDiscount.categoryIds!.includes(item.product.categoryId);
      const productSubIds: number[] = Array.isArray((item.product as any).subcategoryIds)
        ? (item.product as any).subcategoryIds
        : [];
      const allSubIds = item.product.subcategoryId != null
        ? Array.from(new Set([...productSubIds, item.product.subcategoryId]))
        : productSubIds;
      const subCatMatch = hasSubCatFilter && allSubIds.some((id) => appliedDiscount.subcategoryIds!.includes(id));
      if (!catMatch && !subCatMatch) return acc;
      const price = item.product.discountPrice ? Number(item.product.discountPrice) : Number(item.product.price);
      return acc + price * item.quantity;
    }, 0);
  })();

  const discountAmount = appliedDiscount ? Math.round(discountableSubtotal * (appliedDiscount.discountPercent / 100) * 100) / 100 : 0;
  const isRestrictedDiscount = appliedDiscount && ((appliedDiscount.categoryIds && appliedDiscount.categoryIds.length > 0) || (appliedDiscount.subcategoryIds && appliedDiscount.subcategoryIds.length > 0));
  const maxCreditAllowed = Math.min(availableCredit, Math.max(0, subtotal - discountAmount));
  const requestedCredit = Number(creditInput) || 0;
  const creditApplied = useCreditEnabled
    ? Math.max(0, Math.min(requestedCredit, maxCreditAllowed))
    : 0;
  const total = subtotal - discountAmount - creditApplied + shippingCost;

  const applyDiscount = async () => {
    const code = discountInput.trim().toUpperCase();
    if (!code) return;
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({} as any));
        if (errData?.message === "already_used_by_user") {
          setDiscountError(language === "ar" ? "لقد استخدمتِ هذا الكود من قبل" : "You've already used this code");
        } else {
          setDiscountError(language === "ar" ? "كود غير صالح أو منتهي الصلاحية" : "Invalid or expired code");
        }
        setDiscountLoading(false);
        return;
      }
      const data = await res.json();
      setAppliedDiscount({ code: data.code, discountPercent: data.discountPercent, categoryIds: data.categoryIds ?? null, subcategoryIds: data.subcategoryIds ?? null });
      setDiscountError("");
      toast({ title: language === "ar" ? `تم تطبيق خصم ${data.discountPercent}%` : `${data.discountPercent}% discount applied` });
    } catch {
      setDiscountError(language === "ar" ? "حدث خطأ" : "Something went wrong");
    }
    setDiscountLoading(false);
  };

  // Auto-validate discount code as user types (debounced 800ms)
  useEffect(() => {
    const code = discountInput.trim();
    if (!code) {
      setDiscountError("");
      return;
    }
    if (appliedDiscount?.code === code.toUpperCase()) return;
    const timer = setTimeout(() => {
      applyDiscount();
    }, 800);
    return () => clearTimeout(timer);
  }, [discountInput]);

  // When maxCreditAllowed shrinks (e.g. after a discount code is applied),
  // automatically clamp the credit input so it never exceeds the new limit.
  useEffect(() => {
    if (!useCreditEnabled) return;
    const current = Number(creditInput) || 0;
    if (current > maxCreditAllowed) {
      setCreditInput(maxCreditAllowed > 0 ? maxCreditAllowed.toFixed(2) : "");
    }
  }, [maxCreditAllowed]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col pt-navbar">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  if (cartLoading) {
    return (
      <div className="min-h-screen flex flex-col pt-navbar">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (items.length === 0 && soldOutItems.length > 0) {
    const ar = language === "ar";
    return (
      <div className="min-h-screen flex flex-col pt-navbar">
        <Navbar />
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-lg mx-auto">
            <div className="rounded-3xl border border-red-200/80 dark:border-red-800/60 bg-gradient-to-b from-red-50/80 to-background dark:from-red-950/30 dark:to-background p-6 sm:p-8 text-center shadow-sm" data-testid="sold-out-notice">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center rotate-3">
                <svg className="w-7 h-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-1.5">{ar ? "عذراً، هذه القطع نفدت" : "Sorry, these pieces sold out"}</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                {ar ? "يبدو أنها كانت مطلوبة جداً! أزلناها من سلتك — اضغطي على صورة أي قطعة لعرض المنتج." : "Looks like they were in high demand! We've removed them from your cart — tap any photo to view the product."}
              </p>
              <ul className="space-y-2.5 mb-6 text-start">
                {soldOutItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-3.5 bg-card rounded-2xl p-3 shadow-sm border border-border/60">
                    <Link href={`/product/${item.productId}`} className="shrink-0 relative">
                      {item.image ? (
                        <img
                          src={optimizeCloudinaryUrl(item.image, 160) || item.image}
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded-xl opacity-80"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-muted" />
                      )}
                      <span className="absolute inset-x-0 bottom-0 text-[9px] leading-tight font-bold text-white bg-black/70 rounded-b-xl py-0.5 text-center uppercase tracking-wide">
                        {ar ? "نفدت" : "Sold out"}
                      </span>
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground/80 truncate">{item.name}</p>
                      {(item.color || item.size) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.color ? translateColorName(item.color, language === "ar" ? "ar" : "en") : ""}
                          {item.color && item.size ? " · " : ""}
                          {item.size || ""}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/product/${item.productId}`}
                      className="shrink-0 text-xs font-semibold text-foreground border border-border hover:bg-muted rounded-full px-3 py-1.5 transition-colors"
                    >
                      {ar ? "عرض" : "View"}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                <Button
                  onClick={() => { setSoldOutItems([]); setLocation("/shop"); }}
                  className="rounded-xl h-11 px-6"
                  data-testid="button-continue-shopping"
                >
                  {ar ? "اكتشفي قطعاً جديدة" : "Discover new pieces"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setSoldOutItems([]); setLocation("/"); }}
                  className="rounded-xl h-11 px-6"
                >
                  {ar ? "الصفحة الرئيسية" : "Back to home"}
                </Button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (items.length === 0) return null;


  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError("");
  };

  const regionLabels: Record<string, { name: string; price: string }> = {};
  shippingZones.forEach(z => {
    regionLabels[z.id] = {
      name: language === "ar" ? z.nameAr : z.nameEn,
      price: `₪${z.price}`,
    };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build full international phone numbers early (used for profile save + order)
    const phoneDigits = formData.phone.replace(/\D/g, "");
    const phone2Digits = formData.phone2.replace(/\D/g, "");
    const fullPhone = `${phonePrefix}${phoneDigits}`;
    const fullPhone2 = formData.phone2 ? `${phone2Prefix}${phone2Digits}` : "";

    /* Always persist info for faster future checkout, keyed by userId so different
       accounts on the same browser never overwrite each other's saved details. */
    localStorage.setItem(savedInfoKey(user.id), JSON.stringify({ ...formData, shippingRegion, phonePrefix, phone2Prefix }));
    // Also save to user account so it shows in Profile → Account Settings
    if (user) {
      try {
        await fetch("/api/auth/profile", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: formData.fullName,
            phone: fullPhone,
            address: formData.address,
            shippingRegion: shippingRegion || null,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } catch {
        /* non-blocking — order should still go through */
      }
    }

    if (!shippingRegion) {
      toast({ title: t.checkout.regionRequired, variant: "destructive" });
      shippingRegionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (phoneDigits.length !== 9) {
      setPhoneValidationError(true);
      setPhoneShakeKey((value) => value + 1);
      toast({
        title: language === "ar" ? "رقم الهاتف غير صحيح" : "Invalid phone number",
        description: language === "ar"
          ? "يجب أن يتكوّن رقم الهاتف من 9 أرقام، مثل: +97059xxxxxxx"
          : "The phone number must contain exactly 9 digits, like: +97059xxxxxxx",
        variant: "destructive",
      });
      phoneInputRef.current?.focus();
      return;
    }

    if (formData.phone2.length > 0 && phone2Digits.length !== 9) {
      setPhone2ValidationError(true);
      setPhone2ShakeKey((value) => value + 1);
      toast({
        title: language === "ar" ? "الرقم الإضافي غير صحيح" : "Invalid additional phone",
        description: language === "ar"
          ? "يجب أن يتكوّن الرقم الإضافي من 9 أرقام أو اتركه فارغاً"
          : "The additional phone must contain exactly 9 digits or be left empty",
        variant: "destructive",
      });
      phone2InputRef.current?.focus();
      return;
    }

    const orderItems = items.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      price: (item.product.discountPrice || item.product.price).toString(),
      size: item.size || null,
      color: item.color || null,
    }));

    if (paymentMethod === "card") {
      setStripeLoading(true);
      try {
        const res = await fetch("/api/lahza/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            order: {
              fullName: formData.fullName,
              phone: fullPhone,
              phone2: fullPhone2 || null,
              address: formData.address,
              city: formData.city,
              notes: formData.notes,
              shippingRegion,
              shippingCost: shippingCost.toString(),
              discountCode: appliedDiscount?.code || null,
            },
            items: orderItems,
            useCredit: creditApplied,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          if (data.code === "OUT_OF_STOCK" && data.outOfStock?.length > 0) {
            const trulySoldOut = data.outOfStock.filter((oos: any) => oos.reason === "sold_out" || !oos.available || oos.available <= 0);
            const insufficientStock = data.outOfStock.filter((oos: any) => oos.reason === "insufficient_stock" && oos.available > 0);
            if (trulySoldOut.length > 0) {
              setSoldOutItems(attachSoldOutImages(trulySoldOut, items));
              for (const oos of trulySoldOut) {
                removeFromCart(oos.productId, oos.size || undefined, oos.color || undefined);
              }
              const arSO = language === "ar";
              toast({
                title: arSO ? "منتجات نفدت من المخزون" : "Items sold out",
                description: trulySoldOut.map((oos: any) =>
                  arSO
                    ? `${oos.name}${oos.size ? ` (${oos.size})` : ""} — تمت إزالته من السلة`
                    : `${oos.name}${oos.size ? ` (${oos.size})` : ""} — removed from your cart`
                ).join("\n"),
                variant: "destructive",
              });
            }
            for (const oos of insufficientStock) {
              updateQuantity(oos.productId, oos.available, oos.size || undefined, oos.color || undefined);
            }
            if (insufficientStock.length > 0) {
              const ar = language === "ar";
              toast({
                title: ar ? "تم تعديل الكمية" : "Quantity adjusted",
                description: insufficientStock.map((oos: any) =>
                  ar
                    ? `${oos.name} — ${oos.size || ""}: متوفر ${oos.available} فقط`
                    : `${oos.name} — ${oos.size || ""}: only ${oos.available} available`
                ).join("\n"),
              });
            }
            setStripeLoading(false);
            scrollToSoldOutBanner();
            return;
          }
          throw new Error(data.message || "Failed to create checkout session");
        }
        const { url } = await res.json();
        if (url) {
          window.location.href = url;
        }
      } catch (err: any) {
        if (err.message === "already_used_by_user") {
          toast({
            title: language === "ar" ? "لا يمكن استخدام الكود" : "Code can't be used",
            description: language === "ar" ? "لقد استخدمتِ هذا الكود من قبل" : "You've already used this code",
            variant: "destructive",
          });
          setStripeLoading(false);
          return;
        }
        toast({ title: t.checkout.checkoutFailed, description: err.message, variant: "destructive" });
        setStripeLoading(false);
      }
      setStripeLoading(false);
      return;
    }

    try {
      const order = await createOrder.mutateAsync({
        order: {
          fullName: formData.fullName,
          phone: fullPhone,
          phone2: fullPhone2 || null,
          address: formData.address,
          city: formData.city,
          notes: formData.notes,
          status: "Pending",
          paymentMethod: "Cash on delivery",
          shippingRegion,
          shippingCost: shippingCost.toString(),
          discountCode: appliedDiscount?.code || null,
        },
        items: orderItems,
        useCredit: creditApplied,
      });

      clearCart();
      setSoldOutItems([]);
      setLocation(`/order-confirmation/${order.id}`);
    } catch (err: any) {
      if (err.code === "OUT_OF_STOCK" && err.outOfStock?.length > 0) {
        const trulySoldOut = err.outOfStock.filter((oos: any) => oos.reason === "sold_out" || !oos.available || oos.available <= 0);
        const insufficientStock = err.outOfStock.filter((oos: any) => oos.reason === "insufficient_stock" && oos.available > 0);
        if (trulySoldOut.length > 0) {
          setSoldOutItems(attachSoldOutImages(trulySoldOut, items));
          for (const oos of trulySoldOut) {
            removeFromCart(oos.productId, oos.size || undefined, oos.color || undefined);
          }
          const arSO = language === "ar";
          toast({
            title: arSO ? "منتجات نفدت من المخزون" : "Items sold out",
            description: trulySoldOut.map((oos: any) =>
              arSO
                ? `${oos.name}${oos.size ? ` (${oos.size})` : ""} — تمت إزالته من السلة`
                : `${oos.name}${oos.size ? ` (${oos.size})` : ""} — removed from your cart`
            ).join("\n"),
            variant: "destructive",
          });
        }
        for (const oos of insufficientStock) {
          updateQuantity(oos.productId, oos.available, oos.size || undefined, oos.color || undefined);
        }
        if (insufficientStock.length > 0) {
          const ar = language === "ar";
          toast({
            title: ar ? "تم تعديل الكمية" : "Quantity adjusted",
            description: insufficientStock.map((oos: any) =>
              ar
                ? `${oos.name} — ${oos.size || ""}: متوفر ${oos.available} فقط`
                : `${oos.name} — ${oos.size || ""}: only ${oos.available} available`
            ).join("\n"),
          });
        }
        scrollToSoldOutBanner();
        return;
      }
      if (err.message === "already_used_by_user") {
        toast({
          title: language === "ar" ? "لا يمكن استخدام الكود" : "Code can't be used",
          description: language === "ar" ? "لقد استخدمتِ هذا الكود من قبل" : "You've already used this code",
          variant: "destructive",
        });
        return;
      }
      toast({ title: t.checkout.checkoutFailed, description: err.message, variant: "destructive" });
    }
  };

  const isPending = createOrder.isPending || stripeLoading;

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-5xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl mb-8 sm:mb-12" data-testid="text-checkout-title">{t.checkout.title}</h1>

        {soldOutItems.length > 0 && items.length > 0 && (
          <div
            ref={soldOutBannerRef}
            className="relative rounded-2xl border border-red-200/80 dark:border-red-800/60 bg-gradient-to-b from-red-50/80 to-background dark:from-red-950/30 dark:to-background p-5 mb-8 shadow-sm scroll-mt-28"
            data-testid="partial-sold-out-notice"
          >
            <button
              onClick={() => setSoldOutItems([])}
              className="absolute top-3 end-3 w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={language === "ar" ? "إغلاق" : "Dismiss"}
              data-testid="button-dismiss-sold-out"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3 mb-4 pe-8">
              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/50 shrink-0 rotate-3">
                <svg className="w-4.5 h-4.5 text-red-600 dark:text-red-400" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                </svg>
              </span>
              <div>
                <p className="font-bold text-sm text-foreground">
                  {language === "ar" ? "بعض القطع نفدت للتو" : "A few pieces just sold out"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {language === "ar" ? "أزلناها من سلتك — وباقي طلبك جاهز للإتمام." : "We removed them from your cart — the rest of your order is ready to go."}
                </p>
              </div>
            </div>
            <ul className="space-y-2.5">
              {soldOutItems.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3.5 bg-card rounded-2xl p-3 shadow-sm border border-border/60"
                >
                  <Link href={`/product/${item.productId}`} className="shrink-0 relative">
                    {item.image ? (
                      <img
                        src={optimizeCloudinaryUrl(item.image, 160) || item.image}
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded-xl opacity-80"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-muted" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 text-[9px] leading-tight font-bold text-white bg-black/70 rounded-b-xl py-0.5 text-center uppercase tracking-wide">
                      {language === "ar" ? "نفدت" : "Sold out"}
                    </span>
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground/80 truncate">
                      {item.name}
                    </p>
                    {(item.color || item.size) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.color ? translateColorName(item.color, language === "ar" ? "ar" : "en") : ""}
                        {item.color && item.size ? " · " : ""}
                        {item.size || ""}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/product/${item.productId}`}
                    className="shrink-0 text-xs font-semibold text-foreground border border-border hover:bg-muted rounded-full px-3 py-1.5 transition-colors"
                  >
                    {language === "ar" ? "عرض" : "View"}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-16">
          <div>
            <div ref={shippingRegionRef} className="flex items-baseline justify-between mb-4">
              <h2 className="text-xl font-semibold uppercase tracking-widest">{t.checkout.shippingRegion}</h2>
              {!shippingRegion && (
                <span className="text-xs text-primary font-semibold animate-pulse">
                  {language === "ar" ? "← اختاري منطقتك" : "← Choose your region"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              {shippingZones.map((zone) => {
                const selected = shippingRegion === zone.id;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setShippingRegion(zone.id)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-sm transition-all duration-200 ${
                      selected
                        ? "border-foreground bg-foreground text-background shadow-md scale-[1.03]"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/50 hover:scale-[1.01]"
                    } ${!shippingRegion ? "animate-shake-hint" : ""}`}
                    data-testid={`button-region-${zone.id}`}
                  >
                    {selected && (
                      <span className="absolute top-2 end-2 w-4 h-4 rounded-full bg-background flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-foreground" />
                      </span>
                    )}
                    <MapPin className={`w-5 h-5 shrink-0 ${selected ? "text-background" : "text-primary"}`} />
                    <span className="font-semibold text-center leading-tight">{language === "ar" ? zone.nameAr : zone.nameEn}</span>
                    <span className={`text-xs font-bold ${selected ? "text-background/80" : "text-primary"}`}>₪{zone.price}</span>
                  </button>
                );
              })}
            </div>

            <h2 className="text-xl font-semibold mb-6 uppercase tracking-widest">{t.checkout.deliveryDetails}</h2>

            {/* Auto-filled banner — shown only to returning customers whose data was pre-loaded */}
            {autoFilled && (
              <div className="flex items-center gap-3 bg-primary/8 border border-primary/25 rounded-xl px-4 py-3 mb-2 animate-in fade-in slide-in-from-top-2 duration-500">
                <span className="text-xl">✨</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary">
                    {language === "ar" ? "ملأنا بياناتك تلقائياً!" : "We filled in your info!"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {language === "ar"
                      ? "تحققي من البيانات وعدّليها إذا لزم الأمر"
                      : "Review your details and edit if needed"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoFilled(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form id="checkout-form" onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-1">{t.checkout.fullName}<span className="text-red-500 text-base leading-none">*</span></Label>
                <Input id="fullName" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="rounded-md border-border focus-visible:ring-primary" data-testid="input-checkout-name" />
              </div>
              <div className="space-y-2">
                {whatsappNotificationsEnabled && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5" data-testid="text-whatsapp-confirmation-notice">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    {language === "ar"
                      ? "ستصلك رسالة عبر الواتس اب الخاص بك لتاكيد الرقم والطلب على هذا الرقم"
                      : "You'll receive a WhatsApp message to this number to confirm your number and order"}
                  </p>
                )}
                <Label htmlFor="phone" className="flex items-center gap-1">{t.checkout.phone}<span className="text-red-500 text-base leading-none">*</span></Label>
                <div
                  key={`phone-${phoneShakeKey}`}
                  className={`flex gap-0 rounded-md border focus-within:ring-2 focus-within:ring-ring ${
                    phoneValidationError
                      ? "border-red-500 focus-within:ring-red-500 animate-[shake-hint_0.45s_ease-in-out_1]"
                      : "border-border"
                  }`}
                  dir="ltr"
                >
                  <PhoneCountrySelect
                    value={phonePrefix}
                    onChange={setPhonePrefix}
                    height="h-10"
                    testId="select-checkout-phone-prefix"
                  />
                  <input
                    ref={phoneInputRef}
                    id="phone"
                    required
                    inputMode="numeric"
                    value={formData.phone}
                    onInvalid={() => {
                      setPhoneValidationError(true);
                      setPhoneShakeKey((value) => value + 1);
                    }}
                    onBlur={e => {
                      const digits = normalizeArabicDigits(e.target.value).replace(/\D/g, "");
                      const isInvalid = digits.length !== 9;
                      setPhoneValidationError(isInvalid);
                      if (isInvalid) setPhoneShakeKey((value) => value + 1);
                    }}
                    onChange={e => {
                      let digits = normalizeArabicDigits(e.target.value).replace(/\D/g, "");
                      const stripped = stripAutofillCountryCode(digits);
                      digits = stripped.digits;
                      if (digits.startsWith("0")) digits = digits.slice(1);
                      if (stripped.prefix) setPhonePrefix(stripped.prefix);
                      const limitedDigits = digits.slice(0, 9);
                      setPhoneValidationError(false);
                      setFormData({...formData, phone: limitedDigits});
                    }}
                    placeholder="59xxxxxxx"
                    className="flex-1 h-10 bg-background px-3 text-sm focus:outline-none rounded-e-md"
                    aria-invalid={phoneValidationError}
                    data-testid="input-checkout-phone"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {language === "ar" ? "مثال: " : "Example: "}
                  <bdi dir="ltr" className="inline-block">{phonePrefix}59xxxxxxx</bdi>
                </p>
                {phoneValidationError && (
                  <p className="text-xs text-red-600 dark:text-red-400" role="alert" data-testid="text-checkout-phone-error">
                    {language === "ar" ? "يجب إدخال 9 أرقام تماماً مثل " : "Enter exactly 9 digits like "}
                    <bdi dir="ltr" className="inline-block">{phonePrefix}59xxxxxxx</bdi>
                  </p>
                )}
                {formData.phone.length === 9 && !formData.phone.startsWith("5") && (
                  <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="text-checkout-phone-warning">
                    {language === "ar"
                      ? "تنبيه: الرقم لا يبدأ بـ 5. يرجى إعادة التحقق منه، ويمكنك المتابعة."
                      : "Warning: This number does not start with 5. Please recheck it; you can still continue."}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone2">
                  {language === "ar" ? "رقم هاتف إضافي (اختياري)" : "Additional Phone (optional)"}
                </Label>
                <div
                  key={`phone2-${phone2ShakeKey}`}
                  className={`flex gap-0 rounded-md border focus-within:ring-2 focus-within:ring-ring ${
                    phone2ValidationError
                      ? "border-red-500 focus-within:ring-red-500 animate-[shake-hint_0.45s_ease-in-out_1]"
                      : "border-border"
                  }`}
                  dir="ltr"
                >
                  <PhoneCountrySelect
                    value={phone2Prefix}
                    onChange={setPhone2Prefix}
                    height="h-10"
                    testId="select-checkout-phone2-prefix"
                  />
                  <input
                    ref={phone2InputRef}
                    id="phone2"
                    inputMode="numeric"
                    value={formData.phone2}
                    onBlur={e => {
                      const digits = normalizeArabicDigits(e.target.value).replace(/\D/g, "");
                      const isInvalid = digits.length > 0 && digits.length !== 9;
                      setPhone2ValidationError(isInvalid);
                      if (isInvalid) setPhone2ShakeKey((value) => value + 1);
                    }}
                    onChange={e => {
                      let digits = normalizeArabicDigits(e.target.value).replace(/\D/g, "");
                      const stripped = stripAutofillCountryCode(digits);
                      digits = stripped.digits;
                      if (digits.startsWith("0")) digits = digits.slice(1);
                      if (stripped.prefix) setPhone2Prefix(stripped.prefix);
                      const limitedDigits = digits.slice(0, 9);
                      setPhone2ValidationError(false);
                      setFormData({...formData, phone2: limitedDigits});
                    }}
                    placeholder={language === "ar" ? "اتركه فارغاً إن لم يكن لديك رقم ثانٍ" : "Leave empty if not needed"}
                    className="flex-1 h-10 bg-background px-3 text-sm focus:outline-none rounded-e-md"
                    aria-invalid={phone2ValidationError}
                    data-testid="input-checkout-phone2"
                  />
                </div>
                {phone2ValidationError && (
                  <p className="text-xs text-red-600 dark:text-red-400" role="alert" data-testid="text-checkout-phone2-error">
                    {language === "ar"
                      ? "أدخل 9 أرقام تماماً أو اترك الرقم الإضافي فارغاً."
                      : "Enter exactly 9 digits or leave the additional phone empty."}
                  </p>
                )}
                {formData.phone2.length === 9 && !formData.phone2.startsWith("5") && (
                  <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="text-checkout-phone2-warning">
                    {language === "ar"
                      ? "تنبيه: الرقم الإضافي لا يبدأ بـ 5. يرجى إعادة التحقق منه، ويمكنك المتابعة."
                      : "Warning: This additional number does not start with 5. Please recheck it; you can still continue."}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="city" className="flex items-center gap-1">{t.checkout.city}<span className="text-red-500 text-base leading-none">*</span></Label>
                <Input id="city" required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="rounded-md border-border focus-visible:ring-primary" data-testid="input-checkout-city" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center gap-1">{t.checkout.address}<span className="text-red-500 text-base leading-none">*</span></Label>
                <Input id="address" required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="rounded-md border-border focus-visible:ring-primary" data-testid="input-checkout-address" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t.checkout.notes}</Label>
                <Textarea id="notes" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="rounded-md border-border focus-visible:ring-primary resize-none" rows={4} data-testid="textarea-checkout-notes" />
              </div>

              {/* Auto-save notice — always on, no toggle needed */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground border border-dashed border-border rounded-lg px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span>
                  {language === "ar"
                    ? "ستُحفظ بياناتك تلقائياً لتسريع طلبك القادم"
                    : "Your info will be saved automatically to speed up your next order"}
                </span>
              </div>
            </form>
          </div>

          <div>
            <div className="bg-secondary p-6 sm:p-8 sticky top-28">
              <h2 className="text-xl font-semibold mb-6 uppercase tracking-widest border-b border-border pb-4">{t.checkout.yourOrder}</h2>

              <div className="space-y-4 mb-6 max-h-64 overflow-y-auto pt-3 pe-2">
                {items.map((item, idx) => {
                  const price = parseFloat(item.product.discountPrice?.toString() || item.product.price.toString());
                  return (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-[4.5rem] bg-muted relative shrink-0 rounded-xl">
                          <CheckoutItemImage
                            src={getItemImage(item)}
                            alt={item.product.name}
                            testId={`button-checkout-photo-${idx}`}
                            onClick={() => {
                              const cv = (item.product.colorVariants as ColorVariant[] | undefined) || [];
                              let imgs: string[] = [];
                              if (cv.length > 0 && item.color) {
                                const v = cv.find((cv2) => cv2.name === item.color);
                                if (v) imgs = [v.mainImage, ...(v.images || [])].filter(Boolean) as string[];
                              }
                              if (imgs.length === 0) {
                                imgs = [item.product.mainImage, ...((item.product.images as string[] | undefined) || [])].filter(Boolean);
                              }
                              if (imgs.length === 0) imgs = [getItemImage(item)];
                              setPhotoPreview({ images: imgs, name: item.product.name, idx: 0 });
                            }}
                          />
                          <span
                            className="absolute -top-2 -end-2 bg-primary text-primary-foreground text-[11px] font-bold min-w-[20px] h-5 px-1 flex justify-center items-center rounded-full ring-2 ring-secondary shadow-sm pointer-events-none z-10"
                            data-testid={`badge-checkout-qty-${idx}`}
                          >
                            {item.quantity}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{item.product.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {item.size} {item.color ? translateColorName(item.color, language === "ar" ? "ar" : "en") : ""}
                            <span className="ms-1.5 text-foreground/60">× {item.quantity}</span>
                          </p>
                        </div>
                      </div>
                      <span className="font-medium ltr-num">₪{(price * item.quantity).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border pt-4 mb-6 space-y-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t.checkout.subtotal}</span>
                  <span className="ltr-num">₪{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    {t.checkout.shipping}
                    {shippingRegion && <span className="text-xs">({regionLabels[shippingRegion]?.name})</span>}
                  </span>
                  <span className={`ltr-num ${shippingRegion ? "font-medium text-foreground" : ""}`}>
                    {shippingRegion ? `₪${shippingCost.toFixed(2)}` : t.checkout.selectRegion}
                  </span>
                </div>

                {appliedDiscount ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-green-600 dark:text-green-400">
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        <span className="font-medium">{appliedDiscount.code} (-{appliedDiscount.discountPercent}%)</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium ltr-num">-₪{discountAmount.toFixed(2)}</span>
                        <button onClick={removeDiscount} className="text-muted-foreground hover:text-destructive" data-testid="button-remove-discount">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {isRestrictedDiscount && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="text-discount-restriction-notice">
                        <Tag className="w-3 h-3 shrink-0" />
                        {language === "ar"
                          ? `هذا الكود يُطبَّق على المنتجات المحددة فقط (خصم على ₪${discountableSubtotal.toFixed(2)} من أصل ₪${subtotal.toFixed(2)})`
                          : `This code applies to eligible items only (discount on ₪${discountableSubtotal.toFixed(2)} of ₪${subtotal.toFixed(2)})`}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="pt-1" data-testid="discount-code-section">
                    <div className="relative">
                      <Tag className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        value={discountInput}
                        onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(""); }}
                        placeholder={language === "ar" ? "أدخلي كود الخصم..." : "Enter discount code..."}
                        className="rounded-md h-10 text-xs uppercase ps-9 pe-10 tracking-widest placeholder:normal-case placeholder:tracking-normal"
                        onKeyDown={e => e.key === "Enter" && (e.preventDefault(), applyDiscount())}
                        data-testid="input-discount-code"
                      />
                      <button
                        type="button"
                        onClick={applyDiscount}
                        disabled={discountLoading || !discountInput.trim()}
                        className="absolute end-0 top-0 h-full px-3 text-foreground hover:text-foreground/70 transition-colors"
                        data-testid="button-apply-discount"
                      >
                        {discountLoading
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <ArrowRight className={`w-4 h-4 animate-shake-hint stroke-[2.5] ${language === "ar" ? "rotate-180" : ""}`} />
                        }
                      </button>
                    </div>
                    {discountError && (
                      <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1" data-testid="text-discount-error">
                        <X className="w-3 h-3 shrink-0" />{discountError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {loyaltyPointsEnabled && user && (
                <div className="border-t border-border pt-4 mb-4" data-testid="section-loyalty-credit">
                  <div className={`relative rounded-2xl overflow-hidden border border-amber-200/70 dark:border-amber-800/70 shadow-sm transition-all ${creditCardExpanded ? "bg-white dark:bg-gray-900/40" : ""}`}>
                    {creditCardExpanded && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreditCardExpanded(false);
                          setUseCreditEnabled(false);
                          setCreditInput("");
                        }}
                        className="absolute top-2 end-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-amber-700/70 hover:text-amber-900 hover:bg-amber-100/60 dark:text-amber-300/70 dark:hover:text-amber-100 dark:hover:bg-amber-950/40 transition-colors"
                        aria-label={language === "ar" ? "إغلاق" : "Close"}
                        data-testid="button-close-credit-card"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (creditCardExpanded) {
                          setCreditCardExpanded(false);
                          setUseCreditEnabled(false);
                          setCreditInput("");
                          return;
                        }
                        setCreditCardExpanded(true);
                        if (availableCredit > 0) {
                          setUseCreditEnabled(true);
                          if (!creditInput) setCreditInput(maxCreditAllowed.toFixed(2));
                        }
                      }}
                      className="group relative w-full hover:shadow-md transition-all bg-gradient-to-r from-amber-50 via-rose-50 to-pink-50 dark:from-amber-950/30 dark:via-rose-950/25 dark:to-pink-950/20 px-4 py-3 flex items-center gap-3 text-start"
                      data-testid="button-toggle-credit-card"
                      aria-expanded={creditCardExpanded}
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-rose-500 to-pink-600 flex items-center justify-center shadow-md ring-2 ring-white/60 dark:ring-black/20 group-hover:scale-105 transition-transform">
                          <Wallet className="w-4.5 h-4.5 text-white" strokeWidth={2.2} />
                        </div>
                        {(loyalty?.points ?? 0) > 0 && (
                          <span className="absolute -top-1 -end-1 min-w-[18px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
                            {(loyalty?.points ?? 0) > 999 ? "999+" : (loyalty?.points ?? 0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-amber-700/70 dark:text-amber-300/60 font-bold leading-none mb-1">
                          {language === "ar" ? "رصيد حسابك" : "Your account credit"}
                        </p>
                        <p className="text-base font-bold text-amber-900 dark:text-amber-100 leading-none tracking-tight">
                          <span className="ltr-num">₪{availableCredit.toFixed(2)}</span>
                        </p>
                        {availableCredit > 0 && (
                          <p className="text-[10px] font-medium text-amber-700/70 dark:text-amber-300/70 mt-1 leading-none">
                            {language === "ar" ? "اضغطي للاستخدام" : "Click to use it"}
                          </p>
                        )}
                      </div>
                      {availableCredit > 0 ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-sm group-hover:shadow-md transition-all shrink-0">
                          {language === "ar" ? "استخدمي" : "Apply"}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700/70 dark:text-amber-300/70 shrink-0">
                          {language === "ar" ? "التفاصيل" : "Details"}
                        </span>
                      )}
                    </button>

                    {creditCardExpanded && (availableCredit > 0 ? (
                      <>
                        {/* Toggle row with custom switch */}
                        <label className="relative flex items-center gap-3 cursor-pointer px-4 py-3.5 hover:bg-amber-50/40 dark:hover:bg-amber-950/15 transition-colors">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={useCreditEnabled}
                            onClick={() => {
                              const next = !useCreditEnabled;
                              setUseCreditEnabled(next);
                              if (next && !creditInput) setCreditInput(maxCreditAllowed.toFixed(2));
                            }}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                              useCreditEnabled ? "bg-gradient-to-r from-rose-500 to-pink-600" : "bg-muted-foreground/25"
                            }`}
                            data-testid="checkbox-use-credit"
                          >
                            <span className={`absolute top-[2px] start-[2px] w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                              useCreditEnabled ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0"
                            }`} />
                          </button>
                          <span className="flex-1 text-sm font-semibold text-foreground">
                            {language === "ar" ? "استخدمي رصيدي في هذا الطلب" : "Apply my credit to this order"}
                          </span>
                          {maxCreditAllowed < availableCredit && !useCreditEnabled && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium px-2 py-0.5 rounded-full bg-amber-100/70 dark:bg-amber-950/40">
                              {language === "ar" ? <>حتى <span className="ltr-num">₪{maxCreditAllowed.toFixed(2)}</span></> : <><span className="ltr-num">up to ₪{maxCreditAllowed.toFixed(2)}</span></>}
                            </span>
                          )}
                        </label>

                        {useCreditEnabled && (
                          <div className="relative px-4 py-4 bg-gradient-to-b from-amber-50/30 to-transparent dark:from-amber-950/15 border-t border-dashed border-amber-200/60 dark:border-amber-800/50 space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-foreground/80">
                                {language === "ar" ? "المبلغ المراد استخدامه" : "Amount to use"}
                              </label>
                              <button
                                type="button"
                                onClick={() => setCreditInput(maxCreditAllowed.toFixed(2))}
                                className="text-[10px] text-rose-600 hover:text-rose-700 font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 transition-colors hover:bg-rose-100 dark:hover:bg-rose-950/60"
                                data-testid="button-credit-max"
                              >
                                {language === "ar" ? <>الحد الأقصى <span className="ltr-num">₪{maxCreditAllowed.toFixed(2)}</span></> : <><span className="ltr-num">Max ₪{maxCreditAllowed.toFixed(2)}</span></>}
                              </button>
                            </div>
                            <div className="relative">
                              <Input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                max={maxCreditAllowed}
                                step="0.01"
                                value={creditInput}
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw === "") { setCreditInput(""); return; }
                                  const n = Number(raw);
                                  if (!Number.isFinite(n) || n < 0) return;
                                  if (n > maxCreditAllowed) {
                                    setCreditInput(maxCreditAllowed.toFixed(2));
                                  } else {
                                    setCreditInput(raw);
                                  }
                                }}
                                placeholder="0.00"
                                className="rounded-lg h-12 ps-4 pe-12 text-base font-semibold tracking-tight bg-white dark:bg-gray-900 border-amber-200 dark:border-amber-800/60 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-950/40"
                                data-testid="input-credit-amount"
                              />
                              <span className="absolute end-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground pointer-events-none">₪</span>
                            </div>
                            {creditApplied > 0 && (
                              <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 text-white px-3.5 py-2.5 flex items-center justify-between shadow-sm">
                                <span className="text-[11px] uppercase tracking-widest font-bold opacity-90">
                                  {language === "ar" ? "سيُخصم من الإجمالي" : "Deducted from total"}
                                </span>
                                <span className="text-base font-bold tracking-tight ltr-num" data-testid="text-credit-applied">
                                  −₪{creditApplied.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="relative px-4 py-3 flex items-start gap-2.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                          {language === "ar"
                            ? "اجمعي النقاط مع كل طلب وحوّليها إلى رصيد من صفحة حسابي."
                            : "Earn points with every order and convert them to credit from your profile."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-4 mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-widest mb-3">{t.checkout.paymentMethod}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cod")}
                    className={`flex items-center justify-center gap-2 p-3.5 border-2 rounded-md text-sm font-semibold transition-all ${
                      paymentMethod === "cod"
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-accent/40"
                    }`}
                    data-testid="button-payment-cod"
                  >
                    <Banknote className="w-4 h-4 shrink-0" />
                    <span>{t.checkout.cod}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!cardPaymentEnabled}
                    onClick={() => cardPaymentEnabled && setPaymentMethod("card")}
                    className={`relative flex flex-col items-center justify-center gap-1 p-3.5 border-2 rounded-md text-sm font-semibold transition-all ${
                      !cardPaymentEnabled
                        ? "border-border/40 bg-muted/30 text-muted-foreground/40 cursor-not-allowed"
                        : paymentMethod === "card"
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-accent/40"
                    }`}
                    data-testid="button-payment-card"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span>{t.checkout.card}</span>
                    </div>
                    {!cardPaymentEnabled && (
                      <span className="text-[10px] font-medium text-muted-foreground/50 leading-none">
                        {language === "ar" ? "غير متاح حالياً" : "Unavailable"}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="border-t border-border pt-4 mb-4 flex justify-between items-center text-xl font-semibold">
                <span>{t.checkout.total}</span>
                <span data-testid="text-checkout-total" className="ltr-num">₪{total.toFixed(2)}</span>
              </div>

              {loyaltyPointsEnabled && (() => {
                const productsForPoints = Math.max(0, subtotal - discountAmount - creditApplied);
                const pointsToEarn = Math.floor(productsForPoints / 2);
                if (pointsToEarn <= 0) return null;
                return (
                  <div
                    className="mb-4 relative overflow-hidden rounded-xl p-3.5 bg-gradient-to-r from-amber-500 via-rose-500 to-pink-600 text-white shadow-md"
                    data-testid="text-checkout-points-preview"
                  >
                    <div className="absolute -top-6 -end-6 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                    <div className="relative flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                        <Gift className="w-4 h-4" />
                      </div>
                      <div className="flex-1 leading-snug">
                        <p className="text-sm font-bold">
                          {language === "ar"
                            ? `ستحصلين على ${pointsToEarn} نقطة إضافية عند تسليم طلبك!`
                            : `You'll earn ${pointsToEarn} extra points when your order is delivered!`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Delivery promise */}
              <div className="mb-4 flex items-center gap-3 p-3 border border-green-500/25 bg-green-500/5 rounded-md" data-testid="banner-delivery-checkout">
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Truck className="w-4 h-4 text-green-600" strokeWidth={1.5} />
                  </div>
                  <span className="absolute -top-0.5 -end-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-green-700 dark:text-green-500 uppercase tracking-wider">
                    {language === "ar" ? "التوصيل خلال يومين من أيام العمل" : "Delivery within 2 business days"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {language === "ar" ? "يصلك طلبك سريعاً إلى باب منزلك" : "Your order arrives straight to your door"}
                  </p>
                </div>
                <div className="flex-shrink-0 flex flex-col items-center">
                  <span className="text-2xl font-black text-green-500/30 leading-none select-none">2</span>
                  <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider">
                    {language === "ar" ? "يوم" : "days"}
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                form="checkout-form"
                disabled={isPending}
                className="w-full rounded-md py-6 uppercase tracking-widest text-sm font-semibold"
                data-testid="button-place-order"
              >
                {isPending
                  ? t.checkout.processing
                  : paymentMethod === "card"
                    ? t.checkout.payWithCard
                    : t.checkout.placeOrder}
              </Button>
            </div>
          </div>
        </div>
        </div>
      </main>
      <Footer />

      {/* ── Photo quick-preview lightbox ───────────────────────────── */}
      {photoPreview && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center"
          onClick={() => setPhotoPreview(null)}
          data-testid="photo-lightbox-checkout"
        >
          <div className="absolute top-4 inset-x-0 flex items-center justify-between px-5 z-10">
            <span className="text-white/70 text-sm font-medium max-w-[60%] truncate">
              {photoPreview.name}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-white/50 text-sm">
                {photoPreview.idx + 1} / {photoPreview.images.length}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setPhotoPreview(null); }}
                className="text-white/70 hover:text-white p-1"
                data-testid="button-checkout-lightbox-close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="relative flex items-center justify-center w-full h-full px-16">
            {photoPreview.images.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoPreview((prev) =>
                    prev ? { ...prev, idx: (prev.idx - 1 + prev.images.length) % prev.images.length } : null,
                  );
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                data-testid="button-checkout-lightbox-prev"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <img
              src={photoPreview.images[photoPreview.idx]}
              alt={photoPreview.name}
              className="max-h-[80vh] max-w-full object-contain rounded shadow-2xl select-none"
              data-testid="checkout-lightbox-image"
            />

            {photoPreview.images.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoPreview((prev) =>
                    prev ? { ...prev, idx: (prev.idx + 1) % prev.images.length } : null,
                  );
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                data-testid="button-checkout-lightbox-next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {photoPreview.images.length > 1 && (
            <div
              className="absolute bottom-4 inset-x-0 flex justify-center gap-2 px-4 overflow-x-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {photoPreview.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setPhotoPreview((prev) => (prev ? { ...prev, idx: i } : null))}
                  className={`w-14 h-14 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                    i === photoPreview.idx
                      ? "border-white opacity-100"
                      : "border-transparent opacity-50 hover:opacity-80"
                  }`}
                  data-testid={`button-checkout-lightbox-thumb-${i}`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
