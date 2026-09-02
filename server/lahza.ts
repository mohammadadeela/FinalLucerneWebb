const LAHZA_SECRET_KEY = process.env.LAHZA_SECRET_KEY || "";
const LAHZA_BASE_URL = "https://api.lahza.io";

export interface LahzaInitResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializeLahzaTransaction(params: {
  email: string;
  amount: number;
  reference: string;
  callback_url: string;
}): Promise<LahzaInitResult> {
  if (!LAHZA_SECRET_KEY) throw new Error("LAHZA_SECRET_KEY not set");

  // Lahza amounts are in subunits (agorot for ILS: 1 ILS = 100 agorot)
  const amountInAgorot = Math.round(params.amount * 100);

  const res = await fetch(`${LAHZA_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LAHZA_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: amountInAgorot,
      currency: "ILS",
      reference: params.reference,
      callback_url: params.callback_url,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Lahza init failed: ${res.status}`);
  }

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Lahza transaction initialization failed");

  return data.data as LahzaInitResult;
}

export async function verifyLahzaTransaction(reference: string): Promise<{
  status: string;
  amount: number;
  currency: string;
  reference: string;
}> {
  if (!LAHZA_SECRET_KEY) throw new Error("LAHZA_SECRET_KEY not set");

  const res = await fetch(`${LAHZA_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${LAHZA_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Lahza verify failed: ${res.status}`);
  }

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Lahza verification failed");

  return data.data;
}
