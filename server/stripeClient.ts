import Stripe from "stripe";

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error("STRIPE_PUBLISHABLE_KEY environment variable is not set");
  return key;
}

export async function getStripeWebhookSecret(): Promise<string> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  return secret;
}
