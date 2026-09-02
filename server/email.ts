import nodemailer from "nodemailer";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";

let transporter: nodemailer.Transporter | null = null;

function esc(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

// Phone-only signups (see /api/auth/phone-signup) get a placeholder email
// like `phone_9721234567@phone.lucerne` so the `email` column always has
// something in it — but that domain doesn't exist and can never receive
// mail. Every place that emails a customer needs to skip these, both to
// avoid wasted/bounced sends and to keep the sending account's deliverability
// reputation clean.
const PLACEHOLDER_EMAIL_DOMAIN = "@phone.lucerne";
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

// ADMIN_EMAIL and EMPLOYEE_EMAIL are set to bootstrap the admin/employee
// accounts (see server/routes.ts) and are frequently just test/placeholder
// addresses, not real inboxes. When whoever is logged in as the admin or
// employee places an order themselves (e.g. while testing checkout), we
// don't want to fire a customer confirmation email at those addresses.
function getStaffEmails(): string[] {
  return [process.env.ADMIN_EMAIL, process.env.EMPLOYEE_EMAIL]
    .map((e) => (e || "").trim().toLowerCase())
    .filter(Boolean);
}
export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getStaffEmails().includes(email.trim().toLowerCase());
}

function getTransporter() {
  if (transporter) return transporter;

  const user = (process.env.EMAIL_USER || "").trim();
  const pass = (process.env.EMAIL_PASS || "").trim();

  if (!user || !pass) {
    console.log(
      "[email] EMAIL_USER or EMAIL_PASS not set — emails will be logged to console",
    );
    return null;
  }

  console.log(`[email] Transporter configured for: ${redactEmail(user)}`);

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: true },
  });

  return transporter;
}

export async function verifyEmailConnection(): Promise<void> {
  const user = (process.env.EMAIL_USER || "").trim();
  const pass = (process.env.EMAIL_PASS || "").trim();
  if (!user || !pass) {
    console.log("[email] Skipping SMTP verify — credentials not set");
    return;
  }
  const t = getTransporter();
  if (!t) return;
  try {
    await t.verify();
    console.log("[email] SMTP connection verified successfully ✓");
  } catch (err: any) {
    console.error("[email] SMTP connection FAILED:", err?.message || err);
    transporter = null;
  }
}

function getSenderEmail() {
  return (process.env.EMAIL_USER || "").trim();
}

/* ── Shared SVG logo (extracted from ProductWatermark) ───── */
const EMAIL_LOGO_SVG = `<svg version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 393 297" width="72" style="display:block;margin:0 auto 6px;"><ellipse cx="210" cy="120" rx="122" ry="50" transform="rotate(-42 246 132)" fill="#97d5d4"/><ellipse cx="169" cy="240" rx="67" ry="40" transform="rotate(35 176 240)" fill="#f4d3dc"/><ellipse cx="156" cy="200" rx="40" ry="15" transform="rotate(13 160 196)" fill="#f06ee8"/><g transform="translate(0,297) scale(0.1,-0.1)" fill="#1a1a1a" stroke="#1a1a1a" stroke-width="18" stroke-linejoin="round"><path d="M2685 2594 c-179 -27 -296 -59 -490 -136 -259 -103 -609 -284 -965 -501 -126 -77 -160 -104 -160 -124 0 -26 34 -12 158 65 434 269 823 464 1138 571 167 57 252 73 379 75 100 1 115 -1 160 -25 105 -53 147 -157 126 -310 -15 -115 -53 -252 -108 -389 -114 -287 -230 -468 -408 -638 -133 -127 -246 -199 -407 -257 -76 -27 -77 -27 -101 -9 -113 89 -164 123 -242 160 -128 61 -190 76 -342 81 -115 5 -141 3 -201 -16 -114 -34 -167 -103 -125 -159 11 -15 37 -37 59 -49 52 -30 240 -89 334 -105 102 -17 356 -17 449 1 l74 15 49 -55 c67 -75 133 -175 176 -267 33 -70 37 -85 37 -163 0 -78 -2 -89 -27 -122 -16 -20 -53 -48 -85 -64 -55 -27 -64 -28 -198 -28 -145 0 -184 8 -345 66 -194 71 -407 241 -518 414 -151 234 -171 410 -152 1340 4 223 3 256 -13 301 -37 107 -122 196 -225 235 -71 26 -176 37 -187 19 -12 -19 23 -40 64 -40 69 0 161 -41 217 -96 57 -57 104 -160 104 -227 0 -39 -17 -49 -39 -24 -6 8 -35 19 -64 26 -103 23 -199 -28 -248 -133 -59 -124 -18 -252 87 -274 60 -13 151 6 196 40 18 14 37 26 42 27 6 0 10 -131 11 -337 2 -555 40 -725 211 -949 208 -272 589 -458 899 -440 163 10 250 52 298 146 64 128 4 322 -165 534 -32 39 -58 75 -58 80 0 4 10 12 23 17 12 5 56 23 99 40 222 90 465 318 620 583 130 221 234 512 257 716 20 186 -46 322 -179 366 -48 16 -166 26 -215 19z m-1854 -495 c30 -12 55 -50 64 -99 9 -50 -36 -135 -92 -174 -34 -23 -53 -29 -102 -30 -53 -1 -64 2 -87 26 -38 37 -44 107 -14 175 45 104 128 141 231 102z m759 -1010 c92 -23 220 -84 294 -139 100 -73 76 -85 -169 -85 -189 1 -281 15 -424 66 -113 39 -145 59 -149 91 -5 38 38 61 173 92 38 9 200 -6 275 -25z"/></g></svg>`;

