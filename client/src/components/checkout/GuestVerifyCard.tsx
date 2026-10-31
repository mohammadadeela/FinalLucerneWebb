import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Mail, MessageSquareText, PencilLine, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useLanguage } from "@/i18n";
import { normalizeArabicDigits } from "@/lib/digits";
import { clearPending, loadPending, savePending } from "@/lib/guest-checkout-memory";

/* Guests (no account) confirm they own the phone or email they're ordering with, using a one-time code.
   This card sits in the order summary, right above the "place order" button, and the button stays locked until it
   is done. When the code is accepted the card shows a short "verified" tick and then folds away; if the guest later
   edits the phone/email the verification no longer matches and the card comes back by itself.
   - SMS goes to the phone typed in the delivery details (via Twilio).
   - Email goes to the address typed in the delivery details.
   The card never asks for contact details itself: it points back to those fields.
   The server allows 2 codes per phone/email, 60 seconds apart; this card shows the countdown and what's left,
   and when SMS isn't working it says so and offers email instead.
   Refreshing the page does not lose progress: which number the code went to and when "resend" unlocks are kept in
   the browser tab (see lib/guest-checkout-memory), so the guest simply types the code they already received. */

export type GuestVerified = { proof: string; channel: "sms" | "email"; target: string };

type Options = { guestCheckout: boolean; sms: boolean; email: boolean; cooldownSec: number; maxSends: number };

function normPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  return d ? `+${d}` : "";
}

export function isGuestContactVerified(v: GuestVerified | null, phoneFull: string, email: string): boolean {
  if (!v) return false;
  if (v.channel === "sms") return normPhone(phoneFull) === v.target;
  return email.trim().toLowerCase() === v.target;
}

const PRIMARY_BTN =
  "w-full h-12 rounded-xl border-0 font-semibold text-white shadow-sm bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 disabled:opacity-100 disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none";

