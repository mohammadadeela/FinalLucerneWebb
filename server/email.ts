import nodemailer from "nodemailer";
import { spawn } from "child_process";

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

function getTransporter() {
  if (transporter) return transporter;

  const user = (process.env.EMAIL_USER || "").trim();
  const pass = (process.env.EMAIL_PASS || "").trim();

  if (!user || !pass) {
    console.log("[email] EMAIL_USER or EMAIL_PASS not set — emails will be logged to console");
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

function getAdminEmail() {
  const sender = getSenderEmail() || "lucernebq@gmail.com";
  const extra = (process.env.ADMIN_EMAIL || "").trim();
  if (extra && extra.toLowerCase() !== sender.toLowerCase()) {
    return `${sender}, ${extra}`;
  }
  return sender;
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const t = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #fafafa; border: 1px solid #eee;">
      <h1 style="text-align: center; font-size: 24px; letter-spacing: 4px; margin-bottom: 8px;">LUCERNE BOUTIQUE</h1>
      <p style="text-align: center; color: #888; font-size: 13px; margin-bottom: 30px;">لوسيرن بوتيك</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 30px;" />
      <p style="font-size: 15px; color: #333;">Your verification code is:</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; letter-spacing: 8px; font-weight: bold; color: #111;">${code}</span>
      </div>
      <p style="font-size: 13px; color: #888;">This code will be used to verify your email address. If you did not request this, please ignore this email.</p>
    </div>
  `;

  if (!t) {
    console.log(`[email] FALLBACK — Verification code for ${redactEmail(to)}: ${code}`);
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
    console.log(`[email] FALLBACK — Verification code for ${redactEmail(to)}: ${code}`);
  }
}

export async function sendSignupVerificationCode(to: string, code: string): Promise<void> {
  const t = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #fafafa; border: 1px solid #eee;">
      <h1 style="text-align: center; font-size: 24px; letter-spacing: 4px; margin-bottom: 8px;">LUCERNE BOUTIQUE</h1>
      <p style="text-align: center; color: #888; font-size: 13px; margin-bottom: 30px;">لوسيرن بوتيك</p>
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
    console.log(`[email] FALLBACK — Signup verification code for ${redactEmail(to)}: ${code}`);
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
    console.log(`[email] FALLBACK — Signup code for ${redactEmail(to)}: ${code}`);
  }
}

export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  const t = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #fafafa; border: 1px solid #eee;">
      <h1 style="text-align: center; font-size: 24px; letter-spacing: 4px; margin-bottom: 8px;">LUCERNE BOUTIQUE</h1>
      <p style="text-align: center; color: #888; font-size: 13px; margin-bottom: 30px;">لوسيرن بوتيك</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 30px;" />
      <p style="font-size: 15px; color: #333;">رمز إعادة تعيين كلمة المرور / Your password reset code:</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; letter-spacing: 8px; font-weight: bold; color: #111;">${code}</span>
      </div>
      <p style="font-size: 13px; color: #888;">This code expires in 15 minutes. If you did not request a password reset, please ignore this email.</p>
    </div>
  `;

  if (!t) {
    console.log(`[email] FALLBACK — Password reset code for ${redactEmail(to)}: ${code}`);
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
    console.log(`[email] FALLBACK — Password reset code for ${redactEmail(to)}: ${code}`);
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
  items: { name: string; quantity: number; price: string; size?: string | null; color?: string | null }[];
}): Promise<void> {
  const t = getTransporter();
  const adminEmail = getAdminEmail();

  const itemsHtml = orderDetails.items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${esc(item.name)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${esc(item.quantity)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${esc(item.size || "-")} / ${esc(item.color || "-")}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: end;">₪${esc(item.price)}</td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #fafafa; border: 1px solid #eee;">
      <h1 style="font-size: 20px; letter-spacing: 3px; margin-bottom: 4px;">LUCERNE BOUTIQUE</h1>
      <p style="color: #888; font-size: 12px; margin-bottom: 20px;">طلب جديد — New Order</p>
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
    console.log(`[email] FALLBACK — Order notification for order #${orderDetails.orderId} — Total: ₪${orderDetails.totalAmount}`);
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to: adminEmail,
      subject: `New Order #${orderDetails.orderId} — ₪${orderDetails.totalAmount}`,
      html,
    });
    console.log(`[email] Order notification #${orderDetails.orderId} sent to admin`);
  } catch (err) {
    console.error("[email] Failed to send order notification:", err);
    console.log(`[email] FALLBACK — Order #${orderDetails.orderId} notification failed`);
  }
}

export async function sendOrderConfirmationToCustomer(customerEmail: string, orderDetails: {
  orderId: number;
  customerName: string;
  phone: string;
  address: string;
  city: string;
  totalAmount: string;
  shippingCost: string;
  shippingRegion: string;
  paymentMethod: string;
  items: { name: string; quantity: number; price: string; size?: string | null; color?: string | null }[];
}): Promise<void> {
  const t = getTransporter();

  const subtotal = orderDetails.items.reduce((acc, item) => acc + (Number(item.price) * item.quantity), 0);

  const itemsHtml = orderDetails.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${esc(item.name)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${esc(item.quantity)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${esc(item.size || "-")} / ${esc(item.color || "-")}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: end;">₪${(Number(item.price) * item.quantity).toFixed(2)}</td>
    </tr>
  `).join("");

  const regionNames: Record<string, string> = {
    westBank: "الضفة الغربية",
    jerusalem: "القدس",
    interior: "الداخل",
  };

  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #fafafa; border: 1px solid #eee;">
      <h1 style="text-align: center; font-size: 22px; letter-spacing: 4px; margin-bottom: 8px;">LUCERNE BOUTIQUE</h1>
      <p style="text-align: center; color: #888; font-size: 13px; margin-bottom: 20px;">لوسيرن بوتيك</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 20px;" />

      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="font-size: 18px; color: #333; margin-bottom: 4px;">تم استلام طلبك بنجاح!</h2>
        <p style="font-size: 14px; color: #888;">رقم الطلب: <strong style="color: #333;">#${orderDetails.orderId.toString().padStart(6, '0')}</strong></p>
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
    console.log(`[email] FALLBACK — Order confirmation for order #${orderDetails.orderId}`);
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to: customerEmail,
      subject: `تأكيد طلبك #${orderDetails.orderId.toString().padStart(6, '0')} — Lucerne Boutique`,
      html,
    });
    console.log(`[email] Order confirmation #${orderDetails.orderId} sent to ${redactEmail(customerEmail)}`);
  } catch (err) {
    console.error("[email] Failed to send order confirmation:", err);
    console.log(`[email] FALLBACK — Order confirmation #${orderDetails.orderId} failed`);
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
  }
): Promise<void> {
  const t = getTransporter();

  const isApproved = details.status === "approved";

  const statusColorEn = isApproved ? "#16a34a" : "#dc2626";
  const statusColorAr = isApproved ? "#16a34a" : "#dc2626";
  const statusTextEn = isApproved ? "Approved ✓" : "Denied ✗";
  const statusTextAr = isApproved ? "تمت الموافقة ✓" : "مرفوض ✗";

  const sizeColorRowEn = (details.preferredSize || details.preferredColor)
    ? `<tr><td style="color:#888;padding:4px 0;">Requested:</td><td>${esc(details.preferredSize || "")}${details.preferredColor ? ` / ${esc(details.preferredColor)}` : ""}</td></tr>`
    : "";
  const sizeColorRowAr = (details.preferredSize || details.preferredColor)
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
        <h1 style="text-align:center;font-size:20px;letter-spacing:4px;margin:0 0 4px;">LUCERNE BOUTIQUE</h1>
        <p style="text-align:center;color:#888;font-size:12px;margin:0;">لوسيرن بوتيك</p>
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
    console.log(`[email] FALLBACK — Exchange ${details.status} email for order ${details.orderRef}`);
    return;
  }

  try {
    await t.sendMail({
      from: `"Lucerne Boutique" <${getSenderEmail()}>`,
      to: customerEmail,
      subject: subjectEn,
      html,
    });
    console.log(`[email] Exchange ${details.status} email sent to ${redactEmail(customerEmail)} for order ${details.orderRef}`);
  } catch (err) {
    console.error("[email] Failed to send exchange status email:", err);
    console.log(`[email] FALLBACK — Exchange ${details.status} email for ${redactEmail(customerEmail)} failed`);
  }
}

/* ── Monthly database backup email ─────────────────────── */
const PG_DUMP_BIN = "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin/pg_dump";
const BACKUP_RECIPIENT = "lucernebq@gmail.com";

function generateBackupSql(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(PG_DUMP_BIN, [
      "--no-owner",
      "--no-acl",
      "--schema=public",
      "--column-inserts",
      process.env.DATABASE_URL!,
    ]);
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (d: Buffer) => console.error("[backup] pg_dump stderr:", d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`pg_dump exited with code ${code}`));
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function sendMonthlyBackupEmail(): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log("[backup] Email not configured — skipping monthly backup email");
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
      attachments: [{ filename, content: sqlBuffer, contentType: "application/sql" }],
    });
    console.log(`[backup] Monthly backup email sent to ${BACKUP_RECIPIENT} (${(sqlBuffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error("[backup] Failed to send monthly backup email:", err);
  }
}
