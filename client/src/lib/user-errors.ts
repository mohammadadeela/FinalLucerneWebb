export type UiLanguage = "ar" | "en";

const GENERIC_ERROR = {
  ar: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى بعد قليل. نحن نعمل على حل المشكلة.",
  en: "Something went wrong. Please try again in a moment. We're working to fix the problem.",
};

const ERROR_TITLE = {
  ar: "حدث خطأ",
  en: "Something went wrong",
};

const NETWORK_ERROR = {
  ar: "تعذّر الاتصال بالخدمة. تحقّق من اتصال الإنترنت ثم حاول مرة أخرى.",
  en: "We couldn't connect to the service. Check your internet connection and try again.",
};

const ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  internal_server_error: GENERIC_ERROR,
  "internal server error": GENERIC_ERROR,
  "failed to fetch": NETWORK_ERROR,
  "network request failed": NETWORK_ERROR,
  "network_error": NETWORK_ERROR,
  "auth/network-request-failed": NETWORK_ERROR,
  unauthorized: {
    ar: "انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.",
    en: "Your session has expired. Please sign in again.",
  },
  "session_expired": {
    ar: "انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.",
    en: "Your session has expired. Please sign in again.",
  },
  account_blocked: {
    ar: "هذا الحساب محظور. يرجى التواصل مع الدعم للمساعدة.",
    en: "This account is blocked. Please contact support for help.",
  },
  email_not_found: {
    ar: "البريد الإلكتروني غير مسجّل.",
    en: "This email address is not registered.",
  },
  phone_not_found: {
    ar: "هذا الرقم غير مسجّل للدخول بالهاتف. يمكنك إنشاء حساب جديد به.",
    en: "This number is not signed up for phone login. You can create a new account with it.",
  },
  phone_not_registered: {
    ar: "لا يوجد حساب دخول بهذا الرقم بعد. يمكنك إنشاء حساب جديد به حتى لو استخدمته سابقاً لإتمام طلب.",
    en: "There is no phone sign-in account for this number yet. You can create one even if the number was previously used at checkout.",
  },
  invalid_password: {
    ar: "كلمة المرور غير صحيحة.",
    en: "The password is incorrect.",
  },
  email_taken: {
    ar: "البريد الإلكتروني مستخدم بالفعل. يرجى تسجيل الدخول.",
    en: "This email is already registered. Please sign in.",
  },
  phone_taken: {
    ar: "رقم الهاتف مستخدم بالفعل. يرجى تسجيل الدخول.",
    en: "This phone number is already registered. Please sign in.",
  },
  invalid_code: {
    ar: "رمز التحقق غير صحيح أو منتهي الصلاحية.",
    en: "The verification code is invalid or has expired.",
  },
  code_expired: {
    ar: "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.",
    en: "The verification code has expired. Please request a new one.",
  },
  too_many_attempts: {
    ar: "تم إجراء محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.",
    en: "Too many attempts were made. Please wait and try again.",
  },
  otp_cooldown: {
    ar: "يرجى الانتظار 30 ثانية قبل طلب رسالة أخرى.",
    en: "Please wait 30 seconds before requesting another message.",
  },
  otp_limit_reached: {
    ar: "تم إرسال رسالتين بالفعل. يرجى المحاولة مرة أخرى بعد انتهاء صلاحية الرمز.",
    en: "Two messages have already been sent. Please try again after the code expires.",
  },
  send_failed: {
    ar: "تعذّر إرسال الرسالة حالياً. يرجى المحاولة مرة أخرى بعد قليل.",
    en: "We couldn't send the message right now. Please try again shortly.",
  },
  verification_failed: {
    ar: "تعذّر التحقق من الرمز. يرجى المحاولة مرة أخرى.",
    en: "We couldn't verify the code. Please try again.",
  },
  phone_auth_disabled: {
    ar: "تسجيل الدخول بالهاتف غير متاح حالياً.",
    en: "Phone sign-in is currently unavailable.",
  },
  firebase_sms_disabled: {
    ar: "خدمة رسائل Firebase غير متاحة حالياً.",
    en: "Firebase SMS is currently unavailable.",
  },
  twilio_sms_disabled: {
    ar: "خدمة رسائل SMS غير متاحة حالياً.",
    en: "SMS verification is currently unavailable.",
  },
  whatsapp_not_configured: {
    ar: "خدمة واتساب غير متاحة حالياً. يرجى المحاولة لاحقاً.",
    en: "WhatsApp verification is currently unavailable. Please try again later.",
  },
  twilio_sms_not_configured: {
    ar: "خدمة الرسائل غير متاحة حالياً. يرجى المحاولة لاحقاً.",
    en: "SMS verification is currently unavailable. Please try again later.",
  },
  password_too_short: {
    ar: "يجب أن تتكوّن كلمة المرور من 6 أحرف على الأقل.",
    en: "Password must be at least 6 characters.",
  },
  already_used_by_user: {
    ar: "تم استخدام هذا الرمز مسبقاً.",
    en: "This code has already been used.",
  },
  out_of_stock: {
    ar: "أحد المنتجات غير متوفر بالكمية المطلوبة. يرجى مراجعة السلة.",
    en: "An item is unavailable in the requested quantity. Please review your cart.",
  },
  payment_failed: {
    ar: "تعذّر إتمام عملية الدفع. لم يتم تأكيد الطلب، يرجى المحاولة مرة أخرى.",
    en: "We couldn't complete the payment. The order was not confirmed; please try again.",
  },
  "api route not found": {
    ar: "هذه الخدمة غير متاحة حالياً. يرجى تحديث الصفحة والمحاولة مرة أخرى.",
    en: "This service is currently unavailable. Refresh the page and try again.",
  },
};

