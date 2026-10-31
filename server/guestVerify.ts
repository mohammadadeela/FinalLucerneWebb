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

   Rules, per phone/email:
   - at most 2 codes (MAX_SENDS) per 15 minutes, at least 60 seconds apart;
   - a code is good for 10 minutes and allows 5 wrong tries;
   - a send that FAILS does not use up one of the 2 — so if SMS is down the guest can still use email.
   There is also a per-IP cap on top, so one connection can't spam many numbers. */

const COOLDOWN_MS = 60 * 1000;
const MAX_SENDS = 2;
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
    const target = normalizeGuestTarget(channel, channel === "sms" ? req.body?.phone : req.body?.email);
    if (!target) return res.status(400).json({ message: channel === "sms" ? "invalid_phone" : "invalid_email" });

    const key = `${channel}:${target}`;
    const now = Date.now();
    const current = sendLimits.get(key);
    const active = current && current.windowExpiresAt > now ? current : undefined;
    if (active && active.count >= MAX_SENDS) {
      return res.status(429).json({
        message: "otp_limit_reached",
        secondsLeft: Math.ceil((active.windowExpiresAt - now) / 1000),
        sendsLeft: 0,
        ...(channel === "sms" ? { fallback: "email" } : {}),
      });
    }
    if (active && now - active.lastSentAt < COOLDOWN_MS) {
      return res.status(429).json({
        message: "otp_cooldown",
        secondsLeft: Math.ceil((COOLDOWN_MS - (now - active.lastSentAt)) / 1000),
        sendsLeft: MAX_SENDS - active.count,
      });
    }

    // Reserve the send up front (so two quick taps can't both pass), and give it back if sending fails.
    const next: SendState = { count: (active?.count || 0) + 1, lastSentAt: now, windowExpiresAt: active?.windowExpiresAt || now + WINDOW_MS };
    sendLimits.set(key, next);
    const rollback = () => {
      if (active) sendLimits.set(key, active);
      else sendLimits.delete(key);
    };

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
      rollback();
      console.error(`[guest-verify] ${channel} send failed:`, err?.message || err);
      return res.status(502).json({ message: channel === "sms" ? "sms_failed" : "email_failed", ...(channel === "sms" ? { fallback: "email" } : {}) });
    }
    res.json({ sent: true, cooldownSec: COOLDOWN_MS / 1000, sendsLeft: MAX_SENDS - next.count });
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
