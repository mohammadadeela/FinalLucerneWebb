import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useOrder } from "@/hooks/use-orders";
import { useLanguage } from "@/i18n";
import { CheckCircle, Package, ShoppingBag, Store, UserRound, Gift } from "lucide-react";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { Button } from "@/components/ui/button";
import { getOrderItemImage } from "@/lib/utils";

export default function OrderConfirmation() {
  const [, params] = useRoute("/order-confirmation/:id");
  const orderId = params?.id ? Number(params.id) : 0;
  // A guest (no account) opens this page from a signed link: /order-confirmation/12?t=<token>
  const guestToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("t") : null;
  const { data: orderDetails, isLoading } = useOrder(orderId, guestToken);
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const ar = language === "ar";
  const orderAny = orderDetails?.order as any;
  const isPickup = orderAny?.deliveryMethod === "pickup";
  const isGuestOrder = !!orderAny && orderAny.userId == null;
  const guestPoints = isGuestOrder && siteSettings?.loyalty_points_enabled !== "false"
  ? Math.floor(Math.max(0, parseFloat(orderAny.totalAmount) - parseFloat(orderAny.shippingCost || "0")) / 2)
  : 0;

  // Always show the confirmation page from the top (checkout leaves the page scrolled down)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const statusKey = (orderDetails?.order?.status || "Pending") as keyof typeof t.orderStatus;
  const statusLabel = t.orderStatus[statusKey] || orderDetails?.order?.status;

  const statusColor = {
    Pending: "bg-amber-100 text-amber-800",
    ReadyForPickup: "bg-violet-100 text-violet-800",
    OnTheWay: "bg-blue-100 text-blue-800",
    Delivered: "bg-green-100 text-green-800",
    Cancelled: "bg-red-100 text-red-800",
  }[statusKey] || "bg-primary/10 text-primary";

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 w-full">
        {isLoading ? (
          <div className="animate-pulse space-y-6 py-6">
            <div className="mx-auto w-20 h-20 rounded-full bg-muted" />
            <div className="mx-auto h-8 w-56 bg-muted rounded" />
            <div className="mx-auto h-4 w-72 bg-muted rounded" />
            <div className="bg-muted rounded-xl h-48 w-full" />
            <div className="bg-muted rounded-xl h-32 w-full" />
          </div>
        ) : orderDetails ? (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-20 h-20 text-green-500" />
            </div>

            <h1 className="font-display text-3xl sm:text-4xl mb-3" data-testid="text-confirmation-title">
              {t.orderConfirmation.title}
            </h1>

            <p className="text-muted-foreground mb-8 text-sm" data-testid="text-confirmation-notice">
            {isGuestOrder && !orderAny?.guestEmail
            ? (ar ? "سنراسلك على واتساب برقم الهاتف الذي أدخلته بتفاصيل طلبك" : "We'll message you on WhatsApp at the number you gave with your order updates")
            : t.orderConfirmation.emailSent}
            </p>

            {isPickup && (
            <div className="mb-8 rounded-2xl border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 p-6 text-center" data-testid="card-pickup-code">
            <div className="flex items-center justify-center gap-2 mb-2 text-violet-800 dark:text-violet-300">
            <Store className="w-5 h-5" />
            <p className="text-sm font-bold">{ar ? "استلام من المتجر" : "Store pickup"}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{ar ? "اعرضي هذا الرمز عند الاستلام" : "Show this code when you collect your order"}</p>
            <p className="font-mono text-4xl sm:text-5xl font-extrabold tracking-[0.35em] ps-[0.35em] select-all ltr-num" dir="ltr" data-testid="text-pickup-code">{orderAny?.pickupCode}</p>
            <p className="mt-4 text-sm">{ar ? getSetting(siteSettings, "location_address_ar") : getSetting(siteSettings, "location_address_en")}</p>
            <p className="text-xs text-muted-foreground mt-1">{ar ? getSetting(siteSettings, "location_hours_ar") : getSetting(siteSettings, "location_hours_en")}</p>
            <p className="text-xs text-muted-foreground mt-3">{ar ? "سنخبرك على واتساب عندما يصبح طلبك جاهزاً." : "We'll message you on WhatsApp when your order is ready."}</p>
            </div>
            )}

            <div className="bg-secondary p-6 sm:p-8 mb-8 text-start">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 pb-6 border-b border-border">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{t.orderConfirmation.orderNumber}</p>
                  <p className="text-2xl font-display font-bold" data-testid="text-order-number">
                    <span className="ltr-num">#{orderDetails.order.id.toString().padStart(6, '0')}</span>
                  </p>
                </div>
                <div className="mt-3 sm:mt-0">
                  <p className="text-sm text-muted-foreground mb-1">{t.orderConfirmation.status}</p>
                  <span className={`inline-block px-4 py-1.5 text-xs uppercase tracking-widest font-semibold ${statusColor}`} data-testid="text-order-status">
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {orderDetails.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      {getOrderItemImage(item.product, item.color) && (
                        <img src={getOrderItemImage(item.product, item.color)} alt="" className="w-10 h-14 object-cover bg-muted flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium">{item.product?.name}</p>
                        <p className="text-xs text-muted-foreground"><span className="ltr-num">{item.size} {item.color} × {item.quantity}</span></p>
                      </div>
                    </div>
                    <span className="font-medium ltr-num">₪{(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {(() => {
                const total = parseFloat(orderDetails.order.totalAmount);
                const shipping = parseFloat(orderDetails.order.shippingCost || "0");
                const discount = parseFloat((orderDetails.order as any).discountAmount || "0");
                const credit = parseFloat((orderDetails.order as any).creditUsed || "0");
                const subtotal = total - shipping + discount + credit;
                const ar = (t as any) && t.checkout && (t.checkout as any).total === "الإجمالي";
                return (
                  <div className="border-t border-border pt-4 space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t.checkout.subtotal}</span>
                      <span data-testid="text-order-subtotal" className="ltr-num">₪{subtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-rose-600 dark:text-rose-400">
                        <span className="flex items-center gap-1.5">
                          {ar ? "خصم" : "Discount"}
                          {orderDetails.order.discountCode && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 font-semibold">
                              {orderDetails.order.discountCode}
                            </span>
                          )}
                        </span>
                        <span className="font-medium ltr-num" data-testid="text-order-discount">−₪{discount.toFixed(2)}</span>
                      </div>
                    )}
                    {credit > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>{ar ? "رصيد مستخدم" : "Credit applied"}</span>
                        <span className="font-medium ltr-num" data-testid="text-order-credit-used">−₪{credit.toFixed(2)}</span>
                      </div>
                    )}
                    {shipping > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t.checkout.shipping}</span>
                        <span className="ltr-num">₪{shipping.toFixed(2)}</span>
                      </div>
                    )}
                    {(discount + credit) > 0 && (
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400 text-xs pt-1">
                        <span className="font-semibold">{ar ? "إجمالي ما وفّرتيه" : "You saved"}</span>
                        <span className="font-bold ltr-num">₪{(discount + credit).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                      <span>{t.checkout.total}</span>
                      <span className="ltr-num">₪{total.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {isGuestOrder && (
            <div className="mb-8 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 p-5 text-start flex items-start gap-3" data-testid="card-guest-signin">
            <span className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
            {guestPoints > 0 ? <Gift className="w-4 h-4 text-amber-700 dark:text-amber-400" /> : <UserRound className="w-4 h-4 text-amber-700 dark:text-amber-400" />}
            </span>
            <div className="flex-1">
            <p className="text-sm font-bold" data-testid="text-guest-points-cta">
            {guestPoints > 0
            ? (ar ? `سجّلي الدخول لتكسبي ${guestPoints} نقطة على طلب كهذا في المرة القادمة` : `Sign in next time to earn ${guestPoints} points on an order like this`)
            : (ar ? "أنشئي حساباً لتتبّع طلباتك وكسب النقاط" : "Create an account to track your orders and earn points")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{ar ? "الطلبات كضيف لا تحصل على نقاط. حفظنا رابط هذه الصفحة لتعودي إليها." : "Guest orders don't earn points. Bookmark this page to come back to your order."}</p>
            <Link href="/auth"><Button size="sm" variant="outline" className="mt-3" data-testid="button-guest-create-account">{ar ? "تسجيل الدخول / إنشاء حساب" : "Sign in / Create account"}</Button></Link>
            </div>
            </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              {!isGuestOrder && (
              <Link href={`/profile?order=${orderId}`} className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto rounded-md uppercase tracking-widest text-xs sm:text-sm px-6 sm:px-8 py-4 sm:py-5" data-testid="button-track-order">
              <Package className="w-4 h-4 me-2" />
              {t.orderConfirmation.trackOrder}
              </Button>
              </Link>
              )}
              <Link href="/shop" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto rounded-md uppercase tracking-widest text-xs sm:text-sm px-6 sm:px-8 py-4 sm:py-5" data-testid="button-continue-shopping">
                  <ShoppingBag className="w-4 h-4 me-2" />
                  {t.orderConfirmation.continueShopping}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">Order not found</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