const TECHNICAL_ERROR_PATTERN = /(?:failed\s+query|\bselect\b[\s\S]*\bfrom\b|\binsert\s+into\b|\bupdate\s+.+\s+set\b|\bdelete\s+from\b|params?:|postgres|database\s+(?:error|query)|column\s+.+\s+does\s+not\s+exist|relation\s+.+\s+does\s+not\s+exist|constraint|syntax\s+error|econn\w+|enotfound|socket|stack|at\s+\w+\s*\(|node_modules|<html|<!doctype|firebase:\s*error|twilio.*(?:sid|token)|api[_ -]?key|unauthorized-domain)/i;

export function currentUiLanguage(): UiLanguage {
  if (typeof document !== "undefined") {
    return document.documentElement.lang === "en" ? "en" : "ar";
  }
  return "ar";
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as any;
    return String(value?.payload?.message || value?.message || value?.error || "");
  }
  return "";
}

function normalizeMessage(raw: string): string {
  let message = raw.trim();
  message = message.replace(/^\d{3}:\s*/, "");

  if (message.startsWith("{") && message.endsWith("}")) {
    try {
      const parsed = JSON.parse(message);
      message = String(parsed?.message || parsed?.error?.message || "");
    } catch {}
  }

  return message.trim();
}

function mapKnownMessage(message: string, language: UiLanguage): string | undefined {
  const normalized = message.toLowerCase().replace(/[.!]+$/, "").trim();
  const exact = ERROR_MESSAGES[normalized] || ERROR_MESSAGES[message];
  if (exact) return exact[language];

  if (/too many|rate.?limit|429/.test(normalized)) return ERROR_MESSAGES.too_many_attempts[language];
  if (/network|failed to fetch|load failed|offline/.test(normalized)) return NETWORK_ERROR[language];
  if (/unauthori[sz]ed|not authenticated|401/.test(normalized)) return ERROR_MESSAGES.unauthorized[language];
  if (/invalid.*(?:code|otp)|expired.*(?:code|otp)/.test(normalized)) return ERROR_MESSAGES.invalid_code[language];
  if (/out of stock|insufficient stock|not enough stock/.test(normalized)) return ERROR_MESSAGES.out_of_stock[language];
  if (/payment.*(?:failed|declined)|card.*declined/.test(normalized)) return ERROR_MESSAGES.payment_failed[language];
  return undefined;
}

export function userFriendlyErrorMessage(error: unknown, language: UiLanguage = currentUiLanguage()): string {
  const message = normalizeMessage(extractMessage(error));
  if (!message) return GENERIC_ERROR[language];

  const mapped = mapKnownMessage(message, language);
  if (mapped) return mapped;

  if (TECHNICAL_ERROR_PATTERN.test(message) || message.length > 240) {
    return GENERIC_ERROR[language];
  }

  const containsArabic = /[\u0600-\u06ff]/.test(message);
  if ((language === "ar" && containsArabic) || (language === "en" && !containsArabic)) {
    return message;
  }

  // Unknown server messages may not be suitable for the selected language.
  // Keep them out of the UI and use one consistent localized fallback.
  return GENERIC_ERROR[language];
}

export function userFriendlyErrorTitle(title: unknown, language: UiLanguage = currentUiLanguage()): string {
  const message = normalizeMessage(extractMessage(title));
  if (!message || TECHNICAL_ERROR_PATTERN.test(message) || message.length > 80) return ERROR_TITLE[language];
  const containsArabic = /[\u0600-\u06ff]/.test(message);
  if ((language === "ar" && containsArabic) || (language === "en" && !containsArabic)) return message;
  return ERROR_TITLE[language];
}
