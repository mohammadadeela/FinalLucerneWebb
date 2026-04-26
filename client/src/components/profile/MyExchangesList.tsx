import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n";
import { ArrowLeftRight, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

type ExchangeRow = {
  id: number;
  orderId: number;
  productId: number;
  reason: string;
  preferredSize: string | null;
  preferredColor: string | null;
  status: "pending" | "approved" | "denied";
  adminNote: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  product: { id: number; name: string; mainImage: string } | null;
};

type Props = {
  statusFilter?: "pending" | "approved" | "denied";
};

export function MyExchangesList({ statusFilter }: Props) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { data, isLoading } = useQuery<ExchangeRow[]>({ queryKey: ["/api/exchange-requests"] });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">{ar ? "جارٍ التحميل..." : "Loading..."}</div>;
  }

  const filtered = statusFilter ? (data ?? []).filter(ex => ex.status === statusFilter) : (data ?? []);

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl" data-testid="empty-exchanges">
        <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          {ar ? "لا توجد طلبات استبدال بعد" : "No exchange requests yet"}
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl" data-testid="empty-exchanges-filtered">
        <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          {ar ? "لا توجد طلبات بهذا التصنيف" : "No requests match this filter"}
        </p>
      </div>
    );
  }

  const statusMeta = {
    pending: { Icon: Clock, color: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800/50", labelAr: "قيد المراجعة", labelEn: "Pending" },
    approved: { Icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800/50", labelAr: "موافق عليه", labelEn: "Approved" },
    denied: { Icon: XCircle, color: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-900/20 dark:border-rose-800/50", labelAr: "مرفوض", labelEn: "Denied" },
  } as const;

  return (
    <div className="space-y-3" data-testid="list-exchanges">
      {filtered.map(ex => {
        const m = statusMeta[ex.status];
        const Icon = m.Icon;
        return (
          <div key={ex.id} className="border border-border rounded-xl p-4 bg-background" data-testid={`row-exchange-${ex.id}`}>
            <div className="flex items-start gap-3">
              {ex.product?.mainImage && (
                <img src={ex.product.mainImage} alt="" className="w-14 h-18 object-cover rounded flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate">{ex.product?.name ?? `#${ex.productId}`}</p>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${m.color}`}>
                    <Icon className="w-3 h-3" />
                    {ar ? m.labelAr : m.labelEn}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ar ? "طلب رقم" : "Order"} #{ex.orderId} · {ex.createdAt ? format(new Date(ex.createdAt), "yyyy-MM-dd") : ""}
                </p>
                <p className="text-sm mt-2">{ex.reason}</p>
                {(ex.preferredSize || ex.preferredColor) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {ex.preferredSize && <>{ar ? "المقاس البديل" : "Preferred size"}: <span className="font-medium">{ex.preferredSize}</span> </>}
                    {ex.preferredColor && <>· {ar ? "اللون البديل" : "Preferred color"}: <span className="font-medium">{ex.preferredColor}</span></>}
                  </p>
                )}
                {ex.adminNote && (
                  <div className="mt-2 text-xs bg-muted/40 rounded px-3 py-2 border-s-2 border-foreground/20">
                    <span className="font-semibold">{ar ? "ملاحظة الإدارة:" : "Admin note:"}</span> {ex.adminNote}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
