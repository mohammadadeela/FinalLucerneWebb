import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Loader2, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";

type HistoryItem = {
  id: string | number;
  createdAt: string;
  undoneAt: string | null;
  entityType: "product" | "category" | "subcategory";
  operation: "create" | "update" | "delete";
  entityName: string | null;
};

export function AdminUndoButton() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/undo-history", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(ar ? "تعذر تحميل سجل التراجع" : "Could not load undo history");
      const history = await response.json();
      setItems(Array.isArray(history) ? history : []);
    } catch (error: any) {
      toast({ title: ar ? "خطأ في السجل" : "History error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [ar, toast]);

  useEffect(() => {
    if (open) void reload();
    else setConfirmId(null);
  }, [open, reload]);

  const undo = async (id: string) => {
    setRevertingId(id);
    try {
      const response = await fetch("/api/admin/undo-history/" + encodeURIComponent(id) + "/undo", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Undo failed");
      setConfirmId(null);
      await Promise.all([reload(), queryClient.invalidateQueries()]);
      toast({ title: ar ? "تم التراجع عن التعديل" : "Change successfully undone" });
    } catch (error: any) {
      toast({
        title: ar ? "تعذر التراجع" : "Unable to undo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRevertingId(null);
    }
  };

  const actionLabel = (item: HistoryItem) => {
    const target = item.entityType === "product"
      ? (ar ? "منتج" : "product")
      : item.entityType === "category"
        ? (ar ? "فئة" : "category")
        : (ar ? "فئة فرعية" : "subcategory");
    const action = item.operation === "create"
      ? (ar ? "إضافة" : "Added")
      : item.operation === "delete"
        ? (ar ? "حذف" : "Deleted")
        : (ar ? "تعديل" : "Edited");
    return action + " " + target;
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!revertingId) setOpen(next); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2" data-testid="button-admin-undo-history">
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">{ar ? "التراجع عن تعديل" : "Undo changes"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-lg rounded-lg max-h-[88vh] overflow-hidden flex flex-col" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            {ar ? "سجل التراجع" : "Undo history"}
          </DialogTitle>
          <DialogDescription className="text-start">
            {ar ? "اختر عملية محددة لاستعادة حالتها السابقة بأمان." : "Choose a specific change to safely restore its previous state."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-3 gap-2">
          <span>{ar ? "آخر 60 عملية مسجلة" : "Most recent 60 recorded changes"}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void reload()} disabled={loading || !!revertingId} className="gap-1.5 h-8">
            <RefreshCw className={loading ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
            {ar ? "تحديث" : "Refresh"}
          </Button>
        </div>
        <div className="overflow-y-auto min-h-20 flex-1 space-y-2 py-1">
          {loading && items.length === 0 && (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          )}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {ar ? "لا توجد تغييرات قابلة للتراجع حتى الآن." : "No undoable changes have been recorded yet."}
            </p>
          )}
          {items.map((item) => {
            const key = String(item.id);
            const confirming = confirmId === key;
            const undone = !!item.undoneAt;
            const dateLabel = new Date(item.createdAt).toLocaleString(ar ? "ar-PS" : "en-GB");
            return (
              <div key={key} className={`border rounded-lg p-3 ${undone ? "opacity-60 bg-muted/20" : "bg-card"}`}>
                <div className="flex gap-3 items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{actionLabel(item)} <span className="font-normal text-muted-foreground">· {item.entityName}</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{dateLabel}</p>
                  </div>
                  {undone ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5" />{ar ? "تم التراجع" : "Undone"}</span>
                  ) : (
                    <Button type="button" variant={confirming ? "default" : "outline"} size="sm" className="gap-1.5 shrink-0"
                      onClick={() => setConfirmId(confirming ? null : key)} disabled={!!revertingId}>
                      <RotateCcw className="w-3.5 h-3.5" />{ar ? "تراجع" : "Undo"}
                    </Button>
                  )}
                </div>
                {confirming && !undone && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {ar ? "سيتم استرجاع البيانات السابقة فقط إذا لم تتغير منذ هذه العملية. قد لا يمكن عكس تغييرات لها طلبات أو مبيعات مرتبطة."
                          : "Previous values will be restored only if nothing changed afterward. Actions involving later sales or dependencies may not be reversible."}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setConfirmId(null)} disabled={!!revertingId}>
                        {ar ? "إلغاء" : "Cancel"}
                      </Button>
                      <Button size="sm" onClick={() => void undo(key)} disabled={!!revertingId} className="gap-1.5">
                        {revertingId === key && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {ar ? "تأكيد التراجع" : "Confirm undo"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground border-t pt-3">
          {ar ? "يشمل إضافة وتعديل المنتجات والفئات. لا يشمل الحذف أو الفواتير أو حركات مخزون المبيعات."
              : "Covers product and category additions/edits. Deletions, invoices, and sales stock movements are not reversible."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
