// ─── WhatsApp Messaging via Twilio ─────────────────────────────────────────────
//
// Environment variables (set in Replit Secrets):
//   TWILIO_ACCOUNT_SID        — Live Account SID from console.twilio.com
//   TWILIO_AUTH_TOKEN         — Live Auth Token from console.twilio.com
//   TWILIO_WHATSAPP_FROM      — Your approved WhatsApp sender, e.g. whatsapp:+15559126361
//   TWILIO_NOTIF_TEMPLATE_SID — Content SID (HX...) for general utility template: body = {{1}}
//                               Used for OTP AND all notifications (order, discount, etc.)
//   TWILIO_OTP_TEMPLATE_SID   — Fallback OTP-specific template if NOTIF not set
//   ADMIN_WHATSAPP_PHONE      — (optional) store admin's number, e.g. 970597314193
//                               Used for internal alerts: new order, new exchange request
//
// Sending strategy:
//   • OTP        → always template (NOTIF first, OTP fallback) — bypasses 24h window
//   • Other msgs → try free-form first; if 63016/63032 → retry with NOTIF template

// ── Credential helpers (read at call-time so restarts pick up new secrets) ────
function getTwilioSid()             { return process.env.TWILIO_ACCOUNT_SID; }
function getTwilioToken()           { return process.env.TWILIO_AUTH_TOKEN; }
function getTwilioFrom()            { return process.env.TWILIO_WHATSAPP_FROM; }
function getTwilioNotifTemplateSid(){ return process.env.TWILIO_NOTIF_TEMPLATE_SID; }
function getTwilioOtpTemplateSid()  { return process.env.TWILIO_OTP_TEMPLATE_SID; }
/** Optional admin WhatsApp number for internal notifications (new order / new exchange request). */
function getAdminWhatsAppPhone()    { return (process.env.ADMIN_WHATSAPP_PHONE || "").trim(); }

export function isWhatsAppConfigured(): boolean {
  return !!(getTwilioSid() && getTwilioToken() && getTwilioFrom());
}

// ── E.164 helpers ─────────────────────────────────────────────────────────────

/** Strip everything except digits. */
function toDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Return the WhatsApp-prefixed E.164 number, e.g. whatsapp:+970597314193 */
function toWhatsAppE164(phone: string): string {
  return `whatsapp:+${toDigits(phone)}`;
}

// ── Typed Twilio error ─────────────────────────────────────────────────────────

class TwilioError extends Error {
  code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "TwilioError";
    this.code  = code;
  }
}

/** True when the error means "outside 24h customer-service window". */
function isOutside24hWindow(err: unknown): boolean {
  if (!(err instanceof TwilioError)) return false;
  // 63016 = freeform outside window; 63032 = user hasn't opted in
  return err.code === 63016 || err.code === 63032;
}

// ── Low-level Twilio API call ──────────────────────────────────────────────────

async function callTwilioApi(to: string, params: URLSearchParams): Promise<string> {
  const digits = toDigits(to);
  if (!digits) throw new TwilioError("Invalid phone number");

  const rawFrom = getTwilioFrom()!.trim();
  const toNumber = toWhatsAppE164(to);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${getTwilioSid()}/Messages.json`;
  const creds = Buffer.from(`${getTwilioSid()}:${getTwilioToken()}`).toString("base64");

  // Support both Messaging Service SIDs (MG...) and direct phone numbers
  if (rawFrom.startsWith("MG")) {
    params.append("MessagingServiceSid", rawFrom);
  } else {
    const fromNumber = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:+${rawFrom.replace(/\D/g, "")}`;
    params.append("From", fromNumber);
  }
  params.append("To", toNumber);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json() as any;

  if (!response.ok || data.status === "failed" || data.error_code) {
    const code    = data.code ?? data.error_code ?? null;
    const message = data.message ?? data.error_message ?? JSON.stringify(data);
    console.error(`[twilio-wa] send failed — code: ${code}, message: ${message}`);
    throw new TwilioError(`Twilio error ${code}: ${message}`, code);
  }

  console.log(`[twilio-wa] ✓ sent to ${toNumber} — SID: ${data.sid}`);
  return data.sid;
}

