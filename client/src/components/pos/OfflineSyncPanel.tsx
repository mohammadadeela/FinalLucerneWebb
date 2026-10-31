import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CloudOff, Copy, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useLanguage } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { useConnection } from "@/lib/connection";
import {
  describeSale, dismissSale, initOfflineQueue, retrySale, syncPendingSales, useOfflineQueue, usingMemoryFallback,
  type QueuedSale,
} from "@/lib/offline-pos";

/* POS ONLY. Shows what is saved on this device but not uploaded yet, uploads it by itself when the connection is
   back, and lets the cashier see, retry or copy any sale that needs a person's attention. */

export default function OfflineSyncPanel() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();
  const online = useConnection((s) => s.online);
  const { sales, ready, syncing } = useOfflineQueue();
  const [open, setOpen] = useState(false);

  useEffect(() => { void initOfflineQueue(); }, []);

  const pending = sales.filter((s) => s.status === "pending");
  const failed = sales.filter((s) => s.status === "failed");
  const recentlySynced = sales.filter((s) => s.status === "synced").slice(-5).reverse();

  const sync = useCallback(async () => {
    const r = await syncPendingSales();
    if (r.synced > 0) {
      // The server now has these sales: refresh stock, invoices and today's numbers.
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: ar ? `✓ تمت مزامنة ${r.synced} ${r.synced === 1 ? "فاتورة" : "فواتير"}` : `✓ ${r.synced} ${r.synced === 1 ? "invoice" : "invoices"} synced`,
        description: ar ? "حُفظت مبيعات وضع عدم الاتصال على الخادم." : "Your offline sales are now saved on the server.",
      });
    }
    if (r.failed > 0) {
      toast({
        title: ar ? "فاتورة تحتاج مراجعة" : "An invoice needs attention",
        description: ar ? "رفض الخادم فاتورة. افتحي لوحة المزامنة لرؤية السبب." : "The server refused an invoice. Open the sync panel to see why.",
        variant: "destructive",
      });
      setOpen(true);
    }
    if (r.stoppedBecause === "login") {
      toast({
        title: ar ? "سجّلي الدخول لإكمال المزامنة" : "Sign in to finish syncing",
        description: ar ? "مبيعاتك محفوظة وستُرسل بعد تسجيل الدخول." : "Your sales are safe and will upload after you sign in.",
        variant: "destructive",
      });
    }
    return r;
  }, [qc, toast, ar]);

  // Upload by itself the moment we're connected and something is waiting; keep trying while it still is.
  useEffect(() => {
    if (!ready || !online || pending.length === 0) return;
    const first = window.setTimeout(() => void sync(), 800);
    // While anything is waiting, retry every 10s — cheap, and the cashier shouldn't wait long once the line is back.
    const every = window.setInterval(() => void sync(), 10_000);
    return () => { window.clearTimeout(first); window.clearInterval(every); };
  }, [ready, online, pending.length, sync]);

  const attention = failed.length > 0;
  const waiting = pending.length > 0;
  if (!ready) return null;
  if (online && !waiting && !attention && !open) return null;

  const T = {
    offlineMode: ar ? "وضع عدم الاتصال" : "Offline mode",
    waiting: (n: number) => (ar ? `${n} بانتظار الإرسال` : `${n} waiting to upload`),
    syncing: ar ? "جارٍ الإرسال…" : "Uploading…",
    attention: (n: number) => (ar ? `${n} تحتاج مراجعة` : `${n} need attention`),
    title: ar ? "مبيعات محفوظة على هذا الجهاز" : "Sales saved on this device",
    safe: ar ? "مبيعاتك آمنة ولن تضيع. تُرسل تلقائياً عند عودة الاتصال." : "Your sales are safe. They upload automatically when the connection is back.",
    memoryWarn: ar ? "تنبيه: التخزين الدائم غير متاح، لذا لا تغلقي هذه الصفحة قبل المزامنة." : "Note: permanent storage isn't available, so don't close this page before syncing.",
    syncNow: ar ? "إرسال الآن" : "Upload now",
    empty: ar ? "لا توجد مبيعات بانتظار الإرسال." : "No sales are waiting.",
    retry: ar ? "إعادة المحاولة" : "Retry",
    copy: ar ? "نسخ التفاصيل" : "Copy details",
    del: ar ? "حذف" : "Delete",
    confirmDel: ar ? "تأكدي أنك نسختِ التفاصيل أو سجّلتِ هذه الفاتورة يدوياً. حذفها نهائي." : "Make sure you've copied the details or entered this sale by hand. Deleting is permanent.",
    recent: ar ? "أُرسلت مؤخراً" : "Recently uploaded",
  };

  const label = attention ? T.attention(failed.length) : syncing ? T.syncing : waiting ? T.waiting(pending.length) : T.offlineMode;
  const tone = attention ? "bg-red-600" : waiting || syncing ? "bg-amber-500" : "bg-slate-700";

  const statusChip = (s: QueuedSale) => {
    if (s.status === "synced") return <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">{ar ? "تم" : "Done"}</span>;
    if (s.status === "failed") return <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold">{ar ? "تحتاج مراجعة" : "Needs attention"}</span>;
    return <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">{ar ? "بانتظار الإرسال" : "Waiting"}</span>;
  };

  const SaleRow = ({ s }: { s: QueuedSale }) => (
    <li className="rounded-xl border border-border p-3 text-sm" data-testid={`offline-sale-${s.offlineNumber}`} data-status={s.status}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-bold ltr-num" dir="ltr">{s.offlineNumber}</span>
        {statusChip(s)}
      </div>
      <p className="mt-1 text-xs text-muted-foreground ltr-num">
        {new Date(s.soldAt).toLocaleTimeString(ar ? "ar-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" })} · ₪{s.total.toFixed(2)} · {(s.payload?.items || []).length} {ar ? "قطع" : "items"}
      </p>
      {s.status === "synced" && s.serverOrderId && (
        <p className="mt-1 text-xs font-semibold text-emerald-700 ltr-num">→ {ar ? "فاتورة" : "Invoice"} #{s.serverOrderId}</p>
      )}
      {s.status === "failed" && (
        <>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700" data-testid="offline-sale-error"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{s.lastError}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void retrySale(s.clientRef).then(() => sync())} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted" data-testid={`button-retry-sale-${s.offlineNumber}`}><RefreshCw className="w-3 h-3" />{T.retry}</button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(describeSale(s))} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted" data-testid={`button-copy-sale-${s.offlineNumber}`}><Copy className="w-3 h-3" />{T.copy}</button>
            <button type="button" onClick={() => { if (window.confirm(T.confirmDel)) void dismissSale(s.clientRef); }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-red-50" data-testid={`button-delete-sale-${s.offlineNumber}`}><Trash2 className="w-3 h-3" />{T.del}</button>
          </div>
        </>
      )}
    </li>
  );

  return (
    <div className="fixed bottom-24 start-4 z-[160] flex flex-col items-start gap-2" data-testid="offline-sync">
      {open && (
        <div className="w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl p-4" role="dialog" aria-label={T.title} data-testid="offline-panel">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-sm">{T.title}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{T.safe}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-md hover:bg-muted" data-testid="button-close-offline-panel"><X className="w-4 h-4" /></button>
          </div>
          {usingMemoryFallback && <p className="mt-2 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-2 text-xs">{T.memoryWarn}</p>}
          <button
            type="button"
            onClick={() => void sync()}
            disabled={!online || syncing || pending.length === 0}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-40"
            data-testid="button-sync-now"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{T.syncNow}
          </button>
          <ul className="mt-3 space-y-2">
            {[...pending, ...failed].length === 0 && <li className="text-center text-xs text-muted-foreground py-3">{T.empty}</li>}
            {[...failed, ...pending].map((s) => <SaleRow key={s.clientRef} s={s} />)}
          </ul>
          {recentlySynced.length > 0 && (
            <>
              <p className="mt-4 mb-2 text-[11px] font-bold text-muted-foreground">{T.recent}</p>
              <ul className="space-y-2">{recentlySynced.map((s) => <SaleRow key={s.clientRef} s={s} />)}</ul>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full ${tone} text-white px-4 py-2.5 text-sm font-bold shadow-lg`}
        data-testid="offline-pill"
        aria-expanded={open}
      >
        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : attention ? <AlertTriangle className="w-4 h-4" /> : !online ? <CloudOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        <span data-testid="offline-pill-label">{label}</span>
      </button>
    </div>
  );
}
