import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Mail, MessageSquareText, PencilLine, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n";

/* Guests (no account) confirm they own the phone or email they're ordering with, using a one-time code.
   This card sits in the order summary, right above the "place order" button, and the button stays locked until it
   is done. When the code is accepted the card shows a short "verified" tick and then folds away; if the guest later
   edits the phone/email the verification no longer matches and the card comes back by itself.
   - SMS goes to the phone typed in the delivery details (via Twilio).
   - Email goes to the address typed in the delivery details.
   The card never asks for contact details itself: it points back to those fields.
   The server allows 2 codes per phone/email, 60 seconds apart; this card shows the countdown and what's left,
   and when SMS isn't working it says so and offers email instead. */

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
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [smsBroken, setSmsBroken] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState<{ text: string; tone: "error" | "warn" } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sendsLeft, setSendsLeft] = useState<number | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  // A message to show right after we switch method for the guest (e.g. "SMS is down, use email").
  const carryErrorRef = useRef<{ text: string; tone: "error" | "warn" } | null>(null);

  // Email-only when the admin switched SMS off, Twilio isn't configured, or SMS just failed.
  const smsAvailable = smsOffered && !smsBroken;
  useEffect(() => {
    if (options && !options.sms) setChannel("email");
  }, [options?.sms]);
  useEffect(() => {
    if (!smsAvailable && channel === "sms") setChannel("email");
  }, [smsAvailable, channel]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft]);

  // Switching method starts that method fresh.
  useEffect(() => {
  setSent(false);
  setCode("");
  setError(carryErrorRef.current);
  carryErrorRef.current = null;
  }, [channel]);

  const target = channel === "sms" ? phoneFull : email.trim();

  // A code was sent to the OLD phone/email: once the contact changes it no longer applies.
  useEffect(() => {
    setSent(false);
    setCode("");
    setSecondsLeft(0);
    setSendsLeft(null);
  }, [target]);
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const canSend = channel === "sms" ? phoneValid : emailLooksValid;
  const verifiedNow = isGuestContactVerified(value, phoneFull, email);

  // open -> success (short green tick) -> closing (folds away) -> gone. Editing the contact reopens it.
  type Phase = "open" | "success" | "closing" | "gone";
  const [phase, setPhase] = useState<Phase>(verifiedNow ? "gone" : "open");
  const unlockedRef = useRef(onUnlocked);
  unlockedRef.current = onUnlocked;
  useEffect(() => {
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
    resend: ar ? "إعادة الإرسال" : "Resend code",
    resendIn: (s: number) => (ar ? `إعادة الإرسال بعد ${s} ث` : `Resend in ${s}s`),
    verify: ar ? "تأكيد" : "Verify",
    codeLabel: ar ? "أدخلي الرمز المكوّن من 6 أرقام" : "Enter the 6-digit code",
    needPhone: ar ? "أدخلي رقم هاتفك في تفاصيل التوصيل أولاً" : "Enter your phone number in the delivery details first",
    needEmail: ar ? "أدخلي بريدك الإلكتروني في تفاصيل التوصيل أولاً" : "Enter your email in the delivery details first",
    goPhone: ar ? "أدخلي الرقم" : "Add phone",
    goEmail: ar ? "أدخلي البريد" : "Add email",
    willSend: ar ? "سنرسل الرمز إلى" : "We'll send a code to",
    sentTo: ar ? "أرسلنا الرمز إلى" : "We sent a code to",
    left: (n: number) => (ar ? (n === 0 ? "استخدمتِ الرسالتين المسموحتين" : `متبقٍ ${n} رسالة`) : n === 0 ? "You've used both codes" : `${n} send left`),
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

  const send = async () => {
    if (!canSend || busy) return;
    setBusy("send");
    setError(null);
    const r = await call("/api/guest/verify/send", channel === "sms" ? { channel, phone: phoneFull } : { channel, email: email.trim() });
    setBusy(null);
    if (r.ok) {
      setSent(true);
      setCode("");
      setSecondsLeft(r.data.cooldownSec ?? 60);
      setSendsLeft(r.data.sendsLeft ?? null);
      window.setTimeout(() => codeRef.current?.focus(), 50);
      return;
    }
    if (r.data?.message === "otp_cooldown") {
      setSent(true);
      setSecondsLeft(r.data.secondsLeft ?? 60);
      setSendsLeft(r.data.sendsLeft ?? null);
    }
    if (r.data?.message === "otp_limit_reached") setSendsLeft(0);
    if (r.data?.message === "sms_failed" || r.data?.message === "sms_unavailable") {
      setSmsBroken(true); // hide SMS for now and move them to email
      carryErrorRef.current = errText(r.data, r.status); // keep the explanation visible after the switch
      setChannel("email");
      return;
    }
    setError(errText(r.data, r.status));
  };

  const check = async () => {
    if (code.length < 4 || busy) return;
    setBusy("check");
    setError(null);
    const r = await call("/api/guest/verify/check", channel === "sms" ? { channel, phone: phoneFull, code } : { channel, email: email.trim(), code });
    setBusy(null);
    if (r.ok && r.data?.proof) {
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
  const phoneShown = <bdi dir="ltr" className="font-semibold text-foreground">{phoneFull}</bdi>;
  const changedAfterVerify = !!value && !verifiedNow;

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
              className={`rounded-2xl border bg-card p-4 space-y-3.5 shadow-sm ${shakeKey > 0 ? "border-red-400 animate-[shake-hint_0.45s_ease-in-out_1]" : "border-border"}`}
              data-testid="guest-verify-card"
            >
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </span>
                <div className="leading-snug">
                  <p className="text-sm font-bold">{T.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{T.sub}</p>
                </div>
              </div>

              {changedAfterVerify && (
                <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="gv-changed">
                  {ar ? "غيّرتِ بياناتك بعد التحقق — يلزم التحقق مرة أخرى." : "You changed your details after verifying — please verify again."}
                </p>
              )}

              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted" role="tablist">
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
                      onClick={() => setChannel(t.id)}
                      className={`flex flex-col items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      } ${t.disabled ? "opacity-45 cursor-not-allowed" : ""}`}
                      data-testid={`gv-tab-${t.id}`}
                    >
                      <span className="flex items-center gap-1.5"><Icon className="w-4 h-4" />{t.label}</span>
                      {t.disabled && <span className="text-[10px] font-medium opacity-80">{T.smsDown}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Where the code will go — or a nudge to fill that field in the delivery details */}
              {sent ? null : canSend ? (
                <p className="text-xs text-muted-foreground" data-testid={channel === "sms" ? "gv-sms-target" : "gv-email-target"}>
                  {T.willSend} {channel === "sms" ? phoneShown : <bdi dir="ltr" className="font-semibold text-foreground">{email.trim()}</bdi>}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2" data-testid={channel === "sms" ? "gv-sms-target" : "gv-email-target"}>
                  <p className="text-xs text-muted-foreground leading-snug">{channel === "sms" ? T.needPhone : T.needEmail}</p>
                  <button
                    type="button"
                    onClick={() => onFocusField(channel === "sms" ? "phone" : "email")}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary underline underline-offset-2"
                    data-testid={channel === "sms" ? "gv-goto-phone" : "gv-goto-email"}
                  >
                    <PencilLine className="w-3.5 h-3.5" />
                    {channel === "sms" ? T.goPhone : T.goEmail}
                  </button>
                </div>
              )}

              {!sent ? (
                <Button type="button" onClick={send} disabled={!canSend || busy === "send"} className="w-full h-11 rounded-xl font-semibold" data-testid="gv-send">
                  {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : T.send}
                </Button>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-muted-foreground" data-testid="gv-sent-note">{T.sentTo} <bdi dir="ltr" className="font-semibold text-foreground">{target}</bdi></p>
                  <label className="text-xs font-semibold block">{T.codeLabel}</label>
                  <div className="flex gap-2">
                    <Input
                      ref={codeRef}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), check())}
                      dir="ltr"
                      placeholder="••••••"
                      className="rounded-xl text-center text-xl font-mono tracking-[0.5em] h-12"
                      data-testid="gv-code-input"
                    />
                    <Button type="button" onClick={check} disabled={code.length < 6 || busy === "check"} className="h-12 px-5 rounded-xl font-semibold" data-testid="gv-verify">
                      {busy === "check" ? <Loader2 className="w-4 h-4 animate-spin" /> : T.verify}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={send}
                      disabled={secondsLeft > 0 || busy === "send" || sendsLeft === 0}
                      className="font-semibold underline underline-offset-2 disabled:no-underline disabled:text-muted-foreground disabled:cursor-not-allowed"
                      data-testid="gv-resend"
                    >
                      {secondsLeft > 0 ? <span data-testid="gv-countdown">{T.resendIn(secondsLeft)}</span> : T.resend}
                    </button>
                    {sendsLeft != null && <span className="text-muted-foreground" data-testid="gv-sends-left">{T.left(sendsLeft)}</span>}
                  </div>
                </div>
              )}

              {error && (
                <div
                  className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs leading-relaxed ${
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