// ── Send strategies ────────────────────────────────────────────────────────────

/** Send a free-form text message (only valid within the 24h customer-service window). */
async function sendFreeform(to: string, body: string): Promise<string> {
  const params = new URLSearchParams();
  params.append("Body", body);
  return callTwilioApi(to, params);
}

/**
 * WhatsApp template variables cannot contain newlines, tabs, or runs of more
 * than 4 spaces — Twilio rejects those with error 21656 ("ContentVariables
 * Parameter is invalid"). Turn paragraph breaks into a readable separator and
 * collapse everything else down to single spaces.
 */
function sanitizeForTemplateVar(value: string): string {
  return value
    .replace(/\n{2,}/g, " • ")   // blank-line paragraph breaks → bullet separator
    .replace(/[\n\r\t]+/g, " ")  // any remaining newlines/tabs → single space
    .replace(/ {2,}/g, " ")      // collapse runs of spaces (avoids the >4-space rule too)
    .trim();
}

/** Send an approved Content Template message (works for any number, any time). */
async function sendTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string>
): Promise<string> {
  const sanitized: Record<string, string> = {};
  for (const [key, val] of Object.entries(variables)) {
    sanitized[key] = sanitizeForTemplateVar(val);
  }
  const params = new URLSearchParams();
  params.append("ContentSid", contentSid);
  params.append("ContentVariables", JSON.stringify(sanitized));
  return callTwilioApi(to, params);
}

/**
 * Smart sender:
 *   1. If an approved notification template is configured, use it FIRST — this
 *      works regardless of whether the customer has an active 24h session, and
 *      avoids the free-form-outside-window case where Twilio accepts the
 *      message (returns a SID) but it later shows up as "Undelivered" in the
 *      log instead of throwing a catchable error at send time.
 *   2. If no template is configured, or the template send itself fails, fall
 *      back to a free-form text message (only reliable within an active 24h
 *      window).
 */
async function sendSmart(to: string, body: string): Promise<string> {
  const notifSid = getTwilioNotifTemplateSid();
  if (notifSid) {
    try {
      console.log(`[wa] Sending via notif template ${notifSid} to ${toWhatsAppE164(to)}`);
      return await sendTemplate(to, notifSid, { "1": body });
    } catch (err) {
      console.warn(`[wa] Template send failed (${(err as any)?.message ?? err}) — falling back to free-form to ${toWhatsAppE164(to)}`);
      return sendFreeform(to, body);
    }
  }
  console.log(`[wa] No TWILIO_NOTIF_TEMPLATE_SID set — trying free-form to ${toWhatsAppE164(to)}`);
  return sendFreeform(to, body);
}

// ── Public API ─────────────────────────────────────────────────────────────────

function assertConfigured() {
  if (!isWhatsAppConfigured()) {
    throw new TwilioError(
      "Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM"
    );
  }
}

/**
 * Send a plain text WhatsApp message.
 * Tries free-form first; falls back to template if customer is outside 24h window.
 */
export async function sendTextMessage(
  to: string,
  body: string
): Promise<{ messageId: string; to: string }> {
  assertConfigured();
  const sid = await sendSmart(to, body);
  return { messageId: sid, to: toDigits(to) };
}

/**
 * Send an OTP verification code via WhatsApp.
 * Priority:
 *   1. TWILIO_NOTIF_TEMPLATE_SID (utility template, body = {{1}}) — sends full message
 *   2. TWILIO_OTP_TEMPLATE_SID   (auth template, body = {{1}})   — sends just the code
 *   3. Free-form fallback (only works within an active 24h session)
 */