function emailHeader(subtitle?: string): string {
  return `<div style="padding:20px 28px 14px;border-bottom:1px solid #eee;text-align:center;background:#ffffff;">
      ${EMAIL_LOGO_SVG}
      <p style="font-size:11px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:6px 0 2px;font-family:'Segoe UI',Arial,sans-serif;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
      <p style="color:#888;font-size:11px;margin:0;font-family:'Segoe UI',Arial,sans-serif;">لوسيرن بوتيك${subtitle ? ` · ${subtitle}` : ""}</p>
    </div>`;
}

function getAdminEmail() {
  const sender = getSenderEmail() || "lucernebq@gmail.com";
  const extra = (process.env.ADMIN_EMAIL || "").trim();
  if (extra && extra.toLowerCase() !== sender.toLowerCase()) {
    return `${sender}, ${extra}`;
  }
  return sender;
}

export async function sendVerificationEmail(
  to: string,
  code: string,
): Promise<void> {
  const t = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #fafafa; border: 1px solid #eee;">
      ${EMAIL_LOGO_SVG}
      <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
      <p style="text-align:center;color:#888;font-size:11px;margin:0 0 20px;">لوسيرن بوتيك</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 30px;" />
      <p style="font-size: 15px; color: #333;">Your verification code is:</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; letter-spacing: 8px; font-weight: bold; color: #111;">${code}</span>
      </div>
      <p style="font-size: 13px; color: #888;">This code will be used to verify your email address. If you did not request this, please ignore this email.</p>
    </div>
  `;

  if (!t) {
    console.log(
      `[email] FALLBACK — Verification code for ${redactEmail(to)}: ${code}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to,
      subject: "Verify your email - Lucerne Boutique",
      html,
    });
    console.log(`[email] Verification email sent to ${redactEmail(to)}`);
  } catch (err) {
    console.error("[email] Failed to send email:", err);
    console.log(
      `[email] FALLBACK — Verification code for ${redactEmail(to)}: ${code}`,
    );
  }
}

export async function sendSignupVerificationCode(
  to: string,
  code: string,
): Promise<void> {
  const t = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #fafafa; border: 1px solid #eee;">
      ${EMAIL_LOGO_SVG}
      <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
      <p style="text-align:center;color:#888;font-size:11px;margin:0 0 20px;">لوسيرن بوتيك</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 30px;" />
      <p style="font-size: 15px; color: #333; text-align: center;">أدخلي هذا الرمز لتأكيد بريدك الإلكتروني</p>
      <p style="font-size: 13px; color: #888; text-align: center; margin-bottom: 20px;">Enter this code to verify your email address</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="font-size: 40px; letter-spacing: 10px; font-weight: bold; color: #111;">${code}</span>
      </div>
      <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 20px;">الرمز صالح لمدة 15 دقيقة · This code expires in 15 minutes</p>
    </div>
  `;

  if (!t) {
    console.log(
      `[email] FALLBACK — Signup verification code for ${redactEmail(to)}: ${code}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to,
      subject: "Verify your email — Lucerne Boutique | تأكيد البريد الإلكتروني",
      html,
    });
    console.log(`[email] Signup verification email sent to ${redactEmail(to)}`);
  } catch (err) {
    console.error("[email] Failed to send signup code:", err);
    console.log(
      `[email] FALLBACK — Signup code for ${redactEmail(to)}: ${code}`,
    );
  }
}

export async function sendPasswordResetCode(
  to: string,
  code: string,
): Promise<void> {
  const t = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #fafafa; border: 1px solid #eee;">
      ${EMAIL_LOGO_SVG}
      <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
      <p style="text-align:center;color:#888;font-size:11px;margin:0 0 20px;">لوسيرن بوتيك</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 30px;" />
      <p style="font-size: 15px; color: #333;">رمز إعادة تعيين كلمة المرور / Your password reset code:</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; letter-spacing: 8px; font-weight: bold; color: #111;">${code}</span>
      </div>
      <p style="font-size: 13px; color: #888;">This code expires in 15 minutes. If you did not request a password reset, please ignore this email.</p>
    </div>
  `;

  if (!t) {
    console.log(
      `[email] FALLBACK — Password reset code for ${redactEmail(to)}: ${code}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to,
      subject: "Reset your password - Lucerne Boutique",
      html,
    });
    console.log(`[email] Password reset email sent to ${redactEmail(to)}`);
  } catch (err) {
    console.error("[email] Failed to send reset code:", err);
    console.log(
      `[email] FALLBACK — Password reset code for ${redactEmail(to)}: ${code}`,
    );
  }
}

