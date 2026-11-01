import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { randomInt } from "crypto";
import { sendTwilioSmsVerification, checkTwilioSmsVerification, isTwilioSmsConfigured, usesTwilioVerifyService } from "./twilioVerify";
import { sendVerificationEmail } from "./email";
import {
  isGuestCheckoutEnabled, isGuestSmsEnabled, normalizeGuestTarget, signGuestProof, type GuestChannel,
} from "./checkoutHelpers";

/* Guest verification: before a guest (no account) can order, they confirm a phone (SMS code via Twilio)
   or an email (emailed code).

   Rules:
   - at most 2 SMS codes (MAX_SENDS) per checkout, at least 60 seconds apart — counted per phone number, per checkout
     session (the browser tab sends a session id, so changing the number doesn't give a fresh 2) and, as a backstop,
     per IP address (a few more, so one household doesn't lock the next customer out); the same 2-per-15-minutes rule
     applies to email codes per address;
   - every SMS attempt counts, successful or not: after the 2 the guest is told to use email instead;
   - a number the SMS provider rejects as invalid is reported as "invalid_phone" (fix the number), anything else that
     goes wrong as "sms_failed" (use email);
   - a code is good for 10 minutes and allows 5 wrong tries. */

const COOLDOWN_MS = 60 * 1000;
const MAX_SENDS = 2;
const MAX_SMS_PER_IP = 5;
const WINDOW_MS = 15 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type SendState = { count: number; lastSentAt: number; windowExpiresAt: number };
const sendLimits = new Map<string, SendState>();
const codes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

setInterval(() => {
  const now = Date.now();
  sendLimits.forEach((v, k) => { if (v.windowExpiresAt < now) sendLimits.delete(k); });
  codes.forEach((v, k) => { if (v.expiresAt < now) codes.delete(k); });
}, 5 * 60 * 1000).unref?.();

const ipSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "too_many_requests" },
});
const ipCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "too_many_requests" },
});

/** Counts one SMS attempt against each guard and returns how many attempts the tightest guard still allows. */
function bump(guards: Array<{ key: string; max: number }>, now: number): number {
  let left = MAX_SENDS;
  for (const g of guards) {
    const c = sendLimits.get(g.key);
    const a = c && c.windowExpiresAt > now ? c : undefined;
    const next: SendState = { count: (a?.count || 0) + 1, lastSentAt: now, windowExpiresAt: a?.windowExpiresAt || now + WINDOW_MS };
    sendLimits.set(g.key, next);
    left = Math.min(left, Math.max(0, g.max - next.count));
  }
  return left;
}

function asChannel(v: unknown): GuestChannel | null {
  return v === "sms" || v === "email" ? v : null;
}