export async function sendOtpWhatsApp(
  to: string,
  code: string
): Promise<{ messageId: string; to: string }> {
  assertConfigured();
  const fullMsg = `🔐 رمز التحقق لـ Lucerne Boutique:\n\n*${code}*\n\nصالح لمدة 10 دقائق.\nلا تشاركه مع أحد.`;

  const notifSid = getTwilioNotifTemplateSid();
  if (notifSid) {
    console.log(`[wa] OTP via notif template ${notifSid} → ${toWhatsAppE164(to)}`);
    const sid = await sendTemplate(to, notifSid, { "1": fullMsg });
    return { messageId: sid, to: toDigits(to) };
  }

  const otpSid = getTwilioOtpTemplateSid();
  if (otpSid) {
    console.log(`[wa] OTP via auth template ${otpSid} → ${toWhatsAppE164(to)}`);
    const sid = await sendTemplate(to, otpSid, { "1": code });
    return { messageId: sid, to: toDigits(to) };
  }

  // No template — try free-form (only works within active 24h session)
  console.warn(`[wa] OTP via free-form (no template SID set) → ${toWhatsAppE164(to)}`);
  const sid = await sendFreeform(to, fullMsg);
  return { messageId: sid, to: toDigits(to) };
}

// ── Higher-level helpers ───────────────────────────────────────────────────────

export async function sendOrderConfirmationWA(
  phone: string,
  details: {
    customerName: string;
    orderId: number;
    totalAmount: string;
    items: { name: string; quantity: number }[];
  }
) {
  if (!phone) return;
  const orderRef  = `#${String(details.orderId).padStart(6, "0")}`;
  const itemLines = details.items.map((i) => `  • ${i.name} ×${i.quantity}`).join("\n");
  const msg =
    `مرحباً ${details.customerName} 👋\n\n` +
    `✅ تم استلام طلبك بنجاح!\n\n` +
    `رقم الطلب: ${orderRef}\n` +
    `المنتجات:\n${itemLines}\n\n` +
    `المجموع: ${details.totalAmount} ₪\n\n` +
    `شكراً لتسوقك معنا في Lucerne Boutique 🌿`;
  try {
    assertConfigured();
    await sendSmart(phone, msg);
  } catch (err: any) {
    console.error(`[wa] Order confirmation failed for ${toWhatsAppE164(phone)}:`, err.message);
  }
}

export async function sendOrderStatusWA(
  phone: string,
  details: {
    customerName: string;
    orderId: number;
    status: string;
  }
) {
  if (!phone) return;
  const orderRef = `#${String(details.orderId).padStart(6, "0")}`;
  const statusMessages: Record<string, string> = {
    Processing: `⚙️ طلبك ${orderRef} قيد المعالجة الآن.`,
    Shipped:    `🚚 طلبك ${orderRef} في الطريق إليك! سيصل قريباً.`,
    Delivered:  `✅ تم تسليم طلبك ${orderRef} بنجاح. نأمل أن ينال إعجابك!`,
    Cancelled:  `❌ تم إلغاء طلبك ${orderRef}. للاستفسار تواصل معنا.`,
  };
  const text = statusMessages[details.status];
  if (!text) return;
  const msg = `مرحباً ${details.customerName} 👋\n\n${text}\n\nشكراً — Lucerne Boutique 🌿`;
  try {
    assertConfigured();
    await sendSmart(phone, msg);
  } catch (err: any) {
    console.error(`[wa] Order status failed for ${toWhatsAppE164(phone)}:`, err.message);
  }
}

export async function sendDiscountCodeWA(
  phone: string,
  details: {
    customerName: string;
    code: string;
    discountPercent: number;
    restrictionLabel?: string | null;
    expiresAt?: Date | null;
  }
) {
  if (!phone) return;
  let msg =
    `مرحباً ${details.customerName} 👋\n\n` +
    `🎁 هدية خاصة لكِ من Lucerne Boutique!\n\n` +
    `كود الخصم: *${details.code}*\n` +
    `نسبة الخصم: ${details.discountPercent}%\n`;
  if (details.restrictionLabel) msg += `يُطبَّق على: ${details.restrictionLabel}\n`;
  if (details.expiresAt)        msg += `صالح حتى: ${details.expiresAt.toLocaleDateString("ar-SA")}\n`;
  msg += `\nتسوقي الآن على متجرنا وادخلي الكود عند الدفع 🛍️\n\nLucerne Boutique 🌿`;
  try {
    assertConfigured();
    await sendSmart(phone, msg);
  } catch (err: any) {
    console.error(`[wa] Discount code WA failed for ${toWhatsAppE164(phone)}:`, err.message);
  }
}