export async function sendOrderNotification(orderDetails: {
  orderId: number;
  customerName: string;
  phone: string;
  address: string;
  city: string;
  totalAmount: string;
  paymentMethod: string;
  items: {
    name: string;
    quantity: number;
    price: string;
    size?: string | null;
    color?: string | null;
  }[];
}): Promise<void> {
  const t = getTransporter();
  const adminEmail = getAdminEmail();

  const itemsHtml = orderDetails.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${esc(item.name)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${esc(item.quantity)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${esc(item.size || "-")} / ${esc(item.color || "-")}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: end;">₪${esc(item.price)}</td>
    </tr>
  `,
    )
    .join("");

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #fafafa; border: 1px solid #eee;">
      ${EMAIL_LOGO_SVG}
      <p style="font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
      <p style="color:#888;font-size:11px;margin:0 0 16px;">طلب جديد — New Order</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 20px;" />
      <h2 style="font-size: 16px;">Order #${esc(orderDetails.orderId)}</h2>
      <table style="width: 100%; font-size: 14px; margin-bottom: 16px;">
        <tr><td style="color: #888; padding: 4px 0;">Customer:</td><td>${esc(orderDetails.customerName)}</td></tr>
        <tr><td style="color: #888; padding: 4px 0;">Phone:</td><td>${esc(orderDetails.phone)}</td></tr>
        <tr><td style="color: #888; padding: 4px 0;">Address:</td><td>${esc(orderDetails.address)}, ${esc(orderDetails.city)}</td></tr>
        <tr><td style="color: #888; padding: 4px 0;">Payment:</td><td>${esc(orderDetails.paymentMethod)}</td></tr>
      </table>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding: 8px; text-align: start;">Product</th>
            <th style="padding: 8px; text-align: center;">Qty</th>
            <th style="padding: 8px; text-align: start;">Size/Color</th>
            <th style="padding: 8px; text-align: end;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="text-align: end; font-size: 18px; font-weight: bold; padding: 12px 0; border-top: 2px solid #333;">
        Total: ₪${orderDetails.totalAmount}
      </div>
    </div>
  `;

  if (!t) {
    console.log(
      `[email] FALLBACK — Order notification for order #${orderDetails.orderId} — Total: ₪${orderDetails.totalAmount}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to: adminEmail,
      subject: `New Order #${orderDetails.orderId} — ₪${orderDetails.totalAmount}`,
      html,
    });
    console.log(
      `[email] Order notification #${orderDetails.orderId} sent to admin`,
    );
  } catch (err) {
    console.error("[email] Failed to send order notification:", err);
    console.log(
      `[email] FALLBACK — Order #${orderDetails.orderId} notification failed`,
    );
  }
}

export async function sendOrderConfirmationToCustomer(
  customerEmail: string,
  orderDetails: {
    orderId: number;
    customerName: string;
    phone: string;
    address: string;
    city: string;
    totalAmount: string;
    shippingCost: string;
    shippingRegion: string;
    paymentMethod: string;
    items: {
      name: string;
      quantity: number;
      price: string;
      size?: string | null;
      color?: string | null;
    }[];
  },
): Promise<void> {
  // Phone-only signups have a fake @phone.lucerne address in this field —
  // never a real inbox, so there's nothing to send to.
  if (isPlaceholderEmail(customerEmail)) return;
  // ADMIN_EMAIL / EMPLOYEE_EMAIL are test/placeholder addresses used to log
  // in as staff — if the admin or employee places an order themselves,
  // don't send a customer confirmation to that address.
  if (isStaffEmail(customerEmail)) {
    console.log(
      `[email] Skipping order confirmation for order #${orderDetails.orderId} — recipient is a staff (admin/employee) email`,
    );
    return;
  }
  const t = getTransporter();

  const subtotal = orderDetails.items.reduce(
    (acc, item) => acc + Number(item.price) * item.quantity,
    0,
  );

  const itemsHtml = orderDetails.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${esc(item.name)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${esc(item.quantity)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${esc(item.size || "-")} / ${esc(item.color || "-")}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: end;">₪${(Number(item.price) * item.quantity).toFixed(2)}</td>
    </tr>
  `,
    )
    .join("");

  const regionNames: Record<string, string> = {
    westBank: "الضفة الغربية",
    jerusalem: "القدس",
    interior: "الداخل",
  };

  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #fafafa; border: 1px solid #eee;">
      ${EMAIL_LOGO_SVG}
      <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
      <p style="text-align:center;color:#888;font-size:11px;margin:0 0 16px;">لوسيرن بوتيك</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 20px;" />

      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="font-size: 18px; color: #333; margin-bottom: 4px;">تم استلام طلبك بنجاح!</h2>
        <p style="font-size: 14px; color: #888;">رقم الطلب: <strong style="color: #333;">#${orderDetails.orderId.toString().padStart(6, "0")}</strong></p>
        <p style="font-size: 13px; color: #888;">الحالة: <strong style="color: #D4A574;">بالانتظار</strong></p>
      </div>

      <table style="width: 100%; font-size: 14px; margin-bottom: 16px; border-collapse: collapse;">
        <tr><td style="color: #888; padding: 6px 0;">الاسم:</td><td style="text-align: start;">${esc(orderDetails.customerName)}</td></tr>
        <tr><td style="color: #888; padding: 6px 0;">الهاتف:</td><td style="text-align: start;">${esc(orderDetails.phone)}</td></tr>
        <tr><td style="color: #888; padding: 6px 0;">العنوان:</td><td style="text-align: start;">${esc(orderDetails.address)}, ${esc(orderDetails.city)}</td></tr>
        <tr><td style="color: #888; padding: 6px 0;">المنطقة:</td><td style="text-align: start;">${esc(regionNames[orderDetails.shippingRegion] || orderDetails.shippingRegion)}</td></tr>
        <tr><td style="color: #888; padding: 6px 0;">طريقة الدفع:</td><td style="text-align: start;">${esc(orderDetails.paymentMethod)}</td></tr>
      </table>

      <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding: 10px; text-align: start;">المنتج</th>
            <th style="padding: 10px; text-align: center;">الكمية</th>
            <th style="padding: 10px; text-align: start;">المقاس/اللون</th>
            <th style="padding: 10px; text-align: end;">السعر</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="border-top: 1px solid #ddd; padding-top: 12px; font-size: 14px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: #888;">المجموع الفرعي:</span>
          <span>₪${subtotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: #888;">الشحن (${regionNames[orderDetails.shippingRegion] || orderDetails.shippingRegion}):</span>
          <span>₪${Number(orderDetails.shippingCost).toFixed(2)}</span>
        </div>
      </div>
      <div style="text-align: end; font-size: 20px; font-weight: bold; padding: 14px 0; border-top: 2px solid #333;">
        الإجمالي: ₪${orderDetails.totalAmount}
      </div>

      <p style="text-align: center; font-size: 12px; color: #aaa; margin-top: 20px;">شكراً لتسوقك من لوسيرن بوتيك ♥</p>
    </div>
  `;

  if (!t) {
    console.log(
      `[email] FALLBACK — Order confirmation for order #${orderDetails.orderId}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to: customerEmail,
      subject: `تأكيد طلبك #${orderDetails.orderId.toString().padStart(6, "0")} — Lucerne Boutique`,
      html,
    });
    console.log(
      `[email] Order confirmation #${orderDetails.orderId} sent to ${redactEmail(customerEmail)}`,
    );
  } catch (err) {
    console.error("[email] Failed to send order confirmation:", err);
    console.log(
      `[email] FALLBACK — Order confirmation #${orderDetails.orderId} failed`,
    );
  }
}

export async function sendExchangeStatusEmail(
  customerEmail: string,
  details: {
    status: "approved" | "denied";
    orderRef: string;
    productName: string;
    adminNote?: string | null;
    preferredSize?: string | null;
    preferredColor?: string | null;
  },
): Promise<void> {
  // Phone-only signups have a fake @phone.lucerne address — skip it.
  if (isPlaceholderEmail(customerEmail)) return;
  const t = getTransporter();

  const isApproved = details.status === "approved";

  const statusColorEn = isApproved ? "#16a34a" : "#dc2626";
  const statusColorAr = isApproved ? "#16a34a" : "#dc2626";
  const statusTextEn = isApproved ? "Approved ✓" : "Denied ✗";
  const statusTextAr = isApproved ? "تمت الموافقة ✓" : "مرفوض ✗";

  const sizeColorRowEn =
    details.preferredSize || details.preferredColor
      ? `<tr><td style="color:#888;padding:4px 0;">Requested:</td><td>${esc(details.preferredSize || "")}${details.preferredColor ? ` / ${esc(details.preferredColor)}` : ""}</td></tr>`
      : "";
  const sizeColorRowAr =
    details.preferredSize || details.preferredColor
      ? `<tr><td style="color:#888;padding:4px 0;">المطلوب:</td><td>${esc(details.preferredSize || "")}${details.preferredColor ? ` / ${esc(details.preferredColor)}` : ""}</td></tr>`
      : "";

  const noteBlockEn = details.adminNote
    ? `<div style="margin:16px 0;padding:12px 16px;background:#f5f5f5;border-inline-start:3px solid #aaa;font-size:13px;color:#444;"><strong>Admin note:</strong> ${esc(details.adminNote)}</div>`
    : "";
  const noteBlockAr = details.adminNote
    ? `<div style="margin:16px 0;padding:12px 16px;background:#f5f5f5;border-inline-start:3px solid #aaa;font-size:13px;color:#444;"><strong>ملاحظة الإدارة:</strong> ${esc(details.adminNote)}</div>`
    : "";

  const bodyEn = isApproved
    ? `Your exchange request has been <strong style="color:${statusColorEn}">approved</strong>. A new replacement order has been created for you. You can track it from your profile.`
    : `Your exchange request has been <strong style="color:${statusColorEn}">denied</strong>. Please contact us if you have any questions.`;
  const bodyAr = isApproved
    ? `تمت <strong style="color:${statusColorAr}">الموافقة</strong> على طلب الاستبدال الخاص بك. تم إنشاء طلب استبدال جديد لك، يمكنك تتبعه من ملفك الشخصي.`
    : `تم <strong style="color:${statusColorAr}">رفض</strong> طلب الاستبدال الخاص بك. يرجى التواصل معنا إذا كان لديك أي استفسار.`;

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;background:#fafafa;">
      <!-- Header -->
      <div style="padding:28px 30px 20px;border-bottom:1px solid #eee;">
        ${EMAIL_LOGO_SVG}
        <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
        <p style="text-align:center;color:#888;font-size:11px;margin:0;">لوسيرن بوتيك</p>
      </div>
      <!-- Status badge -->
      <div style="padding:24px 30px 0;text-align:center;">
        <span style="display:inline-block;padding:6px 20px;border-radius:20px;background:${isApproved ? "#dcfce7" : "#fee2e2"};color:${statusColorEn};font-weight:700;font-size:14px;letter-spacing:1px;">
          ${statusTextEn} &nbsp;·&nbsp; ${statusTextAr}
        </span>
      </div>
      <!-- English body -->
      <div style="padding:20px 30px 0;">
        <h2 style="font-size:15px;margin:0 0 8px;">Exchange Request Update</h2>
        <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 12px;">${bodyEn}</p>
        <table style="font-size:13px;width:100%;border-collapse:collapse;">
          <tr><td style="color:#888;padding:4px 0;">Order:</td><td><strong>${esc(details.orderRef)}</strong></td></tr>
          <tr><td style="color:#888;padding:4px 0;">Product:</td><td>${esc(details.productName)}</td></tr>
          ${sizeColorRowEn}
        </table>
        ${noteBlockEn}
      </div>
      <!-- Divider -->
      <div style="margin:20px 30px;border-top:1px solid #ddd;"></div>
      <!-- Arabic body -->
      <div dir="rtl" style="padding:0 30px 20px;">
        <h2 style="font-size:15px;margin:0 0 8px;">تحديث طلب الاستبدال</h2>
        <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 12px;">${bodyAr}</p>
        <table style="font-size:13px;width:100%;border-collapse:collapse;">
          <tr><td style="color:#888;padding:4px 0;">رقم الطلب:</td><td><strong>${esc(details.orderRef)}</strong></td></tr>
          <tr><td style="color:#888;padding:4px 0;">المنتج:</td><td>${esc(details.productName)}</td></tr>
          ${sizeColorRowAr}
        </table>
        ${noteBlockAr}
      </div>
      <!-- Footer -->
      <div style="padding:14px 30px;background:#f0f0f0;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#aaa;">
        شكراً لتسوقك من لوسيرن بوتيك ♥ · Thank you for shopping at Lucerne Boutique
      </div>
    </div>
  `;

  const subjectEn = isApproved
    ? `Exchange Approved — Order ${details.orderRef}`
    : `Exchange Request Update — Order ${details.orderRef}`;

  if (!t) {
    console.log(
      `[email] FALLBACK — Exchange ${details.status} email for order ${details.orderRef}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to: customerEmail,
      subject: subjectEn,
      html,
    });
    console.log(
      `[email] Exchange ${details.status} email sent to ${redactEmail(customerEmail)} for order ${details.orderRef}`,
    );
  } catch (err) {
    console.error("[email] Failed to send exchange status email:", err);
    console.log(
      `[email] FALLBACK — Exchange ${details.status} email for ${redactEmail(customerEmail)} failed`,
    );
  }
}

