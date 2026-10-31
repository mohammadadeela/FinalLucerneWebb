/* Turns a raw printer failure (from the desktop app or the system) into a
   message a cashier can act on.

   Why this exists: raw printer errors ("Invalid deviceName provided", ...)
   are English technical text, which the global toast safety layer replaces
   with a generic "unexpected error" — useless when the real problem is a
   switched-off printer. These messages are written to pass that layer as-is
   (they avoid the words it treats as technical), and each says what to do. */

type PrintReason = "no-printer" | "printer-not-found" | "print-timeout" | "cancelled" | "unknown";

function classify(raw: unknown): PrintReason {
  const text = String((raw as any)?.message ?? raw ?? "").toLowerCase();
  if (text.includes("no-printer")) return "no-printer";
  if (text.includes("printer-not-found") || text.includes("invalid devicename")) return "printer-not-found";
  if (text.includes("print-timeout") || text.includes("timeout")) return "print-timeout";
  if (text.includes("cancel")) return "cancelled";
  return "unknown";
}

const REASONS: Record<PrintReason, { ar: string; en: string }> = {
  "no-printer": {
    ar: "لا توجد طابعة مثبّتة على هذا الجهاز.",
    en: "No printer is installed on this computer.",
  },
  "printer-not-found": {
    ar: "الطابعة المحددة في الإعدادات غير موجودة أو غير متصلة. اختر الطابعة من قائمة POS ← إعدادات.",
    en: "The printer chosen in Settings was not found or is unplugged. Pick it again from POS > Settings.",
  },
  "print-timeout": {
    ar: "الطابعة لا تستجيب. تأكد أنها تعمل ومتصلة بالجهاز.",
    en: "The printer is not responding. Make sure it is on and connected.",
  },
  cancelled: {
    ar: "تم إلغاء أمر الطباعة.",
    en: "The print job was cancelled.",
  },
  unknown: {
    ar: "تأكد أن الطابعة تعمل ومتصلة بالجهاز وفيها ورق.",
    en: "Make sure the printer is on, connected, and has paper.",
  },
};

export function describePrintFailure(
  raw: unknown,
  ar: boolean,
  opts: { invoiceSaved: boolean },
): { title: string; description: string } {
  const reason = REASONS[classify(raw)][ar ? "ar" : "en"];
  const title = ar ? "تعذّرت الطباعة" : "Printing didn't work";
  if (!opts.invoiceSaved) return { title, description: reason };
  const saved = ar
    ? "تم حفظ الفاتورة بنجاح لكن تعذّرت طباعتها. "
    : "The invoice was saved, but it could not be printed. ";
  const retry = ar ? " يمكنك إعادة الطباعة من نافذة الفاتورة." : " You can print it again from the invoice window.";
  return { title, description: saved + reason + retry };
}