/**
 * Password reset code via WhatsApp.
 * Mirrors sendPasswordResetCode() in email.ts.
 */
export async function sendPasswordResetWA(
  phone: string,
  code: string
): Promise<{ messageId: string; to: string } | undefined> {
  if (!phone) return;
  const msg =
    `🔑 رمز إعادة تعيين كلمة المرور — Lucerne Boutique\n\n` +
    `*${code}*\n\n` +
    `صالح لمدة 15 دقيقة. إذا لم تطلبي إعادة تعيين كلمة المرور، تجاهلي هذه الرسالة.`;
  try {
    assertConfigured();
    const sid = await sendSmart(phone, msg);
    return { messageId: sid, to: toDigits(phone) };
  } catch (err: any) {
    console.error(`[wa] Password reset WA failed for ${toWhatsAppE164(phone)}:`, err.message);
  }
}

/**
 * New-order alert sent to the store admin's WhatsApp.
 * Mirrors sendOrderNotification() in email.ts (admin-facing).
 * Requires ADMIN_WHATSAPP_PHONE to be set — silently skips otherwise.
 */
export async function sendOrderNotificationWA(orderDetails: {
  orderId: number;
  customerName: string;
  phone: string;
  address: string;
  city: string;
  totalAmount: string;
  paymentMethod: string;
  items: { name: string; quantity: number; size?: string | null; color?: string | null }[];
}) {
  const adminPhone = getAdminWhatsAppPhone();
  if (!adminPhone) {
    console.log("[wa] ADMIN_WHATSAPP_PHONE not set — skipping order notification WA");
    return;
  }
  const orderRef  = `#${String(orderDetails.orderId).padStart(6, "0")}`;
  const itemLines = orderDetails.items
    .map((i) => `  • ${i.name} ×${i.quantity}${i.size || i.color ? ` (${[i.size, i.color].filter(Boolean).join(" / ")})` : ""}`)
    .join("\n");
  const msg =
    `🛎️ طلب جديد — New Order ${orderRef}\n\n` +
    `العميل: ${orderDetails.customerName}\n` +
    `الهاتف: ${orderDetails.phone}\n` +
    `العنوان: ${orderDetails.address}, ${orderDetails.city}\n` +
    `الدفع: ${orderDetails.paymentMethod}\n\n` +
    `المنتجات:\n${itemLines}\n\n` +
    `الإجمالي: ₪${orderDetails.totalAmount}`;
  try {
    assertConfigured();
    await sendSmart(adminPhone, msg);
  } catch (err: any) {
    console.error(`[wa] Order notification WA failed:`, err.message);
  }
}

/**
 * Exchange request status update (approved / denied) sent to the customer.
 * Mirrors sendExchangeStatusEmail() in email.ts.
 */
export async function sendExchangeStatusWA(
  phone: string,
  details: {
    customerName: string;
    status: "approved" | "denied";
    orderRef: string;
    productName: string;
    adminNote?: string | null;
    preferredSize?: string | null;
    preferredColor?: string | null;
  }
) {
  if (!phone) return;
  const isApproved = details.status === "approved";
  let msg =
    `مرحباً ${details.customerName} 👋\n\n` +
    (isApproved
      ? `✅ تمت الموافقة على طلب الاستبدال الخاص بك!\nتم إنشاء طلب استبدال جديد، يمكنك تتبعه من ملفك الشخصي.\n\n`
      : `❌ نأسف، تم رفض طلب الاستبدال الخاص بك.\nيرجى التواصل معنا إذا كان لديك أي استفسار.\n\n`) +
    `رقم الطلب: ${details.orderRef}\n` +
    `المنتج: ${details.productName}\n`;
  if (details.preferredSize || details.preferredColor) {
    msg += `المطلوب: ${[details.preferredSize, details.preferredColor].filter(Boolean).join(" / ")}\n`;
  }
  if (details.adminNote) msg += `\nملاحظة الإدارة: ${details.adminNote}\n`;
  msg += `\nLucerne Boutique 🌿`;
  try {
    assertConfigured();
    await sendSmart(phone, msg);
  } catch (err: any) {
    console.error(`[wa] Exchange status WA failed for ${toWhatsAppE164(phone)}:`, err.message);
  }
}