/* ── Exchange request admin notification ─────────────────── */
export async function sendExchangeAdminNotification(details: {
  customerName: string;
  customerEmail: string;
  orderId: number;
  productName: string;
  preferredSize?: string | null;
  preferredColor?: string | null;
  reason: string;
}): Promise<void> {
  const t = getTransporter();
  const to = "lucernebq@gmail.com";

  const sizeColorRow =
    details.preferredSize || details.preferredColor
      ? `<tr><td style="color:#888;padding:4px 8px 4px 0;">المقاس / اللون:</td><td>${esc(details.preferredSize || "")}${details.preferredColor ? ` / ${esc(details.preferredColor)}` : ""}</td></tr>`
      : "";

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;background:#fafafa;">
      <div style="padding:24px 28px 18px;border-bottom:1px solid #eee;">
        ${EMAIL_LOGO_SVG}
        <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
        <p style="text-align:center;color:#888;font-size:11px;margin:0;">لوسيرن بوتيك</p>
      </div>
      <div style="padding:20px 28px;">
        <div style="display:inline-block;padding:5px 16px;border-radius:20px;background:#fef3c7;color:#92400e;font-size:13px;font-weight:700;margin-bottom:16px;">
          🔄 طلب استبدال جديد — New Exchange Request
        </div>
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="color:#888;padding:4px 8px 4px 0;">العميل:</td><td>${esc(details.customerName)}</td></tr>
          <tr><td style="color:#888;padding:4px 8px 4px 0;">البريد:</td><td>${esc(details.customerEmail)}</td></tr>
          <tr><td style="color:#888;padding:4px 8px 4px 0;">رقم الطلب:</td><td><strong>#${String(details.orderId).padStart(6, "0")}</strong></td></tr>
          <tr><td style="color:#888;padding:4px 8px 4px 0;">المنتج:</td><td>${esc(details.productName)}</td></tr>
          ${sizeColorRow}
        </table>
        <div style="margin:14px 0 0;padding:12px 14px;background:#f5f5f5;border-inline-start:3px solid #d97706;font-size:13px;color:#444;border-radius:2px;">
          <strong>سبب الاستبدال:</strong><br/>${esc(details.reason)}
        </div>
        <p style="margin-top:20px;font-size:13px;color:#888;">يمكنك مراجعة الطلب من لوحة التحكم ← الاستبدالات.</p>
      </div>
      <div style="padding:12px 28px;background:#f0f0f0;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#aaa;">
        Lucerne Boutique — Admin Notification
      </div>
    </div>
  `;

  if (!t) {
    console.log(
      `[email] FALLBACK — Exchange admin notification for order #${details.orderId}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to,
      subject: `طلب استبدال جديد — طلب #${String(details.orderId).padStart(6, "0")} من ${details.customerName}`,
      html,
    });
    console.log(
      `[email] Exchange admin notification sent for order #${details.orderId}`,
    );
  } catch (err) {
    console.error("[email] Failed to send exchange admin notification:", err);
  }
}