export default function GuestVerifyCard({
  phoneFull,
  phoneValid,
  email,
  value,
  onVerified,
  onUnlocked,
  onFocusField,
  shakeKey,
}: {
  /** "+970591234567" — the phone typed in the delivery details. */
  phoneFull: string;
  phoneValid: boolean;
  /** The email typed in the delivery details (optional there; needed only to verify by email). */
  email: string;
  value: GuestVerified | null;
  onVerified: (v: GuestVerified) => void;
  /** Called the moment verification succeeds, so the page can draw attention to the now-unlocked button. */
  onUnlocked?: () => void;
  /** Scroll to and focus the phone / email field in the delivery details. */
  onFocusField: (field: "phone" | "email") => void;
  /** Bump to draw attention to the card (e.g. they pressed "place order" before verifying). */
  shakeKey: number;
}) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { data: options } = useQuery<Options>({
    queryKey: ["/api/guest/verify/options"],
    staleTime: 60_000,
    queryFn: async () => (await fetch("/api/guest/verify/options")).json(),
  });

  const smsOffered = options?.sms !== false; // optimistic until we know
  // A code the guest already asked for before refreshing the page (or null).
  const [restored] = useState(() => loadPending());
  const [channel, setChannel] = useState<"sms" | "email">(restored?.channel ?? "sms");
  const [smsBroken, setSmsBroken] = useState(false);
  // The phone/email a code was sent to. The code step shows only while it matches what is typed in the form.
  const [sentTo, setSentTo] = useState<string | null>(restored?.target ?? null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState<{ text: string; tone: "error" | "warn" } | null>(null);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(restored?.cooldownEndsAt ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [sendsLeft, setSendsLeft] = useState<number | null>(restored?.sendsLeft ?? null);
  const codeRef = useRef<HTMLInputElement>(null);
  const secondsLeft = Math.max(0, Math.ceil((cooldownEndsAt - now) / 1000));

  // Email-only when the admin switched SMS off, Twilio isn't configured, or SMS just failed.
  const smsAvailable = smsOffered && !smsBroken;

  // Switching method starts that method fresh (optionally with a message, e.g. "SMS is down, use email").
  const switchChannel = (next: "sms" | "email", carry: { text: string; tone: "error" | "warn" } | null = null) => {
    setChannel(next);
    setSentTo(null);
    setCode("");
    setError(carry);
  };
  useEffect(() => {
    if (options && !options.sms && channel !== "email") switchChannel("email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.sms]);
  useEffect(() => {
    if (!smsAvailable && channel === "sms") switchChannel("email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smsAvailable, channel]);

  // Ticks once a second while "resend" is locked.
  useEffect(() => {
    if (cooldownEndsAt <= now) return;
    const id = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(id);
  }, [cooldownEndsAt, now]);

  const target = channel === "sms" ? phoneFull : email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const canSend = channel === "sms" ? phoneValid : emailLooksValid;
  // A code was sent to the OLD phone/email: once the contact changes it no longer applies, so this turns false by itself.
  const sent = sentTo !== null && sentTo === target;
  const verifiedNow = isGuestContactVerified(value, phoneFull, email);

  // open -> success (short green tick) -> closing (folds away) -> gone. Editing the contact reopens it.
  type Phase = "open" | "success" | "closing" | "gone";
  const [phase, setPhase] = useState<Phase>(verifiedNow ? "gone" : "open");
  const unlockedRef = useRef(onUnlocked);
  unlockedRef.current = onUnlocked;
  const prevVerified = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevVerified.current === verifiedNow) return; // nothing changed
    const firstRun = prevVerified.current === null;
    prevVerified.current = verifiedNow;
    if (verifiedNow) clearPending();
    if (firstRun) { setPhase(verifiedNow ? "gone" : "open"); return; } // e.g. refreshed after verifying: no fanfare
    if (!verifiedNow) { setPhase("open"); return; }
    setPhase("success");
    unlockedRef.current?.();
    const t1 = window.setTimeout(() => setPhase("closing"), 1100);
    const t2 = window.setTimeout(() => setPhase("gone"), 1100 + 450);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [verifiedNow]);

  const T = {
    title: ar ? "تأكيد هويتك لإتمام الطلب" : "Confirm it's you to place your order",
    sub: ar ? "بدون حساب نحتاج رمز تحقق سريعاً. لن نشارك بياناتك مع أحد." : "As a guest we need a quick one-time code. We never share your details.",
    sms: ar ? "رسالة SMS" : "SMS",
    email: ar ? "البريد الإلكتروني" : "Email",
    smsDown: ar ? "غير متاح الآن" : "Unavailable now",
    send: ar ? "إرسال الرمز" : "Send code",
    resend: ar ? "إعادة إرسال الرمز" : "Resend code",
    resendIn: (s: number) => (ar ? `إعادة الإرسال خلال ${s} ث` : `Resend in ${s}s`),
    verify: ar ? "تأكيد الرمز" : "Verify code",
    codeLabel: ar ? "أدخلي الرمز المكوّن من 6 أرقام" : "Enter the 6-digit code",
    needPhone: ar ? "أدخلي رقم هاتفك في تفاصيل التوصيل أولاً" : "Enter your phone number in the delivery details first",
    needEmail: ar ? "أدخلي بريدك الإلكتروني في تفاصيل التوصيل أولاً" : "Enter your email in the delivery details first",
    goPhone: ar ? "أدخلي الرقم" : "Add phone",
    goEmail: ar ? "أدخلي البريد" : "Add email",
    willSend: ar ? "سنرسل الرمز إلى" : "We'll send a code to",
    sentTo: ar ? "أرسلنا الرمز إلى" : "We sent a code to",
    change: ar ? "تغيير" : "Change",
    left: (n: number) => (ar ? (n === 0 ? "استخدمتِ الرسالتين المسموحتين" : `متبقٍ ${n} رسالة من رسالتين`) : n === 0 ? "You've used both codes" : `${n} of 2 sends left`),
    maxNote: ar ? "يمكن إرسال رسالتين كحد أقصى" : "A maximum of two codes can be sent",
    verified: ar ? "تم التحقق" : "Verified",
    ready: ar ? "يمكنك الآن إتمام الطلب" : "You can now place your order",
  };

  const errText = (data: any, status: number): { text: string; tone: "error" | "warn" } => {
    const m = data?.message as string | undefined;
    if (m === "otp_cooldown")
      return { text: ar ? `انتظري ${data.secondsLeft} ثانية قبل طلب رمز جديد` : `Please wait ${data.secondsLeft}s before asking for another code`, tone: "warn" };
    if (m === "otp_limit_reached")
      return {
        text: channel === "sms"
          ? (ar ? "وصلتِ للحد الأقصى (رسالتان). يمكنك استخدام البريد الإلكتروني الآن." : "You've reached the limit (2 messages). You can use email right now.")
          : (ar ? "وصلتِ للحد الأقصى (رسالتان). حاولي لاحقاً أو استخدمي الرسائل النصية." : "You've reached the limit (2 messages). Try again later or use SMS."),
        tone: "warn",
      };
    if (m === "sms_failed" || m === "sms_unavailable")
      return { text: ar ? "خدمة الرسائل النصية لا تعمل حالياً. يمكنك استخدام البريد الإلكتروني الآن 👇" : "SMS isn't working right now. You can use email right now 👇", tone: "warn" };
    if (m === "email_failed")
      return { text: ar ? "تعذّر إرسال البريد الإلكتروني الآن. جرّبي لاحقاً" + (smsAvailable ? " أو استخدمي الرسائل النصية." : ".") : "We couldn't send the email right now. Please try again later" + (smsAvailable ? " or use SMS." : "."), tone: "error" };
    if (m === "invalid_code") return { text: ar ? `الرمز غير صحيح${data.attemptsLeft != null ? ` (محاولات متبقية: ${data.attemptsLeft})` : ""}` : `That code isn't right${data.attemptsLeft != null ? ` (${data.attemptsLeft} tries left)` : ""}`, tone: "error" };
    if (m === "code_expired" || m === "no_code") return { text: ar ? "انتهت صلاحية الرمز. اطلبي رمزاً جديداً." : "That code has expired. Please request a new one.", tone: "error" };
    if (m === "too_many_attempts") return { text: ar ? "محاولات كثيرة خاطئة. اطلبي رمزاً جديداً لاحقاً." : "Too many wrong tries. Please request a new code later.", tone: "error" };
    if (m === "too_many_requests" || status === 429) return { text: ar ? "طلبات كثيرة. حاولي بعد قليل." : "Too many requests. Please try again shortly.", tone: "warn" };
    if (m === "invalid_phone") return { text: ar ? "رقم الهاتف غير صحيح" : "That phone number isn't valid", tone: "error" };
    if (m === "invalid_email") return { text: ar ? "البريد الإلكتروني غير صحيح" : "That email address isn't valid", tone: "error" };
    if (m === "guest_checkout_disabled") return { text: ar ? "الطلب كضيف غير متاح حالياً. سجّلي الدخول." : "Guest checkout isn't available right now. Please sign in.", tone: "error" };
    return { text: ar ? "حدث خطأ. حاولي مرة أخرى بعد قليل." : "Something went wrong. Please try again in a moment.", tone: "error" };
  };

  const call = async (path: string, body: any) => {
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { message: "network" } };
    }
  };

  // Remember the code we asked for, so a page refresh can pick up right here instead of starting from zero.
  const remember = (ends: number, left: number | null) =>
    savePending({ channel, target, sentAt: Date.now(), cooldownEndsAt: ends, sendsLeft: left });

  const send = async () => {
    if (!canSend || busy) return;
    setBusy("send");
    setError(null);
    const r = await call("/api/guest/verify/send", channel === "sms" ? { channel, phone: phoneFull } : { channel, email: email.trim() });
    setBusy(null);
    if (r.ok) {
      const ends = Date.now() + (r.data.cooldownSec ?? 60) * 1000;
      setSentTo(target);
      setCode("");
      setCooldownEndsAt(ends);
      setNow(Date.now());
      setSendsLeft(r.data.sendsLeft ?? null);
      remember(ends, r.data.sendsLeft ?? null);
      window.setTimeout(() => codeRef.current?.focus({ preventScroll: true }), 60);
      return;
    }
    if (r.data?.message === "otp_cooldown") {
      // A code was already sent a moment ago: show the code step so they can use it.
      const ends = Date.now() + (r.data.secondsLeft ?? 60) * 1000;
      setSentTo(target);
      setCooldownEndsAt(ends);
      setNow(Date.now());
      setSendsLeft(r.data.sendsLeft ?? null);
      remember(ends, r.data.sendsLeft ?? null);
    }
    if (r.data?.message === "otp_limit_reached") setSendsLeft(0);
    if (r.data?.message === "sms_failed" || r.data?.message === "sms_unavailable") {
      setSmsBroken(true); // hide SMS for now and move them to email
      switchChannel("email", errText(r.data, r.status)); // keep the explanation visible after the switch
      return;
    }
    setError(errText(r.data, r.status));
  };

  const check = async () => {
    if (code.length < 6 || busy) return;
    setBusy("check");
    setError(null);
    const r = await call("/api/guest/verify/check", channel === "sms" ? { channel, phone: phoneFull, code } : { channel, email: email.trim(), code });
    setBusy(null);
    if (r.ok && r.data?.proof) {
      clearPending();
      onVerified({ proof: r.data.proof, channel: r.data.channel, target: r.data.target });
      return;
    }
    setError(errText(r.data, r.status));
  };

  // The code checks itself as soon as the 6th digit is in (the button stays as a fallback, e.g. after a network error).
  useEffect(() => {
    if (code.length === 6 && sent && !verifiedNow) void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (phase === "gone") return null;
  const closing = phase === "closing";
  const changedAfterVerify = !!value && !verifiedNow;
  const ContactIcon = channel === "sms" ? Smartphone : Mail;
  const contactValue = channel === "sms" ? phoneFull : email.trim();

  // The slot folds away smoothly; the gap above the order button is part of it, so it folds too.
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-[450ms] ease-out motion-reduce:transition-none ${closing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
      data-testid="guest-verify-slot"
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pb-4">
          {phase !== "open" ? (
            <div className="rounded-2xl border border-emerald-300/70 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/20 p-4 flex items-center gap-3" role="status" data-testid="gv-verified">
              <span className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0 animate-in zoom-in-50 duration-300">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{T.verified}: <bdi dir="ltr">{value?.target}</bdi></p>
                <p className="text-xs text-muted-foreground">{T.ready}</p>
              </div>
            </div>
          ) : (
            <div
              key={`gv-${shakeKey}`}
              className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 space-y-4 shadow-sm bg-gradient-to-b from-white to-rose-50/60 dark:from-card dark:to-rose-950/10 ${shakeKey > 0 ? "border-red-400 animate-[shake-hint_0.45s_ease-in-out_1]" : "border-rose-100 dark:border-rose-900/40"}`}
              data-testid="guest-verify-card"
            >
              <div className="pointer-events-none absolute -top-10 -end-10 w-32 h-32 rounded-full bg-rose-200/40 blur-2xl" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div className="leading-snug">
                  <p className="text-sm font-bold">{T.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{T.sub}</p>
                </div>
              </div>

              {changedAfterVerify && (
                <p className="relative text-xs text-amber-700 dark:text-amber-400" data-testid="gv-changed">
                  {ar ? "غيّرتِ بياناتك بعد التحقق — يلزم التحقق مرة أخرى." : "You changed your details after verifying — please verify again."}
                </p>
              )}

              <div className="relative grid grid-cols-2 gap-1 p-1 rounded-xl bg-rose-100/60 dark:bg-rose-950/30" role="tablist">
                {([
                  { id: "sms", icon: MessageSquareText, label: T.sms, disabled: !smsAvailable },
                  { id: "email", icon: Mail, label: T.email, disabled: false },
                ] as const).map((t) => {
                  const Icon = t.icon;
                  const active = channel === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={t.disabled}
                      onClick={() => !active && switchChannel(t.id)}
                      className={`flex flex-col items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                        active ? "bg-white dark:bg-card text-rose-700 dark:text-rose-300 shadow-sm" : "text-muted-foreground hover:text-foreground"
                      } ${t.disabled ? "opacity-45 cursor-not-allowed" : ""}`}
                      data-testid={`gv-tab-${t.id}`}
                    >
                      <span className="flex items-center gap-1.5"><Icon className="w-4 h-4" />{t.label}</span>
                      {t.disabled && <span className="text-[10px] font-medium opacity-80">{T.smsDown}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Where the code goes — or a nudge to fill that field in the delivery details */}
              {canSend ? (
                <div
                  className="relative flex items-center gap-3 rounded-xl border border-rose-100 dark:border-rose-900/40 bg-white dark:bg-card px-3 py-2.5"
                  data-testid={sent ? "gv-sent-note" : channel === "sms" ? "gv-sms-target" : "gv-email-target"}
                >
                  <span className="w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0">
                    <ContactIcon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-[11px] text-muted-foreground">{sent ? T.sentTo : T.willSend}</p>
                    <p className="text-sm font-bold truncate" dir="ltr" style={{ textAlign: ar ? "right" : "left" }}><bdi dir="ltr">{contactValue}</bdi></p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onFocusField(channel === "sms" ? "phone" : "email")}
                    className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-700 underline underline-offset-2"
                    data-testid="gv-change-contact"
                  >
                    {T.change}
                  </button>
                </div>
              ) : (
                <div className="relative flex items-center justify-between gap-3 rounded-xl border border-dashed border-rose-300/70 bg-white/70 dark:bg-card/60 px-3 py-2.5" data-testid={channel === "sms" ? "gv-sms-target" : "gv-email-target"}>
                  <p className="text-xs text-muted-foreground leading-snug">{channel === "sms" ? T.needPhone : T.needEmail}</p>
                  <button
                    type="button"
                    onClick={() => onFocusField(channel === "sms" ? "phone" : "email")}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 underline underline-offset-2"
                    data-testid={channel === "sms" ? "gv-goto-phone" : "gv-goto-email"}
                  >
                    <PencilLine className="w-3.5 h-3.5" />
                    {channel === "sms" ? T.goPhone : T.goEmail}
                  </button>
                </div>
              )}

              {!sent ? (
                <Button type="button" onClick={send} disabled={!canSend || busy === "send"} className={`relative ${PRIMARY_BTN}`} data-testid="gv-send">
                  {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : T.send}
                </Button>
              ) : (
                <div className="relative space-y-3.5">
                  <div className="space-y-2.5">
                    <label className="text-xs font-semibold block text-center">{T.codeLabel}</label>
                    <div dir="ltr" className="flex justify-center">
                      <InputOTP
                        ref={codeRef}
                        maxLength={6}
                        value={code}
                        onChange={(v) => setCode(normalizeArabicDigits(v).replace(/\D/g, "").slice(0, 6))}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), check())}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        data-testid="gv-code-input"
                      >
                        <InputOTPGroup className="gap-1.5 sm:gap-2">
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="h-12 w-10 sm:w-11 !rounded-xl !border-2 border-rose-200 bg-white dark:bg-card text-xl font-bold ring-rose-400 ring-offset-0 first:!border-l-2 last:!border-r-2"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>
                  <Button type="button" onClick={check} disabled={code.length < 6 || busy === "check"} className={PRIMARY_BTN} data-testid="gv-verify">
                    {busy === "check" ? <Loader2 className="w-4 h-4 animate-spin" /> : T.verify}
                  </Button>
                  <div className="text-center space-y-1">
                    <button
                      type="button"
                      onClick={send}
                      disabled={secondsLeft > 0 || busy === "send" || sendsLeft === 0}
                      className="text-sm font-semibold text-rose-600 hover:text-rose-700 disabled:no-underline disabled:text-muted-foreground disabled:cursor-not-allowed hover:underline"
                      data-testid="gv-resend"
                    >
                      {secondsLeft > 0 ? <span data-testid="gv-countdown">{T.resendIn(secondsLeft)}</span> : T.resend}
                    </button>
                    <p className="text-[11px] text-muted-foreground" data-testid="gv-sends-left">
                      {sendsLeft != null ? T.left(sendsLeft) : T.maxNote}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div
                  className={`relative flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs leading-relaxed ${
                    error.tone === "warn" ? "bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800" : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-800"
                  }`}
                  role="alert"
                  data-testid="gv-error"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{error.text}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