/**
 * New exchange-request alert sent to the store admin's WhatsApp.
 * Mirrors sendExchangeAdminNotification() in email.ts.
 * Requires ADMIN_WHATSAPP_PHONE to be set — silently skips otherwise.
 */
export async function sendExchangeAdminNotificationWA(details: {
  customerName: string;
  customerEmail: string;
  orderId: number;
  productName: string;
  preferredSize?: string | null;
  preferredColor?: string | null;
  reason: string;
}) {
  const adminPhone = getAdminWhatsAppPhone();
  if (!adminPhone) {
    console.log("[wa] ADMIN_WHATSAPP_PHONE not set — skipping exchange admin notification WA");
    return;
  }
  const orderRef = `#${String(details.orderId).padStart(6, "0")}`;
  let msg =
    `🔄 طلب استبدال جديد — New Exchange Request\n\n` +
    `العميل: ${details.customerName}\n` +
    `البريد: ${details.customerEmail}\n` +
    `رقم الطلب: ${orderRef}\n` +
    `المنتج: ${details.productName}\n`;
  if (details.preferredSize || details.preferredColor) {
    msg += `المقاس / اللون: ${[details.preferredSize, details.preferredColor].filter(Boolean).join(" / ")}\n`;
  }
  msg += `\nسبب الاستبدال:\n${details.reason}\n\nراجعي الطلب من لوحة التحكم ← الاستبدالات.`;
  try {
    assertConfigured();
    await sendSmart(adminPhone, msg);
  } catch (err: any) {
    console.error(`[wa] Exchange admin notification WA failed:`, err.message);
  }
}

/**
 * Abandoned-cart reminder sent to the customer.
 * Mirrors sendAbandonedCartEmail() in email.ts.
 */
export async function sendAbandonedCartWA(phone: string, customerName: string) {
  if (!phone) return;
  const msg =
    `مرحباً ${customerName} 🛍️\n\n` +
    `لاحظنا أن لديكِ منتجات في سلتك تنتظر إتمام الطلب.\n` +
    `لا تفوّتي الفرصة — المنتجات محدودة الكمية!\n\n` +
    `أكملي طلبك الآن: https://lucerne-boutique.com/cart\n\n` +
    `Lucerne Boutique 🌿`;
  try {
    assertConfigured();
    await sendSmart(phone, msg);
  } catch (err: any) {
    console.error(`[wa] Abandoned cart WA failed for ${toWhatsAppE164(phone)}:`, err.message);
  }
}

/**
 * General sale/discount blast (no personal code — just a store-wide % off).
 * Mirrors sendSaleDiscountEmail() in email.ts.
 */
export async function sendSaleDiscountWA(
  phone: string,
  details: {
    customerName: string;
    discountPercent: number;
    categoryMention?: string | null;
  }
) {
  if (!phone) return;
  let msg =
    `مرحباً ${details.customerName} ✨\n\n` +
    `🎉 عرض خاص من Lucerne Boutique — خصم *${details.discountPercent}%*`;
  msg += details.categoryMention ? ` على ${details.categoryMention}!\n\n` : ` على تشكيلتنا المميزة!\n\n`;
  msg += `تسوقي الآن قبل انتهاء العرض: https://lucerne-boutique.com\n\nLucerne Boutique 🌿`;
  try {
    assertConfigured();
    await sendSmart(phone, msg);
  } catch (err: any) {
    console.error(`[wa] Sale discount WA failed for ${toWhatsAppE164(phone)}:`, err.message);
  }
}
