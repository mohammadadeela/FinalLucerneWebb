// Twilio SMS authentication.
//
// Preferred environment variables:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_SMS_FROM  (Messaging Service SID starting with "MG", or a number)
//
// TWILIO_VERIFY_SERVICE_SID (VA...) remains supported as a fallback for older
// deployments, but TWILIO_SMS_FROM is preferred whenever it is present.

function getAccountSid() { return (process.env.TWILIO_ACCOUNT_SID || "").trim(); }
function getAuthToken() { return (process.env.TWILIO_AUTH_TOKEN || "").trim(); }
function getVerifyServiceSid() { return (process.env.TWILIO_VERIFY_SERVICE_SID || "").trim(); }
function getSmsFrom() { return (process.env.TWILIO_SMS_FROM || "").trim(); }

export function isTwilioSmsConfigured(): boolean {
  return !!(getAccountSid() && getAuthToken() && (getSmsFrom() || getVerifyServiceSid()));
}

export function usesTwilioVerifyService(): boolean {
  return !getSmsFrom() && !!getVerifyServiceSid();
}

function normalizeE164(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("invalid_phone");
  return `+${digits}`;
}

function authorizationHeader(): string {
  return `Basic ${Buffer.from(`${getAccountSid()}:${getAuthToken()}`).toString("base64")}`;
}

async function callVerify(path: string, params: URLSearchParams): Promise<any> {
  if (!isTwilioSmsConfigured() || !getVerifyServiceSid()) throw new Error("twilio_sms_not_configured");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${getVerifyServiceSid()}/${path}`, {
    method: "POST",
    headers: {
      Authorization: authorizationHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    console.error(`[twilio-verify] request failed (${data?.code || response.status}): ${data?.message || "Unknown error"}`);
    const error: any = new Error("twilio_verify_failed");
    error.code = data?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function sendMessage(phone: string, code: string): Promise<void> {
  const from = getSmsFrom();
  if (!isTwilioSmsConfigured() || !from) throw new Error("twilio_sms_not_configured");
  if (!/^\d{6}$/.test(code)) throw new Error("invalid_code");

  const params = new URLSearchParams();
  params.set("To", normalizeE164(phone));
  params.set("Body", `رمز تحقق Lucerne: ${code}. صالح لمدة 10 دقائق.`);
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
  else params.set("From", from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${getAccountSid()}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: authorizationHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    console.error(`[twilio-sms] send failed (${data?.code || response.status}): ${data?.message || "Unknown error"}`);
    const error: any = new Error("twilio_sms_send_failed");
    error.code = data?.code;
    error.status = response.status;
    throw error;
  }
}

export async function sendTwilioSmsVerification(phone: string, code?: string): Promise<void> {
  if (getSmsFrom()) {
    await sendMessage(phone, String(code || ""));
    return;
  }
  const params = new URLSearchParams();
  params.set("To", normalizeE164(phone));
  params.set("Channel", "sms");
  await callVerify("Verifications", params);
}

export async function checkTwilioSmsVerification(phone: string, code: string): Promise<boolean> {
  if (!usesTwilioVerifyService() || !/^\d{4,10}$/.test(String(code || "").trim())) return false;
  const params = new URLSearchParams();
  params.set("To", normalizeE164(phone));
  params.set("Code", String(code).trim());
  const result = await callVerify("VerificationCheck", params);
  return result?.status === "approved";
}