export function registerGuestVerifyRoutes(app: Express) {
  /** What the checkout page may offer: SMS only when the admin allows it AND Twilio is set up. */
  app.get("/api/guest/verify/options", async (_req, res) => {
    const [guestCheckout, smsAllowed] = await Promise.all([isGuestCheckoutEnabled(), isGuestSmsEnabled()]);
    res.json({
      guestCheckout,
      sms: smsAllowed && isTwilioSmsConfigured(),
      email: true,
      cooldownSec: COOLDOWN_MS / 1000,
      maxSends: MAX_SENDS,
    });
  });

  app.post("/api/guest/verify/send", ipSendLimiter, async (req, res) => {
    const channel = asChannel(req.body?.channel);
    if (!channel) return res.status(400).json({ message: "invalid_channel" });
    if (!(await isGuestCheckoutEnabled())) return res.status(403).json({ message: "guest_checkout_disabled" });
    if (channel === "sms" && (!(await isGuestSmsEnabled()) || !isTwilioSmsConfigured())) {
      return res.status(403).json({ message: "sms_unavailable", fallback: "email" });
    }
    const now = Date.now();
    const sid = typeof req.body?.sid === "string" && /^[\w-]{8,64}$/.test(req.body.sid) ? req.body.sid : null;
    const ip = req.ip || "unknown";
    const limitOf = (key: string) => { const c = sendLimits.get(key); return c && c.windowExpiresAt > now ? c : undefined; };
    const fallback = channel === "sms" ? { fallback: "email" as const } : {};

    // The 2-per-checkout rule for SMS is checked on the session and the IP before the number itself, so a guest who
    // keeps changing the number (or mistypes it) still gets exactly 2 attempts.
    const guards: Array<{ key: string; max: number }> = channel === "sms"
      ? [...(sid ? [{ key: `sms-session:${sid}`, max: MAX_SENDS }] : []), { key: `sms-ip:${ip}`, max: MAX_SMS_PER_IP }]
      : [];
    for (const g of guards) {
      const a = limitOf(g.key);
      if (a && a.count >= g.max) {
        return res.status(429).json({ message: "otp_limit_reached", secondsLeft: Math.ceil((a.windowExpiresAt - now) / 1000), sendsLeft: 0, ...fallback });
      }
      if (a && now - a.lastSentAt < COOLDOWN_MS) {
        return res.status(429).json({ message: "otp_cooldown", secondsLeft: Math.ceil((COOLDOWN_MS - (now - a.lastSentAt)) / 1000), sendsLeft: g.max - a.count, ...fallback });
      }
    }

    const target = normalizeGuestTarget(channel, channel === "sms" ? req.body?.phone : req.body?.email);
    if (!target) {
      // A number that can't be right is still one of the 2 attempts (it is what the guest keeps retrying).
      const left = channel === "sms" ? bump(guards, now) : MAX_SENDS;
      return res.status(400).json({ message: channel === "sms" ? "invalid_phone" : "invalid_email", sendsLeft: left, ...fallback });
    }

    const key = `${channel}:${target}`;
    const active = limitOf(key);
    if (active && active.count >= MAX_SENDS) {
      return res.status(429).json({ message: "otp_limit_reached", secondsLeft: Math.ceil((active.windowExpiresAt - now) / 1000), sendsLeft: 0, ...fallback });
    }
    if (active && now - active.lastSentAt < COOLDOWN_MS) {
      return res.status(429).json({ message: "otp_cooldown", secondsLeft: Math.ceil((COOLDOWN_MS - (now - active.lastSentAt)) / 1000), sendsLeft: MAX_SENDS - active.count, ...fallback });
    }

    // Reserve the attempt up front (so two quick taps can't both pass). For SMS it stays used even if sending fails.
    const next: SendState = { count: (active?.count || 0) + 1, lastSentAt: now, windowExpiresAt: active?.windowExpiresAt || now + WINDOW_MS };
    sendLimits.set(key, next);
    const sessionLeft = channel === "sms" ? bump(guards, now) : MAX_SENDS;
    const sendsLeft = Math.min(MAX_SENDS - next.count, sessionLeft);

    const useTwilioVerifyService = channel === "sms" && usesTwilioVerifyService();
    const code = useTwilioVerifyService ? undefined : String(randomInt(100000, 999999));
    if (code) codes.set(key, { code, expiresAt: now + CODE_TTL_MS, attempts: 0 });
    try {
      if (channel === "sms") {
        await sendTwilioSmsVerification(target, code);
      } else {
        const sent = await sendVerificationEmail(target, code as string, "guest-order");
        if (!sent) throw new Error("email_not_sent");
      }
    } catch (err: any) {
      if (code) codes.delete(key);
      console.error(`[guest-verify] ${channel} send failed:`, err?.message || err);
      if (channel === "email") {
        // email trouble is ours, not the guest's: the attempt is given back
        if (active) sendLimits.set(key, active); else sendLimits.delete(key);
        return res.status(502).json({ message: "email_failed" });
      }
      // Twilio 21211 / 21614: the number itself is not valid or can't receive SMS
      const badNumber = err?.code === 21211 || err?.code === 21614 || err?.code === 21408;
      return res.status(badNumber ? 400 : 502).json({ message: badNumber ? "invalid_phone" : "sms_failed", sendsLeft, ...fallback });
    }
    res.json({ sent: true, target, cooldownSec: COOLDOWN_MS / 1000, sendsLeft });
  });

  app.post("/api/guest/verify/check", ipCheckLimiter, async (req, res) => {
    const channel = asChannel(req.body?.channel);
    if (!channel) return res.status(400).json({ message: "invalid_channel" });
    if (!(await isGuestCheckoutEnabled())) return res.status(403).json({ message: "guest_checkout_disabled" });
    const target = normalizeGuestTarget(channel, channel === "sms" ? req.body?.phone : req.body?.email);
    const code = String(req.body?.code ?? "").trim();
    if (!target || !/^\d{4,10}$/.test(code)) return res.status(400).json({ message: "invalid_input" });
    const key = `${channel}:${target}`;

    try {
      if (channel === "sms" && usesTwilioVerifyService()) {
        if (!(await checkTwilioSmsVerification(target, code))) return res.status(400).json({ message: "invalid_code" });
      } else {
        const entry = codes.get(key);
        if (!entry) return res.status(400).json({ message: "no_code" });
        if (entry.expiresAt < Date.now()) {
          codes.delete(key);
          return res.status(400).json({ message: "code_expired" });
        }
        entry.attempts += 1;
        if (entry.attempts > MAX_ATTEMPTS) {
          codes.delete(key);
          return res.status(429).json({ message: "too_many_attempts" });
        }
        if (entry.code !== code) {
          return res.status(400).json({ message: "invalid_code", attemptsLeft: MAX_ATTEMPTS - entry.attempts });
        }
        codes.delete(key);
      }
    } catch (err: any) {
      console.error("[guest-verify] check failed:", err?.message || err);
      return res.status(502).json({ message: "verification_failed" });
    }
    res.json({ verified: true, channel, target, proof: signGuestProof(channel, target), expiresInSec: 30 * 60 });
  });
}
