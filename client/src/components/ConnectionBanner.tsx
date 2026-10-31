import { useEffect } from "react";
import { useLocation } from "wouter";
import { Wifi, WifiOff } from "lucide-react";
import { useLanguage } from "@/i18n";
import { installConnectionMonitor, useConnection } from "@/lib/connection";

/* POS ONLY. Shows a small pill at the bottom-centre when the connection drops and a
   brief green "back online" pill when it returns.

   Designed not to get in the cashier's way: it never blocks clicks
   (pointer-events-none), sits where it covers no controls on the POS or the
   storefront, and disappears by itself. It is hidden on the customer-facing
   display, which must never show technical status to shoppers. */
export default function ConnectionBanner() {
  const [location] = useLocation();
  const { language } = useLanguage();
  const online = useConnection((s) => s.online);
  const justRestored = useConnection((s) => s.justRestored);

  // Watch the connection only while the POS page is open.
  useEffect(() => installConnectionMonitor(), []);

  if (location.startsWith("/admin/pos-customer")) return null;
  if (online && !justRestored) return null;

  const ar = language === "ar";
  const offline = !online;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex justify-center px-4"
      dir={ar ? "rtl" : "ltr"}
    >
      <div
        role={offline ? "alert" : "status"}
        aria-live={offline ? "assertive" : "polite"}
        className={`flex max-w-md items-center gap-3 rounded-2xl px-5 py-3 text-white shadow-lg ${
          offline ? "bg-red-600" : "bg-green-600"
        }`}
        data-testid={offline ? "banner-offline" : "banner-back-online"}
      >
        {offline ? (
          <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
        ) : (
          <Wifi className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}
        <div className="leading-snug">
          <p className="text-sm font-bold">
            {offline
              ? ar
                ? "لا يوجد اتصال بالإنترنت"
                : "No internet connection"
              : ar
                ? "عاد الاتصال بالإنترنت"
                : "Back online"}
          </p>
          {offline && (
            <p className="text-xs opacity-90">
              {ar
                ? "تحقق من الشبكة. سنعيد الاتصال تلقائياً."
                : "Check your connection. We'll reconnect automatically."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