/* ── Abandoned cart email to customer ───────────────────── */
export async function sendAbandonedCartEmail(
  to: string,
  customerName: string,
): Promise<void> {
  // Phone-only signups have a fake @phone.lucerne address — skip it.
  if (isPlaceholderEmail(to)) return;
  const t = getTransporter();

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;background:#fafafa;">
      <div style="padding:24px 28px 18px;border-bottom:1px solid #eee;text-align:center;">
        ${EMAIL_LOGO_SVG}
        <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
        <p style="color:#888;font-size:11px;margin:0;text-align:center;">لوسيرن بوتيك</p>
      </div>
      <div dir="rtl" style="padding:24px 28px;">
        <p style="font-size:16px;color:#333;margin:0 0 10px;">مرحباً ${esc(customerName)} 🛍️</p>
        <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 16px;">
          لاحظنا أن لديكِ منتجات في سلتك تنتظر إتمام الطلب.<br/>
          لا تفوّتي الفرصة — المنتجات محدودة الكمية!
        </p>
        <div style="text-align:center;margin:20px 0;">
          <a href="https://lucerne-boutique.com/cart" style="display:inline-block;padding:12px 32px;background:#111;color:#fff;text-decoration:none;font-size:14px;border-radius:4px;letter-spacing:1px;">
            إتمام الطلب
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
        <p style="font-size:13px;color:#888;text-align:center;direction:ltr;">
          Your cart is waiting! Complete your order before items sell out.
        </p>
      </div>
      <div style="padding:12px 28px;background:#f0f0f0;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#aaa;">
        شكراً لتسوقك من لوسيرن بوتيك ♥ · Thank you for shopping at Lucerne Boutique
      </div>
    </div>
  `;

  if (!t) {
    console.log(
      `[email] FALLBACK — Abandoned cart email to ${redactEmail(to)}`,
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to,
      subject: "🛍️ سلتك تنتظرك! — Your cart is waiting",
      html,
    });
    console.log(`[email] Abandoned cart email sent to ${redactEmail(to)}`);
  } catch (err) {
    console.error("[email] Failed to send abandoned cart email:", err);
  }
}

/* ── Sale / discount blast email to customers ────────────── */
export async function sendSaleDiscountEmail(
  recipients: { email: string; name: string }[],
  details: {
    discountPercent: number;
    categoryMention?: string | null;
  },
): Promise<void> {
  // Drop phone-signup placeholder addresses — they can never receive mail.
  recipients = recipients.filter((r) => !isPlaceholderEmail(r.email));
  if (recipients.length === 0) return;
  const t = getTransporter();

  const categoryBlock = details.categoryMention
    ? `<p style="font-size:14px;color:#555;margin:0 0 8px;">
        الخصم يشمل: <strong>${esc(details.categoryMention)}</strong><br/>
        <span style="font-size:13px;color:#888;">Applies to: ${esc(details.categoryMention)}</span>
      </p>`
    : "";

  for (const recipient of recipients) {
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;background:#fafafa;">
        <div style="padding:24px 28px 18px;border-bottom:1px solid #eee;text-align:center;">
          ${EMAIL_LOGO_SVG}
          <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
          <p style="color:#888;font-size:11px;margin:0;text-align:center;">لوسيرن بوتيك</p>
        </div>
        <div style="padding:20px 28px;text-align:center;">
          <div style="display:inline-block;font-size:42px;font-weight:900;color:#111;letter-spacing:2px;margin-bottom:4px;">
            ${details.discountPercent}%
          </div>
          <div style="font-size:18px;color:#888;margin-bottom:16px;">خصم خاص · Special Discount</div>
        </div>
        <div dir="rtl" style="padding:0 28px 20px;">
          <p style="font-size:16px;color:#333;margin:0 0 10px;">مرحباً ${esc(recipient.name)},</p>
          <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 12px;">
            يسعدنا إخبارك بعرض خاص — خصم <strong>${details.discountPercent}%</strong> على تشكيلتنا المميزة!
          </p>
          ${categoryBlock}
          <div style="text-align:center;margin:20px 0;">
            <a href="https://lucerne-boutique.com" style="display:inline-block;padding:12px 32px;background:#111;color:#fff;text-decoration:none;font-size:14px;border-radius:4px;letter-spacing:1px;">
              تسوقي الآن
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;"/>
          <p style="font-size:13px;color:#888;text-align:center;direction:ltr;">
            Enjoy ${details.discountPercent}% off${details.categoryMention ? ` on ${details.categoryMention}` : ""}. Shop now before the offer ends!
          </p>
        </div>
        <div style="padding:12px 28px;background:#f0f0f0;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#aaa;">
          شكراً لتسوقك من لوسيرن بوتيك ♥ · Thank you for shopping at Lucerne Boutique
        </div>
      </div>
    `;

    if (!t) {
      console.log(
        `[email] FALLBACK — Sale email to ${redactEmail(recipient.email)}`,
      );
      continue;
    }

    try {
      await t.sendMail({
        from: `"Lucerne Boutique" <${getSenderEmail()}>`,
        to: recipient.email,
        subject: `خصم ${details.discountPercent}%${details.categoryMention ? ` على ${details.categoryMention}` : ""} — Lucerne Boutique`,
        html,
        text: `مرحباً ${recipient.name},\n\nيسعدنا إخبارك بعرض خاص — خصم ${details.discountPercent}% على تشكيلتنا المميزة!\n\nتسوقي الآن: https://lucerne-boutique.com\n\n--\nLucerne Boutique · لوسيرن بوتيك`,
        headers: {
          "List-Unsubscribe": `<mailto:${getSenderEmail()}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "Precedence": "bulk",
          "X-Mailer": "Lucerne Boutique Mailer",
        },
      });
      console.log(`[email] Sale email sent to ${redactEmail(recipient.email)}`);
    } catch (err) {
      console.error(
        `[email] Failed to send sale email to ${redactEmail(recipient.email)}:`,
        err,
      );
    }
  }
}

/* ── Discount code blast email to customers ──────────────── */
export async function sendDiscountCodeEmail(
  recipients: { email: string; name: string }[],
  details: {
    code: string;
    discountPercent: number;
    restrictionLabel?: string | null;
    expiresAt?: Date | null;
    maxUses?: number | null;
    usedCount?: number;
  },
): Promise<void> {
  // Drop phone-signup placeholder addresses — they can never receive mail.
  recipients = recipients.filter((r) => !isPlaceholderEmail(r.email));
  if (recipients.length === 0) return;
  const t = getTransporter();

  const remaining =
    details.maxUses != null
      ? Math.max(0, details.maxUses - (details.usedCount ?? 0))
      : null;

  const expiryStr = details.expiresAt
    ? details.expiresAt.toLocaleString("ar-SA", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const restrictionBlock = details.restrictionLabel
    ? `<p style="margin:6px 0 0;font-size:13px;color:#666;">
        🏷️ ينطبق على: <strong>${esc(details.restrictionLabel)}</strong><br/>
        <span style="direction:ltr;display:block;margin-top:2px;">Applies to: ${esc(details.restrictionLabel)}</span>
      </p>`
    : `<p style="margin:6px 0 0;font-size:13px;color:#666;">✅ صالح على جميع المنتجات · Valid on all products</p>`;

  const expiryBlock = expiryStr
    ? `<p style="margin:6px 0 0;font-size:13px;color:#d97706;">⏳ ينتهي في: <strong>${esc(expiryStr)}</strong></p>`
    : "";

  const usesBlock =
    remaining != null
      ? `<p style="margin:6px 0 0;font-size:13px;color:#666;">🎫 متبقي: <strong>${remaining}</strong> استخدام فقط · Only <strong>${remaining}</strong> uses left</p>`
      : "";

  for (const recipient of recipients) {
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;background:#fafafa;">
        <div style="padding:24px 28px 18px;border-bottom:1px solid #eee;text-align:center;">
          ${EMAIL_LOGO_SVG}
          <p style="text-align:center;font-size:10px;letter-spacing:3px;color:#1a1a1a;font-weight:700;margin:8px 0 2px;text-transform:uppercase;">LUCERNE BOUTIQUE</p>
          <p style="color:#888;font-size:11px;margin:0;text-align:center;">لوسيرن بوتيك</p>
        </div>
        <div style="padding:24px 28px 0;text-align:center;">
          <div style="display:inline-block;font-size:40px;font-weight:900;color:#111;letter-spacing:2px;margin-bottom:2px;">
            ${details.discountPercent}%
          </div>
          <div style="font-size:15px;color:#888;margin-bottom:20px;">خصم حصري · Exclusive Discount</div>
          <div style="display:inline-block;background:#111;color:#fff;font-family:monospace;font-size:22px;font-weight:900;letter-spacing:6px;padding:12px 28px;border-radius:6px;margin-bottom:20px;">
            ${esc(details.code)}
          </div>
        </div>
        <div dir="rtl" style="padding:0 28px 24px;">
          <p style="font-size:16px;color:#333;margin:0 0 14px;">مرحباً ${esc(recipient.name)} ✨</p>
          <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 4px;">
            لديكِ كود خصم خاص بك — استخدمي <strong style="font-family:monospace;letter-spacing:2px;">${esc(details.code)}</strong>
            عند إتمام طلبك للحصول على خصم <strong>${details.discountPercent}%</strong>!
          </p>
          ${restrictionBlock}
          ${expiryBlock}
          ${usesBlock}
          <div style="text-align:center;margin:24px 0;">
            <a href="https://lucerne-boutique.com" style="display:inline-block;padding:13px 36px;background:#111;color:#fff;text-decoration:none;font-size:14px;border-radius:4px;letter-spacing:1px;">
              تسوقي الآن · Shop Now
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;"/>
          <p style="font-size:12px;color:#aaa;text-align:center;direction:ltr;">
            Use code <strong>${esc(details.code)}</strong> at checkout to get ${details.discountPercent}% off.
          </p>
        </div>
        <div style="padding:12px 28px;background:#f0f0f0;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#aaa;">
          شكراً لتسوقك من لوسيرن بوتيك ♥ · Thank you for shopping at Lucerne Boutique
        </div>
      </div>
    `;

    if (!t) {
      console.log(
        `[email] FALLBACK — Discount code email to ${redactEmail(recipient.email)}`,
      );
      continue;
    }

    try {
      await t.sendMail({
        from: `"Lucerne Boutique" <${getSenderEmail()}>`,
        to: recipient.email,
        subject: `كود خصم ${details.discountPercent}% خاص بكِ · ${details.code} — Lucerne Boutique`,
        html,
        text: `مرحباً ${recipient.name},\n\nلديكِ كود خصم خاص: ${details.code}\nاستخدميه عند إتمام طلبك للحصول على خصم ${details.discountPercent}%!\n\nتسوقي الآن: https://lucerne-boutique.com\n\n--\nLucerne Boutique · لوسيرن بوتيك`,
        headers: {
          "List-Unsubscribe": `<mailto:${getSenderEmail()}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "Precedence": "bulk",
          "X-Mailer": "Lucerne Boutique Mailer",
        },
      });
      console.log(
        `[email] Discount code email sent to ${redactEmail(recipient.email)}`,
      );
    } catch (err) {
      console.error(
        `[email] Failed to send discount code email to ${redactEmail(recipient.email)}:`,
        err,
      );
    }
  }
}

/* ── Monthly database backup email ─────────────────────── */
function resolvePgDumpBin(): string {
  const candidates = [
    process.env.PG_DUMP_PATH,
    "/usr/bin/pg_dump",
    "/usr/lib/postgresql/16/bin/pg_dump",
    "/usr/lib/postgresql/15/bin/pg_dump",
    "/usr/lib/postgresql/17/bin/pg_dump",
    // Original Replit/Nix path — kept as a candidate so this still works
    // if the app is ever run back in that environment.
    "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin/pg_dump",
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "pg_dump"; // last resort — rely on PATH
}
const PG_DUMP_BIN = resolvePgDumpBin();
const BACKUP_RECIPIENT = "mohammad.adeela@gmail.com";

function pgDumpSql(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let sawData = false;
    const proc = spawn(PG_DUMP_BIN, [
      "--no-owner",
      "--no-acl",
      "--schema=public",
      "--column-inserts",
      process.env.DATABASE_URL!,
    ]);
    proc.stdout.on("data", (chunk: Buffer) => {
      sawData = true;
      chunks.push(chunk);
    });
    proc.stderr.on("data", (d: Buffer) =>
      console.error("[backup] pg_dump stderr:", d.toString()),
    );
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0 || !sawData)
        return reject(new Error(`pg_dump exited with code ${code}`));
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Pure-JS full database dump (schema + primary keys + data + sequences),
 * used when the pg_dump binary isn't available on the host. Mirrors the
 * same approach as the admin "Download SQL Backup" button's fallback so the
 * monthly email always goes out with a restorable backup either way.
 */
async function jsDumpSqlFallback(): Promise<Buffer> {
  const out: string[] = [];
  const date = new Date().toISOString();
  out.push(`-- Lucerne Boutique JS backup`);
  out.push(`-- Generated: ${date}`);
  out.push(`-- WARNING: app-level dump (no functions/triggers/extensions)`);
  out.push(``);
  out.push(`SET statement_timeout = 0;`);
  out.push(`SET client_encoding = 'UTF8';`);
  out.push(`SET standard_conforming_strings = on;`);
  out.push(``);

  const tablesRes = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
  );
  const tables: string[] = tablesRes.rows.map((r: any) => r.table_name);

  for (const t of tables) {
    const cols = await pool.query(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default,
              character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
       ORDER BY ordinal_position`,
      [t],
    );
    out.push(`DROP TABLE IF EXISTS "${t}" CASCADE;`);
    const defs = cols.rows.map((c: any) => {
      let type = c.data_type;
      if (type === "USER-DEFINED" || type === "ARRAY") type = c.udt_name;
      if (type === "character varying" && c.character_maximum_length)
        type = `varchar(${c.character_maximum_length})`;
      if (type === "numeric" && c.numeric_precision)
        type = `numeric(${c.numeric_precision}${c.numeric_scale ? "," + c.numeric_scale : ""})`;
      const nn = c.is_nullable === "NO" ? " NOT NULL" : "";
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
      return `  "${c.column_name}" ${type}${nn}${def}`;
    });
    out.push(`CREATE TABLE "${t}" (\n${defs.join(",\n")}\n);`);
    out.push(``);
  }

  const pks = await db.execute(sql`
    SELECT tc.table_name, kc.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kc
      ON kc.constraint_name = tc.constraint_name AND kc.table_schema = tc.table_schema
    WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
    ORDER BY tc.table_name, kc.ordinal_position
  `);
  const pkMap: Record<string, string[]> = {};
  for (const r of pks.rows as any[]) {
    (pkMap[r.table_name] ||= []).push(r.column_name);
  }
  for (const [tbl, cols] of Object.entries(pkMap)) {
    out.push(`ALTER TABLE "${tbl}" ADD PRIMARY KEY (${cols.map((c) => `"${c}"`).join(", ")});`);
  }
  out.push(``);

  const fmt = (v: any): string => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number" || typeof v === "bigint") return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (v instanceof Date) return `'${v.toISOString()}'`;
    if (Buffer.isBuffer(v)) return `'\\x${v.toString("hex")}'`;
    if (Array.isArray(v)) return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  for (const t of tables) {
    const r = await db.execute(sql`SELECT * FROM ${sql.identifier(t)}`);
    if (r.rows.length === 0) continue;
    const cols = r.fields.map((f: any) => `"${f.name}"`).join(", ");
    out.push(`-- Data for ${t} (${r.rows.length} rows)`);
    for (const row of r.rows as any[]) {
      const vals = r.fields.map((f: any) => fmt(row[f.name])).join(", ");
      out.push(`INSERT INTO "${t}" (${cols}) VALUES (${vals});`);
    }
    out.push(``);
  }

  for (const t of tables) {
    // Only single-column primary keys can have an associated serial
    // sequence — and not every table's PK is named "id" (e.g. the
    // session-store table's PK is "sid"), so use the real column name
    // collected in pkMap above instead of assuming "id".
    const pkCols = pkMap[t];
    if (!pkCols || pkCols.length !== 1) continue;
    const pkCol = pkCols[0];
    const seq = await pool.query(
      `SELECT pg_get_serial_sequence($1, $2) AS seq`,
      [t, pkCol],
    );
    const seqName = (seq.rows[0] as any)?.seq;
    if (seqName) {
      out.push(
        `SELECT setval('${seqName}', COALESCE((SELECT MAX("${pkCol}") FROM "${t}"), 1));`,
      );
    }
  }

  return Buffer.from(out.join("\n"), "utf-8");
}

async function generateBackupSql(): Promise<Buffer> {
  try {
    return await pgDumpSql();
  } catch (err: any) {
    console.warn(
      "[backup] pg_dump unavailable, falling back to JS dump:",
      err?.message || err,
    );
    return jsDumpSqlFallback();
  }
}

export async function sendMonthlyBackupEmail(): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log(
      "[backup] Email not configured — skipping monthly backup email",
    );
    return;
  }
  try {
    console.log("[backup] Generating monthly database backup…");
    const sqlBuffer = await generateBackupSql();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `lucerne-backup-${date}.sql`;
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to: BACKUP_RECIPIENT,
      subject: `نسخة احتياطية شهرية — Lucerne Boutique (${date})`,
      html: `
        <div dir="rtl" style="font-family:sans-serif;padding:20px;color:#333">
          <h2 style="color:#6d28d9">Lucerne Boutique — نسخة احتياطية شهرية</h2>
          <p>مرحباً،</p>
          <p>مرفق بهذا البريد النسخة الاحتياطية الشهرية لقاعدة البيانات بتاريخ <strong>${date}</strong>.</p>
          <p>يحتوي الملف على كامل بيانات المتجر بصيغة SQL قابلة للاستعادة مباشرة.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
          <p style="color:#888;font-size:12px">هذا البريد يُرسل تلقائياً في أول كل شهر.</p>
        </div>`,
      attachments: [
        { filename, content: sqlBuffer, contentType: "application/sql" },
      ],
    });
    console.log(
      `[backup] Monthly backup email sent to ${BACKUP_RECIPIENT} (${(sqlBuffer.length / 1024).toFixed(1)} KB)`,
    );
  } catch (err) {
    console.error("[backup] Failed to send monthly backup email:", err);
  }
}
