import { useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLogin, useRegister, useAuth, mergeGuestCartInBackground } from "@/hooks/use-auth";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { signInWithGoogle, signInWithFacebook, handleFirebaseRedirectResult, getExistingProviderLabel, sendPhoneVerificationCode, confirmPhoneCode, resetRecaptcha } from "@/lib/firebase";
import { SiFacebook } from "react-icons/si";
import { Loader2, Mail, Lock, ShieldX, X, ArrowLeft, ArrowRight, Eye, EyeOff, BookmarkCheck, Phone, MessageSquare } from "lucide-react";
import { PhoneCountrySelect, PHONE_COUNTRIES } from "@/components/ui/PhoneCountrySelect";

// An Arabic keyboard's number row types Eastern Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩)
// instead of 0-9. \D (used everywhere below to strip non-digits) does NOT match
// those characters, so without this they'd be silently deleted — leaving a
// truncated/wrong phone number or OTP code with no visible error. Converting
// them to plain digits first fixes every numeric field in one place.
function normalizeArabicDigits(str: string): string {
  return str
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Browser/device autofill often inserts a saved contact's FULL international
 *  number (e.g. "+972597314193") into this digits-only field, which used to
 *  get silently truncated to 9 digits and produce a broken number. This strips
 *  a leading international access code ("00") and/or country code (970/972)
 *  so only the local number remains, and reports which country it matched so
 *  the prefix dropdown can be synced automatically. */
function stripAutofillCountryCode(rawDigits: string): { digits: string; prefix?: string } {
  let digits = rawDigits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  for (const c of PHONE_COUNTRIES) {
    const code = c.code.slice(1); // "970" | "972"
    if (digits.startsWith(code)) {
      let rest = digits.slice(code.length);
      if (rest.startsWith("0")) rest = rest.slice(1);
      return { digits: rest, prefix: c.code };
    }
  }
  return { digits };
}

type Step =
  | "auth"
  | "reg-email"
  | "reg-code"
  | "reg-details"
  | "forgot-email"
  | "forgot-code"
  | "forgot-newpass"
  | "phone-login"
  | "phone-entry"
  | "phone-otp"
  | "phone-signup-name"
  | "phone-signup-password"
  | "phone-reset-newpass";

type PhoneIntent = "signup" | "reset" | "verify-existing";
type PhoneChannel = "whatsapp" | "firebase" | "twilio";
type LastLoginMethod = "email" | "google" | "facebook" | "phone" | "phone-whatsapp" | "phone-sms" | "phone-sms-firebase" | "phone-sms-twilio";
type PhoneLoginErrorCode = "phone_not_found" | "phone_not_registered" | "invalid_password" | "account_blocked";

type LoginErrorCode = "email_not_found" | "invalid_password" | "account_blocked" | "google_account";

function LoginNotification({
  code,
  language,
  onSignup,
  onForgot,
  onGoogle,
  onDismiss,
}: {
  code: LoginErrorCode | null;
  language: string;
  onSignup: () => void;
  onForgot: () => void;
  onGoogle: () => void;
  onDismiss: () => void;
}) {
  if (!code) return null;

  const ar = language === "ar";

  const configs: Record<LoginErrorCode, {
    bg: string; border: string; iconWrap: string; iconColor: string;
    icon: ReactNode; title: string; desc: string;
    action?: () => void; actionLabel?: string; actionArrow?: ReactNode;
  }> = {
    email_not_found: {
      bg: "bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/40 dark:to-indigo-950/40",
      border: "border-violet-200 dark:border-violet-800",
      iconWrap: "bg-violet-100 dark:bg-violet-900/60",
      iconColor: "text-violet-600 dark:text-violet-400",
      icon: <Mail className="w-4 h-4" />,
      title: ar ? "البريد غير مسجّل" : "Email not registered",
      desc: ar ? "هذا البريد الإلكتروني غير موجود في النظام. هل تريدين إنشاء حساب جديد؟" : "This email does not exist in our system. Would you like to create a new account?",
      action: onSignup,
      actionLabel: ar ? "إنشاء حساب جديد" : "Create account",
      actionArrow: ar ? <ArrowLeft className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />,
    },
    google_account: {
      bg: "bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/40",
      border: "border-blue-200 dark:border-blue-800",
      iconWrap: "bg-blue-100 dark:bg-blue-900/60",
      iconColor: "text-blue-600 dark:text-blue-400",
      icon: <Mail className="w-4 h-4" />,
      title: ar ? "هذا الحساب مسجّل عبر Google" : "This account uses Google Sign-In",
      desc: ar
        ? "الرجاء تسجيل الدخول عبر Google."
        : "Please continue with Google instead.",
      action: onGoogle,
      actionLabel: ar ? "المتابعة عبر Google" : "Continue with Google",
      actionArrow: ar ? <ArrowLeft className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />,
    },
    invalid_password: {
      bg: "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40",
      border: "border-red-200 dark:border-red-800",
      iconWrap: "bg-red-100 dark:bg-red-900/60",
      iconColor: "text-red-600 dark:text-red-400",
      icon: <Lock className="w-4 h-4" />,
      title: ar ? "كلمة المرور غير صحيحة" : "Incorrect password",
      desc: ar ? "تحققي من كلمة المرور وحاولي مجدداً." : "Please check your password and try again.",
      action: onForgot,
      actionLabel: ar ? "نسيت كلمة المرور؟" : "Forgot password?",
      actionArrow: ar ? <ArrowLeft className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />,
    },
    account_blocked: {
      bg: "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40",
      border: "border-red-200 dark:border-red-800",
      iconWrap: "bg-red-100 dark:bg-red-900/60",
      iconColor: "text-red-600 dark:text-red-400",
      icon: <ShieldX className="w-4 h-4" />,
      title: ar ? "الحساب محظور" : "Account blocked",
      desc: ar ? "هذا الحساب محظور. تواصلي مع الدعم للمساعدة." : "This account has been blocked. Please contact support.",
    },
  };

  const cfg = configs[code];

  return (
    <div
      className={`relative flex items-start gap-3 p-4 rounded-2xl border ${cfg.bg} ${cfg.border} animate-in slide-in-from-top-1 fade-in duration-300`}
      data-testid="login-error-notification"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2.5 end-2.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
        data-testid="button-dismiss-notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className={`p-2 rounded-xl shrink-0 ${cfg.iconWrap}`}>
        <span className={cfg.iconColor}>{cfg.icon}</span>
      </div>

      <div className="flex-1 min-w-0 pe-4">
        <p className="font-bold text-sm text-foreground leading-snug">{cfg.title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cfg.desc}</p>
        {cfg.action && cfg.actionLabel && (
          <button
            type="button"
            onClick={cfg.action}
            className={`mt-2.5 inline-flex items-center gap-1 text-xs font-bold transition-all hover:gap-2 ${cfg.iconColor}`}
            data-testid="button-notification-action"
          >
            {cfg.actionLabel}
            {cfg.actionArrow}
          </button>
        )}
      </div>
    </div>
  );
}

function PhoneLoginNotification({
  code,
  language,
  onSignup,
  onForgot,
  onDismiss,
}: {
  code: PhoneLoginErrorCode | null;
  language: string;
  onSignup: () => void;
  onForgot: () => void;
  onDismiss: () => void;
}) {
  if (!code) return null;

  const ar = language === "ar";
  const isNotSignedUp = code === "phone_not_found" || code === "phone_not_registered";
  const isPassword = code === "invalid_password";

  const title = isNotSignedUp
    ? (ar ? "رقم الهاتف غير مسجّل" : "Phone number not signed up")
    : isPassword
      ? (ar ? "كلمة المرور غير صحيحة" : "Incorrect password")
      : (ar ? "الحساب محظور" : "Account blocked");

  const description = isNotSignedUp
    ? (ar
        ? "لا يوجد حساب دخول بهذا الرقم بعد. يمكنك إنشاء حساب جديد."
        : "No phone account exists for this number yet. You can create a new account.")
    : isPassword
      ? (ar ? "تحقّق من كلمة المرور أو أعد تعيينها." : "Check your password or reset it.")
      : (ar ? "يرجى التواصل مع الدعم للمساعدة." : "Please contact support for help.");

  return (
    <div
      className={`relative flex items-start gap-3 rounded-xl border p-3.5 animate-in fade-in slide-in-from-top-1 duration-200 ${
        isNotSignedUp
          ? "border-border/80 bg-muted/35"
          : "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/25"
      }`}
      data-testid="phone-login-error-notification"
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        isNotSignedUp
          ? "bg-background text-foreground shadow-sm ring-1 ring-border/70"
          : "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300"
      }`}>
        {isNotSignedUp
          ? <Phone className="h-4 w-4" />
          : isPassword
            ? <Lock className="h-4 w-4" />
            : <ShieldX className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1 pe-6">
        <p className="text-sm font-semibold leading-5 text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        {(isNotSignedUp || isPassword) && (
          <button
            type="button"
            onClick={isNotSignedUp ? onSignup : onForgot}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-85"
            data-testid="button-phone-login-error-action"
          >
            {isNotSignedUp
              ? (ar ? "إنشاء حساب برقم الهاتف" : "Create phone account")
              : (ar ? "إعادة تعيين كلمة المرور" : "Reset password")}
            {ar ? <ArrowLeft className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="absolute end-2.5 top-2.5 rounded-full p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        aria-label={ar ? "إغلاق" : "Dismiss"}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function Auth() {
  const [step, setStep] = useState<Step>("auth");
  const { data: user } = useAuth();
  const [, setLocation] = useLocation();
  const login = useLogin();
  const register = useRegister();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  // Login form
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem("auth_remember") === "true" ? (localStorage.getItem("auth_saved_email") || "") : "");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup multi-step state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem("auth_remember") === "true");

  // Remembers which sign-in method this browser last used successfully, so
  // returning customers see a hint like "You signed in with Google last
  // time" instead of having to guess which button to click. Phone sign-in is
  // one method; the saved account channel only controls OTP delivery.
  const [lastLoginMethod, setLastLoginMethod] = useState<LastLoginMethod | null>(
    () => (localStorage.getItem("auth_last_method") as any) || null,
  );
  function rememberLoginMethod(method: LastLoginMethod) {
    localStorage.setItem("auth_last_method", method);
    setLastLoginMethod(method);
  }
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [socialLoading, setSocialLoading] = useState<"google" | "facebook" | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  const { data: siteSettings } = useSiteSettings();
  // Three independent admin toggles — any combination can be enabled.
  // Each one shows its own dedicated button; nothing here decides "which one
  // wins" because the user picks the channel by tapping the matching button.
  const phoneSignupEnabled = getSetting(siteSettings, "phone_signup_enabled") !== "false"; // WhatsApp (Twilio)
  const firebaseSmsEnabled = getSetting(siteSettings, "firebase_sms_enabled") === "true";  // SMS (Firebase)
  const twilioSmsEnabled = getSetting(siteSettings, "twilio_sms_enabled") === "true";       // SMS (Twilio Messaging Service)
  const phoneAuthVisible = phoneSignupEnabled || firebaseSmsEnabled || twilioSmsEnabled;

  // Phone OTP state
  // Which delivery channel the user picked for this phone flow — set the
  // moment they tap the WhatsApp or SMS button, and drives every send/verify
  // call from then on (independent of whether the *other* toggle is also on).
  const [phoneChannel, setPhoneChannel] = useState<PhoneChannel>("whatsapp");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+970");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneFullNumber, setPhoneFullNumber] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [phoneIntent, setPhoneIntent] = useState<PhoneIntent>("signup");
  const [phoneLoginPassword, setPhoneLoginPassword] = useState("");
  const [phoneLoginError, setPhoneLoginError] = useState<PhoneLoginErrorCode | null>(null);
  const [phoneSignupPassword, setPhoneSignupPassword] = useState("");
  const [phoneSignupConfirm, setPhoneSignupConfirm] = useState("");
  const [phoneResetPassword, setPhoneResetPassword] = useState("");
  const [phoneResetConfirm, setPhoneResetConfirm] = useState("");
  const [showPhoneLoginPwd, setShowPhoneLoginPwd] = useState(false);
  const [showPhoneSignupPwd, setShowPhoneSignupPwd] = useState(false);
  const [showPhoneResetPwd, setShowPhoneResetPwd] = useState(false);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") setLocation("/admin");
    else if (user.role === "employee") setLocation("/admin/pos");
    else setLocation("/");
  }, [user]);

  // Handle redirect result after mobile Google/Facebook login
  useEffect(() => {
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    if (!apiKey) return;
    handleFirebaseRedirectResult()
      .then((result) => {
        if (!result) return;
        setSocialLoading(result.provider as "google" | "facebook");
        fetch("/api/auth/firebase-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ idToken: result.idToken, provider: result.provider, displayName: result.displayName }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.message || "Login failed");
            }
            const user = await res.json();
            queryClient.setQueryData([api.auth.me.path], user);
            queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
            queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
            queryClient.invalidateQueries({ queryKey: ["/api/wishlist/products"] });
            queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
            mergeGuestCartInBackground(queryClient);
            toast({ title: user?.isNewUser ? t.auth.welcomeToast : t.auth.welcomeBackToast });
            if (user?.role === "admin") setLocation("/admin");
            else if (user?.role === "employee") setLocation("/admin/pos");
            else setLocation("/");
          })
          .catch((err: any) => {
            const msg = err.message === "account_blocked" ? "هذا الحساب محظور" : err.message;
            toast({ title: t.auth.error, description: msg, variant: "destructive" });
          })
          .finally(() => setSocialLoading(null));
      })
      .catch((err: any) => {
        console.error("Firebase redirect error:", err?.code, err);
        const msg = firebaseErrorText(err?.code);
        if (msg) toast({ title: t.auth.error, description: msg, variant: "destructive" });
      });
  }, []);

  /* ─────────────────── Social login ─────────────────── */
  const firebaseLoginMutation = useMutation({
    mutationFn: async (data: { idToken: string; provider: string; displayName: string | null }) => {
      const res = await fetch("/api/auth/firebase-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (user, variables) => {
      queryClient.setQueryData([api.auth.me.path], user);
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      mergeGuestCartInBackground(queryClient);
      if (variables?.provider === "google" || variables?.provider === "facebook") {
        rememberLoginMethod(variables.provider);
      }
      toast({ title: (user as any)?.isNewUser ? t.auth.welcomeToast : t.auth.welcomeBackToast });
      if (user?.role === "admin") setLocation("/admin");
      else if (user?.role === "employee") setLocation("/admin/pos");
      else setLocation("/");
    },
    onError: (err: any) => {
      const msg = err.message === "account_blocked" ? "هذا الحساب محظور" : err.message;
      toast({ title: t.auth.error, description: msg, variant: "destructive" });
    },
  });

  /* ─────────────────── Signup mutations ─────────────────── */
  const sendSignupCodeMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/send-signup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Failed to send code");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: language === "ar" ? "تم إرسال رمز التحقق" : "Verification code sent" });
      setStep("reg-code");
      setResendCountdown(30);
    },
    onError: (err: any) => {
      if (err.message === "email_taken") {
        toast({
          title: t.auth.error,
          description: language === "ar" ? "هذا البريد مسجل مسبقاً، سجلي دخولك" : "This email is already registered",
          variant: "destructive",
        });
      } else if (err.message === "account_blocked") {
        toast({
          title: language === "ar" ? "الحساب محظور" : "Account blocked",
          description: language === "ar" ? "هذا الحساب محظور. تواصلي مع الدعم للمساعدة." : "This account has been blocked. Please contact support.",
          variant: "destructive",
        });
      } else {
        toast({ title: t.auth.error, description: err.message, variant: "destructive" });
      }
    },
  });

  const verifySignupCodeMutation = useMutation({
    mutationFn: async (data: { email: string; code: string }) => {
      const res = await fetch("/api/auth/verify-signup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Invalid code");
      }
      return res.json();
    },
    onSuccess: () => setStep("reg-details"),
    onError: (err: any) => {
      const msg = err.message === "invalid_code"
        ? (language === "ar" ? "الرمز غير صحيح أو منتهي الصلاحية" : "Invalid or expired code")
        : err.message;
      toast({ title: t.auth.error, description: msg, variant: "destructive" });
    },
  });

  /* ─────────────────── Forgot password mutations ─────────────────── */
  const [forgotEmailNotFound, setForgotEmailNotFound] = useState(false);

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed to send code");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.reason === "email_not_found") {
        setForgotEmailNotFound(true);
        return;
      }
      setForgotEmailNotFound(false);
      toast({ title: t.auth.codeSent });
      setStep("forgot-code");
      setResendCountdown(30);
    },
  });

  const verifyResetCodeMutation = useMutation({
    mutationFn: async (data: { email: string; code: string }) => {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Invalid code");
      }
      return res.json();
    },
    onSuccess: () => setStep("forgot-newpass"),
    onError: (err: any) => {
      const msg = err.message === "invalid_code" ? t.auth.invalidCode : err.message;
      toast({ title: t.auth.error, description: msg, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { email: string; code: string; newPassword: string }) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.auth.passwordResetSuccess });
      setStep("auth");
      setForgotEmail("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => {
      const msg = err.message === "invalid_code" ? t.auth.invalidCode : err.message;
      toast({ title: t.auth.error, description: msg, variant: "destructive" });
    },
  });

  /* ─────────────────── Phone OTP (Firebase) ─────────────────── */
  const phoneConfirmationRef = useRef<{ pendingVerifyToken?: string } | null>(null);
  // Holds the Firebase ConfirmationResult when the code was sent via Firebase SMS.
  // Null means the code went out via Twilio WhatsApp (legacy flow, unchanged).
  const firebaseSmsConfirmationRef = useRef<any>(null);
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  const handleAfterPhoneLogin = (userData: any, isNewUser?: boolean) => {
    queryClient.setQueryData([api.auth.me.path], userData);
    queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
    queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    mergeGuestCartInBackground(queryClient);
    rememberLoginMethod("phone");
    toast({ title: isNewUser ? t.auth.welcomeToast : t.auth.welcomeBackToast });
    if (userData?.role === "admin") setLocation("/admin");
    else if (userData?.role === "employee") setLocation("/admin/pos");
    else setLocation("/");
  };

  async function callJson(url: string, body: any) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e: any = new Error(data.message || "Request failed");
      e.status = res.status;
      e.payload = data;
      throw e;
    }
    return data;
  }

  // Comprehensive, human-friendly messages for every Firebase Auth error code
  // that can realistically surface in this app (popup, credential, network,
  // rate-limit, phone/OTP, and config errors). Falls back to a generic
  // message so raw "Firebase: Error (auth/...)" strings never reach users.
  function firebaseErrorText(code: string | undefined): string {
    const ar = language === "ar";
    switch (code) {
      // ── Credential / account problems ──
      case "auth/account-exists-with-different-credential":
        return ar ? "هذا البريد مسجّل مسبقاً بطريقة تسجيل دخول أخرى." : "This email is already registered with a different sign-in type.";
      case "auth/invalid-credential":
      case "auth/user-mismatch":
        return ar ? "بيانات الدخول غير صالحة. حاولي مجدداً." : "Sign-in credentials are invalid. Please try again.";
      case "auth/user-disabled":
        return ar ? "هذا الحساب معطّل. تواصلي مع الدعم." : "This account has been disabled. Please contact support.";
      case "auth/user-not-found":
        return ar ? "لا يوجد حساب بهذه البيانات." : "No account found with these details.";
      case "auth/email-already-in-use":
        return ar ? "هذا البريد مستخدم بالفعل." : "This email is already in use.";
      case "auth/invalid-email":
        return ar ? "صيغة البريد الإلكتروني غير صحيحة." : "The email address is not valid.";
      case "auth/wrong-password":
        return ar ? "كلمة المرور غير صحيحة." : "Incorrect password.";
      case "auth/credential-already-in-use":
        return ar ? "بيانات الدخول هذه مرتبطة بحساب آخر." : "These credentials are already linked to another account.";

      // ── Popup / redirect flow ──
      case "auth/popup-blocked":
        return ar ? "المتصفح منع النافذة المنبثقة. اسمحي بالنوافذ المنبثقة وحاولي مجدداً." : "Your browser blocked the sign-in popup. Please allow popups and try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
      case "auth/user-cancelled":
        return ""; // user cancelled — no toast needed
      case "auth/redirect-cancelled-by-user":
        return "";
      case "auth/operation-not-supported-in-this-environment":
        return ar ? "المتصفح الحالي لا يدعم هذه الطريقة. جرّبي متصفحاً آخر." : "This browser does not support this sign-in method. Try a different browser.";

      // ── Network / rate limits / availability ──
      case "auth/network-request-failed":
        return ar ? "مشكلة في الاتصال بالإنترنت. تحققي من الشبكة وحاولي مجدداً." : "Network problem. Check your internet connection and try again.";
      case "auth/too-many-requests":
        return ar ? "محاولات كثيرة. انتظري قليلاً ثم حاولي مجدداً." : "Too many attempts. Please wait a moment and try again.";
      case "auth/timeout":
        return ar ? "انتهت مهلة العملية. حاولي مجدداً." : "The request timed out. Please try again.";
      case "auth/quota-exceeded":
        return ar ? "الخدمة مشغولة حالياً. حاولي بعد قليل." : "The service is busy right now. Please try again shortly.";
      case "auth/internal-error":
        return ar ? "حدث خطأ غير متوقع. حاولي مجدداً." : "An unexpected error occurred. Please try again.";

      // ── Token / session ──
      case "auth/expired-action-code":
      case "auth/id-token-expired":
      case "auth/user-token-expired":
        return ar ? "انتهت صلاحية الجلسة. سجّلي الدخول مجدداً." : "Your session expired. Please sign in again.";
      case "auth/invalid-action-code":
        return ar ? "الرابط أو الرمز غير صالح أو منتهي." : "This link or code is invalid or has expired.";
      case "auth/requires-recent-login":
        return ar ? "هذه العملية تتطلب تسجيل دخول حديث. سجّلي الدخول مجدداً." : "This action requires a recent sign-in. Please sign in again.";

      // ── Phone / OTP ──
      case "auth/invalid-phone-number":
        return ar ? "رقم الهاتف غير صحيح." : "Invalid phone number.";
      case "auth/missing-phone-number":
        return ar ? "الرجاء إدخال رقم الهاتف." : "Please enter a phone number.";
      case "auth/invalid-verification-code":
        return ar ? "الرمز غير صحيح أو منتهي الصلاحية." : "Invalid or expired verification code.";
      case "auth/code-expired":
        return ar ? "انتهت صلاحية الرمز. اطلبي رمزاً جديداً." : "The code has expired. Please request a new one.";
      case "auth/missing-verification-code":
        return ar ? "الرجاء إدخال رمز التحقق." : "Please enter the verification code.";
      case "auth/captcha-check-failed":
        return ar ? "فشل التحقق الأمني. حدّثي الصفحة وحاولي مجدداً." : "Security check failed. Refresh the page and try again.";

      // ── Configuration (shown to user simply; details in console) ──
      case "auth/unauthorized-domain":
        return ar ? "النطاق غير مصرح له في إعدادات Firebase." : "This domain is not authorized in Firebase settings.";
      case "auth/operation-not-allowed":
        return ar ? "طريقة تسجيل الدخول هذه غير مفعّلة حالياً." : "This sign-in method is not currently enabled.";
      case "auth/invalid-api-key":
      case "auth/app-deleted":
      case "auth/app-not-authorized":
      case "auth/invalid-app-credential":
        return ar ? "خطأ في إعدادات تسجيل الدخول. تواصلي مع الدعم." : "Sign-in configuration error. Please contact support.";

      // ── Fallback: never show raw Firebase strings ──
      default:
        return ar ? "تعذّر تسجيل الدخول. حاولي مجدداً." : "Sign-in failed. Please try again.";
    }
  }

  function phoneErrorMessage(err: any): string {
    const code = err?.code || err?.message || "";
    if (code === "auth/invalid-phone-number") return language === "ar" ? "رقم الهاتف غير صحيح" : "Invalid phone number";
    if (code === "auth/too-many-requests") return language === "ar" ? "محاولات كثيرة، حاولي لاحقاً" : "Too many attempts, please try later";
    if (code === "auth/operation-not-allowed") return language === "ar" ? "تسجيل الدخول بالهاتف غير مفعّل في إعدادات Firebase" : "Phone sign-in is not enabled in Firebase settings";
    if (code === "auth/unauthorized-domain") return language === "ar" ? "النطاق غير مصرح له في Firebase" : "This domain is not authorized in Firebase Console";
    if (code === "auth/invalid-verification-code" || code === "invalid_code") return language === "ar" ? "الرمز غير صحيح أو منتهي الصلاحية" : "Invalid or expired code";
    if (code === "phone_taken") return language === "ar" ? "هذا الرقم مسجل بالفعل، سجّلي الدخول" : "This number is already registered, please sign in";
    if (code === "phone_not_found") return language === "ar" ? "هذا الرقم غير مسجل" : "This phone number is not registered";
    if (code === "phone_not_registered") return language === "ar" ? "هذا الرقم غير مسجّل للدخول بالهاتف بعد. يمكنك إنشاء حساب جديد به" : "This number is not signed up for phone login yet. You can create a new account with it";
    if (code === "invalid_password") return language === "ar" ? "كلمة المرور غير صحيحة" : "Incorrect password";
    if (code === "phone_auth_disabled") return language === "ar" ? "تسجيل الدخول بالهاتف معطّل" : "Phone sign-in is disabled";
    if (code === "twilio_sms_disabled") return language === "ar" ? "تسجيل الدخول عبر SMS غير متاح حالياً" : "SMS sign-in is currently unavailable";
    if (code === "twilio_sms_not_configured") return language === "ar" ? "خدمة رسائل SMS غير متاحة حالياً" : "SMS verification is currently unavailable";
    if (code === "firebase_sms_disabled") return language === "ar" ? "تسجيل الدخول عبر SMS غير متاح حالياً" : "SMS sign-in is currently unavailable";
    if (code === "otp_cooldown") {
      const seconds = Number(err?.secondsLeft || err?.payload?.secondsLeft || 30);
      return language === "ar" ? `انتظر ${seconds} ثانية قبل إرسال رسالة أخرى` : `Wait ${seconds} seconds before sending another message`;
    }
    if (code === "otp_limit_reached") return language === "ar" ? "تم إرسال رسالتين بالفعل. حاول مرة أخرى بعد انتهاء صلاحية الرمز" : "Two messages have already been sent. Try again after the code expires";
    if (code === "send_failed") return language === "ar" ? "تعذّر إرسال رسالة SMS" : "Failed to send the SMS message";
    if (code === "verification_failed") return language === "ar" ? "تعذّر التحقق من الرمز" : "Failed to verify the code";
    if (code === "password_too_short") return language === "ar" ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters";
    if (code === "account_blocked") return language === "ar" ? "هذا الحساب محظور" : "This account is blocked";
    // Any other Firebase auth code → comprehensive handler (never raw strings)
    if (typeof code === "string" && code.startsWith("auth/")) return firebaseErrorText(code);
    return language === "ar"
      ? "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى، وإذا استمرت المشكلة فنحن نعمل على إصلاحها."
      : "Something unexpected went wrong. Please try again; if it continues, we are working to fix it.";
  }

  // Send a single OTP over the given channel:
  //   "whatsapp" → Twilio WhatsApp message (original flow, unchanged)
  //   "firebase" → real SMS via Firebase phone auth
  //   "twilio"   → SMS via the configured Twilio sender
  // The channel is decided by which button the user tapped (phoneChannel),
  // not by re-reading the toggles here — so if both toggles are on, each
  // button reliably drives its own channel with no cross-fallback.
  async function sendOtpForIntent(intent: PhoneIntent, fullPhoneE164: string, channel: PhoneChannel = phoneChannel) {
    setPhoneIntent(intent);
    setPhoneChannel(channel);
    setPhoneFullNumber(fullPhoneE164);
    setPhoneOtp("");
    (phoneConfirmationRef as any).pendingVerifyToken = undefined;
    phoneConfirmationRef.current = null;
    firebaseSmsConfirmationRef.current = null;
    setPhoneSending(true);
    try {
      if (channel === "firebase") {
        // ── Firebase SMS path ──
        let reservationId = "";
        try {
          const permission = await callJson("/api/auth/phone-otp-send-permission", { phone: fullPhoneE164 });
          reservationId = permission.reservationId;
          const confirmation = await sendPhoneVerificationCode(fullPhoneE164, "recaptcha-container");
          firebaseSmsConfirmationRef.current = confirmation;
          await callJson("/api/auth/phone-otp-send-complete", { reservationId });
          setResendCountdown(30);
          toast({ title: language === "ar" ? "تم إرسال الرمز إلى رقمك عبر SMS" : "Code sent to your number via SMS" });
          setStep("phone-otp");
        } catch (fbErr: any) {
          if (reservationId) {
            await callJson("/api/auth/phone-otp-send-failed", { reservationId }).catch(() => undefined);
          }
          const rawCode = fbErr?.code || fbErr?.message || "unknown";
          console.error("[firebase-sms] send failed:", rawCode);
          resetRecaptcha();
          firebaseSmsConfirmationRef.current = null;
          const friendly = phoneErrorMessage(fbErr);
          toast({
            title: t.auth.error,
            description: friendly,
            variant: "destructive",
          });
          throw fbErr;
        }
        return;
      }
      if (channel === "twilio") {
        await callJson("/api/auth/twilio-sms-send-otp", { phone: fullPhoneE164 });
        setResendCountdown(30);
        toast({ title: language === "ar" ? "تم إرسال الرمز إلى رقمك عبر SMS" : "Code sent to your number via SMS" });
        setStep("phone-otp");
        return;
      }
      // ── Twilio WhatsApp path — unchanged ──
      await callJson("/api/auth/wa-send-otp", { phone: fullPhoneE164 });
      setResendCountdown(30);
      toast({ title: language === "ar" ? "تم إرسال الرمز إلى رقم واتساب الخاص بك" : "Code sent to your WhatsApp number" });
      setStep("phone-otp");
    } catch (err: any) {
      if (channel !== "firebase") {
        const code = err?.payload?.message || err?.message;
        toast({ title: t.auth.error, description: phoneErrorMessage({ message: code, payload: err?.payload, secondsLeft: err?.payload?.secondsLeft }), variant: "destructive" });
      }
      throw err;
    } finally {
      setPhoneSending(false);
    }
  }

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phoneNumber.replace(/\D/g, "");
    if (!digits) return;
    const fullPhoneE164 = `${phoneCountryCode}${digits}`;
    let channel = phoneChannel;
    if (phoneIntent === "signup") {
      try {
        await callJson("/api/auth/phone-signup-status", { phone: fullPhoneE164 });
      } catch (err: any) {
        toast({ title: t.auth.error, description: phoneErrorMessage({ message: err?.payload?.message || err?.message }), variant: "destructive" });
        return;
      }
    }
    if (phoneIntent === "reset") {
      try {
        const result = await callJson("/api/auth/phone-reset-channel", { phone: fullPhoneE164 });
        channel = result.channel as PhoneChannel;
        setPhoneChannel(channel);
      } catch (err: any) {
        toast({ title: t.auth.error, description: phoneErrorMessage({ message: err?.payload?.message || err?.message }), variant: "destructive" });
        return;
      }
    }
    try { await sendOtpForIntent(phoneIntent, fullPhoneE164, channel); } catch {}
  };

  const handleVerifyPhoneOtp = async () => {
    if (phoneOtp.length !== 6) return;
    setPhoneVerifying(true);
    try {
      let verifyToken: string;
      if (firebaseSmsConfirmationRef.current) {
        // ── Firebase SMS path: confirm the code with Firebase, then trade the
        // resulting ID token for the same server-side verifyToken the
        // WhatsApp flow produces.
        const { idToken } = await confirmPhoneCode(firebaseSmsConfirmationRef.current, phoneOtp);
        const resp = await callJson("/api/auth/firebase-phone-verify", { idToken });
        verifyToken = resp.verifyToken;
        firebaseSmsConfirmationRef.current = null;
        resetRecaptcha();
      } else if (phoneChannel === "twilio") {
        const resp = await callJson("/api/auth/twilio-sms-verify-otp", {
          phone: phoneFullNumber,
          code: phoneOtp,
        });
        verifyToken = resp.verifyToken;
      } else {
        // ── Twilio WhatsApp path — unchanged ──
        const resp = await callJson("/api/auth/wa-verify-otp", {
          phone: phoneFullNumber,
          code: phoneOtp,
        });
        verifyToken = resp.verifyToken;
      }
      (phoneConfirmationRef as any).pendingVerifyToken = verifyToken;

      if (phoneIntent === "verify-existing") {
        const data = await callJson("/api/auth/phone-mark-verified", { verifyToken });
        if (data.user) handleAfterPhoneLogin(data.user, data.isNewUser);
      } else if (phoneIntent === "signup") {
        setStep("phone-signup-name");
      } else if (phoneIntent === "reset") {
        setStep("phone-reset-newpass");
      }
    } catch (err: any) {
      const code = err?.code || err?.payload?.message || err?.message;
      const friendly = phoneErrorMessage({ code, message: code });
      toast({ title: t.auth.error, description: friendly, variant: "destructive" });
    } finally {
      setPhoneVerifying(false);
    }
  };

  // Phone+password login.
  const phoneLoginMutation = useMutation({
    mutationFn: async (vars: { phone: string; password: string }) =>
      await callJson("/api/auth/phone-login", vars),
    onSuccess: (data) => {
      setPhoneLoginError(null);
      if (data?.user) handleAfterPhoneLogin(data.user, data.isNewUser);
    },
    onError: async (err: any) => {
      if (err?.status === 403 && err?.payload?.message === "needs_verification") {
        // Auto-send OTP and route to OTP step in verify-existing mode.
        const fullPhoneE164 = `${phoneCountryCode}${phoneNumber.replace(/\D/g, "")}`;
        const savedChannel = (err?.payload?.channel || "whatsapp") as PhoneChannel;
        setPhoneChannel(savedChannel);
        toast({
          title: language === "ar" ? "حسابك غير موثّق" : "Account not verified",
          description: savedChannel !== "whatsapp"
            ? (language === "ar" ? "سنرسل لك رمز SMS لتوثيق رقمك" : "We'll send you an SMS code to verify your number")
            : (language === "ar" ? "سنرسل لك رمز عبر واتساب لتوثيق رقمك" : "We'll send you a WhatsApp code to verify your number"),
        });
        try { await sendOtpForIntent("verify-existing", fullPhoneE164, savedChannel); } catch {}
        return;
      }
      const code = (err?.payload?.message || err?.message) as PhoneLoginErrorCode;
      if (["phone_not_found", "phone_not_registered", "invalid_password", "account_blocked"].includes(code)) {
        setPhoneLoginError(code);
        return;
      }
      toast({ title: t.auth.error, description: phoneErrorMessage({ message: code }), variant: "destructive" });
    },
  });

  // Final step of signup — submit name + password with stashed verifyToken.
  const phoneSignupMutation = useMutation({
    mutationFn: async (vars: { fullName: string; password: string }) => {
      const verifyToken = (phoneConfirmationRef as any).pendingVerifyToken as string | undefined;
      if (!verifyToken) throw new Error(language === "ar" ? "انتهت الجلسة، ابدئي من جديد" : "Session expired, please start over");
      return await callJson("/api/auth/phone-signup", { verifyToken, ...vars });
    },
    onSuccess: (data) => { if (data?.user) handleAfterPhoneLogin(data.user, data.isNewUser); },
    onError: (err: any) => toast({ title: t.auth.error, description: phoneErrorMessage({ message: err?.payload?.message || err?.message }), variant: "destructive" }),
  });

  // Final step of reset — submit new password with stashed verifyToken.
  const phoneResetMutation = useMutation({
    mutationFn: async (vars: { newPassword: string }) => {
      const verifyToken = (phoneConfirmationRef as any).pendingVerifyToken as string | undefined;
      if (!verifyToken) throw new Error(language === "ar" ? "انتهت الجلسة، ابدئي من جديد" : "Session expired, please start over");
      return await callJson("/api/auth/phone-reset-password", { verifyToken, ...vars });
    },
    onSuccess: (data) => {
      toast({ title: language === "ar" ? "تم تحديث كلمة المرور" : "Password updated" });
      if (data?.user) handleAfterPhoneLogin(data.user, data.isNewUser);
    },
    onError: (err: any) => toast({ title: t.auth.error, description: phoneErrorMessage({ message: err?.payload?.message || err?.message }), variant: "destructive" }),
  });

  /* ─────────────────── Handlers ─────────────────── */
  const [loginError, setLoginError] = useState<LoginErrorCode | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const result = await login.mutateAsync({ email: loginEmail, password: loginPassword });
      rememberLoginMethod("email");
      if (rememberMe) {
        localStorage.setItem("auth_remember", "true");
        localStorage.setItem("auth_saved_email", loginEmail);
      } else {
        localStorage.removeItem("auth_remember");
        localStorage.removeItem("auth_saved_email");
      }
      toast({ title: t.auth.welcomeBackToast });
      if ((result as any)?.role === "admin") setLocation("/admin");
      else if ((result as any)?.role === "employee") setLocation("/admin/pos");
      else setLocation("/");
    } catch (err: any) {
      const code = err.message;
      if (code === "email_not_found" || code === "invalid_password" || code === "account_blocked" || code === "google_account") {
        setLoginError(code as LoginErrorCode);
      } else {
        toast({ title: t.auth.error, description: err.message, variant: "destructive" });
      }
    }
  };

  const handleSendSignupCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail) return;
    sendSignupCodeMutation.mutate(signupEmail);
  };

  const handleVerifySignupCode = () => {
    if (signupCode.length !== 6) return;
    verifySignupCodeMutation.mutate({ email: signupEmail, code: signupCode });
  };

  const getPasswordStrength = (pw: string) => {
    const checks = {
      length: pw.length >= 8,
      number: /[0-9]/.test(pw),
    };
    const passed = Object.values(checks).filter(Boolean).length;
    return { checks, passed };
  };

  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupConfirmPassword) {
      toast({ title: t.auth.error, description: t.auth.passwordMismatch, variant: "destructive" });
      return;
    }
    if (signupPassword.length < 8) {
      toast({ title: t.auth.error, description: t.auth.passwordTooShort, variant: "destructive" });
      return;
    }
    const { checks } = getPasswordStrength(signupPassword);
    if (!checks.number) {
      toast({ title: t.auth.error, description: (t.auth as any).passwordWeak, variant: "destructive" });
      return;
    }
    try {
      await register.mutateAsync({
        email: signupEmail,
        password: signupPassword,
        fullName: signupFullName,
        signupCode,
      } as any);
      rememberLoginMethod("email");
      toast({ title: t.auth.welcomeToast });
      setLocation("/");
    } catch (err: any) {
      toast({ title: t.auth.error, description: err.message, variant: "destructive" });
    }
  };

  const handleGoogleLogin = async () => {
    setSocialLoading("google");
    try {
      const result = await signInWithGoogle();
      if (!result) { setSocialLoading(null); return; } // redirect in progress — page will navigate away
      firebaseLoginMutation.mutate(
        { idToken: result.idToken, provider: "google", displayName: result.displayName },
        { onSettled: () => setSocialLoading(null) }
      );
    } catch (err: any) {
      setSocialLoading(null);
      console.error("[google-login]", err?.code, err);
      if (err.code === "auth/account-exists-with-different-credential") {
        const email = err.customData?.email as string | undefined;
        const providerLabel = email ? await getExistingProviderLabel(email) : null;
        const desc = providerLabel === "Facebook"
          ? (language === "ar" ? "هذا البريد مسجّل مسبقاً عبر Facebook. الرجاء تسجيل الدخول عبر Facebook." : "This email is already registered with Facebook. Please sign in with Facebook instead.")
          : providerLabel === "email"
          ? (language === "ar" ? "هذا البريد مسجّل ببريد وكلمة مرور عاديين. الرجاء تسجيل الدخول بكلمة المرور." : "This email is already registered with a regular password. Please sign in with your email and password instead.")
          : (language === "ar" ? "هذا البريد مسجّل مسبقاً بطريقة تسجيل دخول أخرى. جرّبي تسجيل الدخول بالطريقة التي أنشأتِ بها الحساب." : "This email is already registered with a different sign-in type. Please use the method you originally signed up with.");
        toast({ title: t.auth.error, description: desc, variant: "destructive" });
      } else {
        const msg = firebaseErrorText(err.code);
        if (msg) toast({ title: t.auth.error, description: msg, variant: "destructive" });
      }
    }
  };

  const handleFacebookLogin = async () => {
    setSocialLoading("facebook");
    try {
      const result = await signInWithFacebook();
      if (!result) { setSocialLoading(null); return; } // redirect in progress — page will navigate away
      firebaseLoginMutation.mutate(
        { idToken: result.idToken, provider: "facebook", displayName: result.displayName },
        { onSettled: () => setSocialLoading(null) }
      );
    } catch (err: any) {
      setSocialLoading(null);
      console.error("[facebook-login]", err?.code, err);
      if (err.code === "auth/account-exists-with-different-credential") {
        const email = err.customData?.email as string | undefined;
        const providerLabel = email ? await getExistingProviderLabel(email) : null;
        const desc = providerLabel === "Google"
          ? (language === "ar" ? "هذا البريد مسجّل مسبقاً عبر Google. الرجاء تسجيل الدخول عبر Google." : "This email is already registered with Google. Please sign in with Google instead.")
          : providerLabel === "email"
          ? (language === "ar" ? "هذا البريد مسجّل ببريد وكلمة مرور عاديين. الرجاء تسجيل الدخول بكلمة المرور." : "This email is already registered with a regular password. Please sign in with your email and password instead.")
          : (language === "ar" ? "هذا البريد مسجّل مسبقاً بطريقة تسجيل دخول أخرى. جرّبي تسجيل الدخول بالطريقة التي أنشأتِ بها الحساب." : "This email is already registered with a different sign-in type. Please use the method you originally signed up with.");
        toast({ title: t.auth.error, description: desc, variant: "destructive" });
      } else {
        const msg = firebaseErrorText(err.code);
        if (msg) toast({ title: t.auth.error, description: msg, variant: "destructive" });
      }
    }
  };

  const handleForgotSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    forgotPasswordMutation.mutate(forgotEmail);
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t.auth.error, description: t.auth.passwordMismatch, variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: t.auth.error, description: t.auth.passwordTooShort, variant: "destructive" });
      return;
    }
    resetPasswordMutation.mutate({ email: forgotEmail, code: resetCode, newPassword });
  };

  /* ─────────────────── Shared UI helpers ─────────────────── */
  const SocialButtons = ({ highlightLastUsed = false }: { highlightLastUsed?: boolean }) => {
    const isLast = (m: "google" | "facebook") => highlightLastUsed && lastLoginMethod === m;
    const baseBtn =
      "relative w-full h-12 flex items-center justify-center gap-3 rounded-xl border text-sm font-medium " +
      "transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none";
    const normalBtn = "border-border bg-background hover:bg-muted hover:border-foreground/20 hover:shadow-sm";
    const lastBtn = "border-primary/60 bg-primary/[0.04] shadow-[0_0_0_3px] shadow-primary/10";
    const badge = (
      <span className="absolute -top-2 end-3 text-[10px] leading-none px-2 py-1 rounded-full bg-primary text-primary-foreground font-medium shadow-sm">
        {language === "ar" ? "آخر استخدام" : "Last used"}
      </span>
    );
    return (
      <div className="space-y-3 mb-6">
        <button
          onClick={handleGoogleLogin}
          disabled={!!socialLoading || firebaseLoginMutation.isPending}
          className={`${baseBtn} ${isLast("google") ? lastBtn : normalBtn}`}
          data-testid="button-google-login"
        >
          {socialLoading === "google" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {t.auth.continueWithGoogle}
          {isLast("google") && badge}
        </button>

        <button
          onClick={handleFacebookLogin}
          disabled={!!socialLoading || firebaseLoginMutation.isPending}
          className={`${baseBtn} ${isLast("facebook") ? lastBtn : normalBtn}`}
          data-testid="button-facebook-login"
        >
          {socialLoading === "facebook" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <SiFacebook className="w-5 h-5 shrink-0 text-[#1877F2]" />
          )}
          {t.auth.continueWithFacebook}
          {isLast("facebook") && badge}
        </button>
      </div>
    );
  };

  const Divider = () => (
    <div className="relative flex items-center gap-3 mb-6">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground uppercase tracking-widest">{t.auth.orContinueWith}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );

  // Sign-in has one phone button because no OTP channel is needed for a normal
  // password login. Sign-up keeps the independent channel choices.
  const PhoneChannelButtons = ({
    mode,
    onPick,
    highlightLastUsed = false,
  }: {
    mode: "login" | "signup";
    onPick: (channel: PhoneChannel) => void;
    highlightLastUsed?: boolean;
  }) => {
    if (!phoneAuthVisible) return null;
    const waLabel = mode === "login"
      ? (language === "ar" ? "تسجيل الدخول عبر واتساب" : "Sign in with WhatsApp")
      : (language === "ar" ? "التسجيل عبر واتساب" : "Register with WhatsApp");
    const smsLabel = language === "ar" ? "التسجيل عبر SMS" : "Register with SMS";
    const isLast = (m: LastLoginMethod) => highlightLastUsed && lastLoginMethod === m;
    const normalBtn = "border-border hover:bg-muted";
    const lastBtn = "border-primary/60 bg-primary/[0.04] shadow-[0_0_0_3px] shadow-primary/10";
    const badge = (
      <span className="absolute -top-2 end-3 text-[10px] leading-none px-2 py-1 rounded-full bg-primary text-primary-foreground font-medium shadow-sm">
        {language === "ar" ? "آخر استخدام" : "Last used"}
      </span>
    );
    if (mode === "login") {
      const legacyPhoneMethods: LastLoginMethod[] = ["phone", "phone-whatsapp", "phone-sms", "phone-sms-firebase", "phone-sms-twilio"];
      const isLastPhone = highlightLastUsed && !!lastLoginMethod && legacyPhoneMethods.includes(lastLoginMethod);
      return (
        <div className="space-y-3 mt-4">
          <button
            type="button"
            onClick={() => onPick("whatsapp")}
            className={`relative w-full h-12 flex items-center justify-center gap-3 border transition-colors text-sm font-medium ${isLastPhone ? lastBtn : normalBtn}`}
            data-testid="button-phone-login"
          >
            <Phone className="w-4 h-4 text-primary shrink-0" />
            {language === "ar" ? "تسجيل الدخول باستخدام الهاتف" : "Sign in using Phone"}
            {isLastPhone && badge}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-3 mt-4">
        {phoneSignupEnabled && (
          <button
            type="button"
            onClick={() => onPick("whatsapp")}
            className={`relative w-full h-12 flex items-center justify-center gap-3 border transition-colors text-sm font-medium ${isLast("phone-whatsapp") ? lastBtn : normalBtn}`}
            data-testid={`button-phone-${mode}-whatsapp`}
          >
            <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            {waLabel}
            {isLast("phone-whatsapp") && badge}
          </button>
        )}
        {firebaseSmsEnabled && (
          <button
            type="button"
            onClick={() => onPick("firebase")}
            className={`relative w-full h-12 flex items-center justify-center gap-3 border transition-colors text-sm font-medium ${isLast("phone-sms-firebase") || isLast("phone-sms") ? lastBtn : normalBtn}`}
            data-testid={`button-phone-${mode}-sms-firebase`}
          >
            <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
            {smsLabel}
            {(isLast("phone-sms-firebase") || isLast("phone-sms")) && badge}
          </button>
        )}
        {twilioSmsEnabled && (
          <button
            type="button"
            onClick={() => onPick("twilio")}
            className={`relative w-full h-12 flex items-center justify-center gap-3 border transition-colors text-sm font-medium ${isLast("phone-sms-twilio") ? lastBtn : normalBtn}`}
            data-testid={`button-phone-${mode}-sms-twilio`}
          >
            <MessageSquare className="w-4 h-4 text-violet-600 shrink-0" />
            {smsLabel}
            {isLast("phone-sms-twilio") && badge}
          </button>
        )}
      </div>
    );
  };

  /* ─────────────────── Step indicator for signup ─────────────────── */
  const SignupStepIndicator = ({ current }: { current: 1 | 2 | 3 }) => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map(n => (
        <div key={n} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
            n === current
              ? "bg-foreground text-background border-foreground"
              : n < current
              ? "bg-foreground/20 text-foreground border-foreground/30"
              : "bg-transparent text-muted-foreground border-border"
          }`}>
            {n < current ? "✓" : n}
          </div>
          {n < 3 && <div className={`w-8 h-px ${n < current ? "bg-foreground/40" : "bg-border"}`} />}
        </div>
      ))}
    </div>
  );

  /* ─────────────────── Render ─────────────────── */
  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 py-20 bg-muted/20">
        <div className="bg-card w-full max-w-md p-6 sm:p-8 md:p-12 shadow-2xl border border-border/50">

          {/* ── LOGIN ── */}
          {step === "auth" && (
            <>
              <div className="text-center mb-8 sm:mb-10">
                <h1 className="font-display text-3xl sm:text-4xl mb-2" data-testid="text-auth-title">
                  {t.auth.signIn}
                </h1>
                <p className="text-muted-foreground text-sm">{t.auth.welcomeBack}</p>
              </div>

              <SocialButtons highlightLastUsed />
              <Divider />

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">{t.auth.email}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={loginEmail}
                    onChange={e => { setLoginEmail(e.target.value); setLoginError(null); }}
                    className={`rounded-md h-12 ${loginError === "email_not_found" ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">{t.auth.password}</Label>
                    <button
                      type="button"
                      onClick={() => { setForgotEmail(loginEmail); setStep("forgot-email"); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-forgot-password"
                    >
                      {t.auth.forgotPassword}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showLoginPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={e => { setLoginPassword(e.target.value); setLoginError(null); }}
                      className={`rounded-md h-12 pe-10 ${loginError === "invalid_password" || loginError === "account_blocked" ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      required
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(v => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-login-password"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setRememberMe(v => !v)}
                  className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all duration-300 group ${rememberMe ? "border-foreground/30 bg-foreground/5" : "border-border bg-transparent hover:bg-muted/40"}`}
                  data-testid="checkbox-remember-me"
                  aria-pressed={rememberMe}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${rememberMe ? "bg-foreground text-background" : "bg-muted text-muted-foreground group-hover:bg-muted/80"}`}>
                      <BookmarkCheck className="w-4 h-4" />
                    </span>
                    <div className="text-start">
                      <p className={`text-sm font-medium leading-none transition-colors ${rememberMe ? "text-foreground" : "text-muted-foreground"}`}>
                        {language === "ar" ? "تذكرني" : "Remember me"}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-none">
                        {language === "ar" ? "حفظ البريد لتسجيل دخول أسرع" : "Save email for faster sign-in"}
                      </p>
                    </div>
                  </div>
                  <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-all duration-300 ${rememberMe ? "bg-foreground" : "bg-muted"}`}>
                    <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ${rememberMe ? (language === "ar" ? "-translate-x-5" : "translate-x-5") : "translate-x-0.5"}`} />
                  </span>
                </button>

                <LoginNotification
                  code={loginError}
                  language={language}
                  onSignup={() => { setSignupEmail(loginEmail); setLoginError(null); setStep("reg-email"); }}
                  onForgot={() => { setForgotEmail(loginEmail); setStep("forgot-email"); }}
                  onGoogle={() => { setLoginError(null); handleGoogleLogin(); }}
                  onDismiss={() => setLoginError(null)}
                />

                <Button
                  type="submit"
                  disabled={login.isPending}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold mt-2"
                  data-testid="button-auth-submit"
                >
                  {login.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.auth.signIn}
                </Button>
              </form>

              <div className="relative flex items-center gap-3 mt-6">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">{language === "ar" ? "أو" : "OR"}</span>
                <div className="flex-1 border-t border-border" />
              </div>

              <PhoneChannelButtons
                mode="login"
                highlightLastUsed
                onPick={(channel) => {
                  setPhoneChannel(channel);
                  setPhoneNumber("");
                  setPhoneLoginPassword("");
                  setResendCountdown(0);
                  setStep("phone-login");
                }}
              />

              <div className="mt-6 text-center text-sm text-muted-foreground">
                {t.auth.noAccount}
                <button
                  onClick={() => { setSignupEmail(""); setSignupCode(""); setStep("reg-email"); }}
                  className="text-foreground font-semibold uppercase tracking-widest ms-1 hover:underline"
                  data-testid="button-toggle-auth"
                >
                  {t.auth.register}
                </button>
              </div>
            </>
          )}

          {/* ── SIGNUP STEP 1: EMAIL ── */}
          {step === "reg-email" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("auth")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-step1"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-2">
                <h1 className="font-display text-3xl mb-2" data-testid="text-auth-title">{t.auth.createAccount}</h1>
                <p className="text-muted-foreground text-sm">{t.auth.joinUs}</p>
              </div>

              <SignupStepIndicator current={1} />

              <SocialButtons />
              <Divider />

              <form onSubmit={handleSendSignupCode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">{t.auth.email}</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                    className="rounded-md h-12"
                    required
                    data-testid="input-signup-email"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={sendSignupCodeMutation.isPending}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-send-signup-code"
                >
                  {sendSignupCodeMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : (language === "ar" ? "إرسال رمز التحقق" : "Send Verification Code")}
                </Button>
              </form>

              <div className="relative flex items-center gap-3 mt-2">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">{language === "ar" ? "أو" : "OR"}</span>
                <div className="flex-1 border-t border-border" />
              </div>

              <PhoneChannelButtons
                mode="signup"
                onPick={(channel) => {
                  setPhoneChannel(channel);
                  setPhoneNumber("");
                  setPhoneOtp("");
                  setResendCountdown(0);
                  setPhoneIntent("signup");
                  setStep("phone-entry");
                }}
              />

              <div className="text-center text-sm text-muted-foreground">
                {t.auth.hasAccount}
                <button
                  onClick={() => setStep("auth")}
                  className="text-foreground font-semibold uppercase tracking-widest ms-1 hover:underline"
                  data-testid="button-back-to-login"
                >
                  {t.auth.signIn}
                </button>
              </div>
            </div>
          )}

          {/* ── SIGNUP STEP 2: VERIFICATION CODE ── */}
          {step === "reg-code" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("reg-email")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-step2"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-2">
                <h1 className="font-display text-3xl mb-2" data-testid="text-verify-title">
                  {language === "ar" ? "تأكيد البريد" : "Verify Email"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {language === "ar" ? "أرسلنا رمزاً إلى" : "We sent a code to"}{" "}
                  <span className="font-medium text-foreground">{signupEmail}</span>
                </p>
              </div>

              <SignupStepIndicator current={2} />

              <div className="space-y-2">
                <Label htmlFor="signup-code">
                  {language === "ar" ? "رمز التحقق" : "Verification Code"}
                </Label>
                <Input
                  id="signup-code"
                  value={signupCode}
                  onChange={e => setSignupCode(normalizeArabicDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                  className="rounded-md h-12 text-center text-2xl tracking-widest font-mono"
                  placeholder="000000"
                  maxLength={6}
                  data-testid="input-signup-code"
                />
              </div>

              <Button
                onClick={handleVerifySignupCode}
                disabled={signupCode.length !== 6 || verifySignupCodeMutation.isPending}
                className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                data-testid="button-verify-signup-code"
              >
                {verifySignupCodeMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : (language === "ar" ? "تحقق من الرمز" : "Verify Code")}
              </Button>

              <button
                onClick={() => { sendSignupCodeMutation.mutate(signupEmail); setResendCountdown(30); }}
                disabled={resendCountdown > 0 || sendSignupCodeMutation.isPending}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-resend-signup-code"
              >
                {resendCountdown > 0
                  ? `${language === "ar" ? "إعادة الإرسال" : "Resend"} (${resendCountdown}s)`
                  : sendSignupCodeMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin inline" />
                  : (language === "ar" ? "إعادة إرسال الرمز" : "Resend Code")}
              </button>
            </div>
          )}

          {/* ── SIGNUP STEP 3: NAME + PASSWORD ── */}
          {step === "reg-details" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("reg-code")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-step3"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-2">
                <h1 className="font-display text-3xl mb-2" data-testid="text-details-title">
                  {language === "ar" ? "أكملي تسجيلك" : "Complete Sign Up"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {language === "ar" ? "أدخلي اسمك وكلمة المرور" : "Enter your name and password"}
                </p>
              </div>

              <SignupStepIndicator current={3} />

              <form onSubmit={handleCompleteSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t.auth.fullName}</Label>
                  <Input
                    id="fullName"
                    value={signupFullName}
                    onChange={e => setSignupFullName(e.target.value)}
                    className="rounded-md h-12"
                    required
                    data-testid="input-fullname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">{t.auth.password}</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      value={signupPassword}
                      onChange={e => setSignupPassword(e.target.value)}
                      className="rounded-md h-12 pe-10"
                      required
                      data-testid="input-signup-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(v => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-signup-password"
                    >
                      {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {signupPassword.length > 0 && (() => {
                    const { checks, passed } = getPasswordStrength(signupPassword);
                    const colors = ["bg-red-500", "bg-green-500"];
                    const labels = language === "ar"
                      ? ["ضعيفة", "قوية"]
                      : ["Weak", "Strong"];
                    return (
                      <div className="space-y-2 pt-1">
                        <div className="flex gap-1">
                          {[0,1].map(i => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passed ? colors[passed - 1] : "bg-muted"}`} />
                          ))}
                        </div>
                        <p className={`text-xs font-medium ${passed < 2 ? "text-red-500" : "text-green-600"}`}>
                          {labels[passed - 1] || labels[0]}
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          <li className={checks.length ? "text-green-600" : ""}>
                            {checks.length ? "✓" : "✗"} {language === "ar" ? "8 أحرف على الأقل" : "At least 8 characters"}
                          </li>
                          <li className={checks.number ? "text-green-600" : ""}>
                            {checks.number ? "✓" : "✗"} {language === "ar" ? "رقم (0-9)" : "Number (0-9)"}
                          </li>
                        </ul>
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">
                    {language === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="signup-confirm-password"
                      type={showSignupConfirmPassword ? "text" : "password"}
                      value={signupConfirmPassword}
                      onChange={e => setSignupConfirmPassword(e.target.value)}
                      className="rounded-md h-12 pe-10"
                      required
                      data-testid="input-signup-confirm-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupConfirmPassword(v => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-signup-confirm-password"
                    >
                      {showSignupConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={register.isPending}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold mt-2"
                  data-testid="button-complete-signup"
                >
                  {register.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : (language === "ar" ? "إنشاء الحساب" : "Create Account")}
                </Button>
              </form>
            </div>
          )}

          {/* ── FORGOT PASSWORD — ENTER EMAIL ── */}
          {step === "forgot-email" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("auth")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-forgot-email"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-8">
                <h1 className="font-display text-3xl mb-2" data-testid="text-forgot-title">{t.auth.forgotPasswordTitle}</h1>
                <p className="text-muted-foreground text-sm">{t.auth.forgotPasswordDesc}</p>
              </div>
              <form onSubmit={handleForgotSendCode} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">{t.auth.email}</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); setForgotEmailNotFound(false); }}
                    className="rounded-md h-12"
                    required
                    data-testid="input-forgot-email"
                  />
                </div>

                {forgotEmailNotFound && (
                  <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40 dark:border-purple-800 p-4" data-testid="forgot-email-not-found">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-bold text-purple-900 dark:text-purple-200">{t.auth.emailNotRegistered}</p>
                        <p className="text-xs text-purple-700/70 dark:text-purple-300/70">{t.auth.wouldYouLikeToSignUp}</p>
                        <button
                          type="button"
                          onClick={() => { setSignupEmail(forgotEmail); setForgotEmailNotFound(false); setStep("reg-email"); }}
                          className="inline-flex items-center gap-1 text-sm font-bold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors mt-1"
                          data-testid="button-signup-instead"
                        >
                          {t.auth.signUpInstead} <span className="text-base">←</span>
                        </button>
                      </div>
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                        <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={forgotPasswordMutation.isPending}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-send-reset-code"
                >
                  {forgotPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.auth.sendCode}
                </Button>
              </form>
              <button
                onClick={() => { setForgotEmailNotFound(false); setStep("auth"); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-to-login"
              >
                {t.auth.backToLogin}
              </button>
            </div>
          )}

          {/* ── FORGOT PASSWORD — ENTER CODE ── */}
          {step === "forgot-code" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("forgot-email")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-forgot-code"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-4">
                <h1 className="font-display text-3xl mb-2" data-testid="text-reset-title">{t.auth.checkEmail}</h1>
                <p className="text-muted-foreground text-sm">{t.auth.verifyDesc} <span className="font-medium text-foreground">{forgotEmail}</span></p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-code">{t.auth.verificationCode}</Label>
                <Input
                  id="reset-code"
                  value={resetCode}
                  onChange={e => setResetCode(normalizeArabicDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                  className="rounded-md h-12 text-center text-2xl tracking-widest font-mono"
                  placeholder="000000"
                  maxLength={6}
                  data-testid="input-reset-code"
                />
              </div>
              <Button
                onClick={() => verifyResetCodeMutation.mutate({ email: forgotEmail, code: resetCode })}
                disabled={resetCode.length !== 6 || verifyResetCodeMutation.isPending}
                className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                data-testid="button-verify-reset-code"
              >
                {verifyResetCodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.auth.verify}
              </Button>
              <button
                onClick={() => forgotPasswordMutation.mutate(forgotEmail)}
                disabled={resendCountdown > 0 || forgotPasswordMutation.isPending}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-resend-code"
              >
                {resendCountdown > 0
                  ? `${t.auth.resendCode} (${resendCountdown}s)`
                  : forgotPasswordMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin inline" />
                  : t.auth.resendCode}
              </button>
              <button
                onClick={() => setStep("forgot-email")}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-to-forgot"
              >
                {t.auth.backToLogin}
              </button>
            </div>
          )}

          {/* ── FORGOT PASSWORD — SET NEW PASSWORD ── */}
          {step === "forgot-newpass" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("forgot-code")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-forgot-newpass"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-4">
                <h1 className="font-display text-3xl mb-2" data-testid="text-newpass-title">{t.auth.resetPassword}</h1>
                <p className="text-muted-foreground text-sm">{t.auth.enterCodeAndPassword}</p>
              </div>
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t.auth.newPassword}</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="rounded-md h-12 pe-10"
                      required
                      data-testid="input-new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(v => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-new-password"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t.auth.confirmNewPassword}</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="rounded-md h-12 pe-10"
                      required
                      data-testid="input-confirm-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(v => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-confirm-password"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={resetPasswordMutation.isPending}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-reset-password"
                >
                  {resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.auth.resetPassword}
                </Button>
              </form>
            </div>
          )}

          {/* ── PHONE: ENTER NUMBER ── */}
          {/* ── PHONE: SIGN-IN (phone + password) ── */}
          {step === "phone-login" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("auth")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-phone-login"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-2">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-7 h-7 text-primary" />
                </div>
                <h1 className="font-display text-3xl mb-2" data-testid="text-phone-login-title">
                  {language === "ar" ? "الدخول برقم الهاتف" : "Sign in with Phone"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {language === "ar" ? "أدخلي رقم هاتفك وكلمة المرور" : "Enter your phone number and password"}
                </p>
              </div>

              <PhoneLoginNotification
                code={phoneLoginError}
                language={language}
                onSignup={() => {
                  setPhoneLoginError(null);
                  setPhoneIntent("signup");
                  setPhoneOtp("");
                  setResendCountdown(0);
                  const currentChannelEnabled =
                    (phoneChannel === "whatsapp" && phoneSignupEnabled) ||
                    (phoneChannel === "firebase" && firebaseSmsEnabled) ||
                    (phoneChannel === "twilio" && twilioSmsEnabled);
                  if (!currentChannelEnabled) {
                    setPhoneChannel(phoneSignupEnabled ? "whatsapp" : firebaseSmsEnabled ? "firebase" : "twilio");
                  }
                  // Keep phoneCountryCode and phoneNumber unchanged so the
                  // number entered on sign-in is ready on the signup page.
                  setStep("phone-entry");
                }}
                onForgot={() => {
                  setPhoneLoginError(null);
                  setPhoneOtp("");
                  setPhoneIntent("reset");
                  setStep("phone-entry");
                }}
                onDismiss={() => setPhoneLoginError(null)}
              />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const digits = phoneNumber.replace(/\D/g, "");
                  if (!digits || !phoneLoginPassword) return;
                  phoneLoginMutation.mutate({ phone: `${phoneCountryCode}${digits}`, password: phoneLoginPassword });
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label>{language === "ar" ? "رقم الهاتف" : "Phone Number"}</Label>
                  <div className="flex gap-0 rounded-md border border-border focus-within:ring-2 focus-within:ring-ring" dir="ltr">
                    <PhoneCountrySelect
                      value={phoneCountryCode}
                      onChange={setPhoneCountryCode}
                      height="h-12"
                      testId="select-phone-login-country"
                    />
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneLoginError(null);
                        let digits = normalizeArabicDigits(e.target.value).replace(/\D/g, "");
                        const stripped = stripAutofillCountryCode(digits);
                        digits = stripped.digits;
                        if (digits.startsWith("0")) digits = digits.slice(1);
                        if (stripped.prefix) setPhoneCountryCode(stripped.prefix);
                        setPhoneNumber(digits.slice(0, 9));
                      }}
                      placeholder="59xxxxxxx"
                      className="flex-1 h-12 bg-background px-3 text-sm focus:outline-none rounded-e-md"
                      required
                      data-testid="input-phone-login-number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone-login-password">{t.auth.password}</Label>
                  <div className="relative">
                    <Input
                      id="phone-login-password"
                      type={showPhoneLoginPwd ? "text" : "password"}
                      value={phoneLoginPassword}
                      onChange={(e) => { setPhoneLoginPassword(e.target.value); setPhoneLoginError(null); }}
                      className="rounded-md h-12 pe-10"
                      required
                      data-testid="input-phone-login-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPhoneLoginPwd((v) => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPhoneLoginPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={phoneLoginMutation.isPending || phoneNumber.length < 7 || !phoneLoginPassword}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-submit-phone-login"
                >
                  {phoneLoginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.auth.signIn}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => { setPhoneOtp(""); setPhoneIntent("reset"); setStep("phone-entry"); }}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid="button-phone-forgot"
                  >
                    {language === "ar" ? "نسيت كلمة المرور؟" : "Forgot password?"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhoneOtp(""); setPhoneIntent("signup"); setStep("reg-email"); }}
                    className="text-foreground font-semibold hover:underline"
                    data-testid="button-phone-signup-from-login"
                  >
                    {language === "ar" ? "إنشاء حساب" : "Sign up"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === "phone-entry" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep(phoneIntent === "signup" ? "reg-email" : "phone-login")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-phone-entry"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-2">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  {phoneChannel !== "whatsapp"
                    ? <MessageSquare className="w-7 h-7 text-primary" />
                    : <Phone className="w-7 h-7 text-primary" />}
                </div>
                <h1 className="font-display text-3xl mb-2" data-testid="text-phone-entry-title">
                  {language === "ar"
                    ? (phoneIntent === "signup" ? "التسجيل برقم الهاتف" : "إعادة تعيين كلمة المرور")
                    : (phoneIntent === "signup" ? "Register with Phone" : "Reset Password")}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {phoneIntent === "reset"
                    ? (language === "ar"
                        ? "أدخل رقمك وسنرسل الرمز بنفس الطريقة التي استخدمتها عند إنشاء الحساب: واتساب أو SMS."
                        : "Enter your number and we'll send the code using the same method you chose when you registered: WhatsApp or SMS.")
                    : phoneChannel !== "whatsapp"
                    ? (language === "ar"
                        ? "سنرسل لك رمز تحقق عبر رسالة SMS."
                        : "We'll send you a verification code via SMS.")
                    : (language === "ar"
                        ? "سنرسل لك رمز عبر واتساب. يمكنك طلب رسالة ثانية بعد 30 ثانية."
                        : "We'll send you a WhatsApp code. You can request one more message after 30 seconds.")}
                </p>
              </div>

              <form onSubmit={handleSendPhoneOtp} className="space-y-5">
                <div className="space-y-2">
                  <Label>{language === "ar" ? "رقم الهاتف" : "Phone Number"}</Label>
                  <div className="flex gap-0 rounded-md border border-border focus-within:ring-2 focus-within:ring-ring" dir="ltr">
                    <PhoneCountrySelect
                      value={phoneCountryCode}
                      onChange={setPhoneCountryCode}
                      height="h-12"
                      testId="select-country-code"
                    />
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phoneNumber}
                      onChange={e => {
                        let digits = normalizeArabicDigits(e.target.value).replace(/\D/g, "");
                        const stripped = stripAutofillCountryCode(digits);
                        digits = stripped.digits;
                        if (digits.startsWith("0")) digits = digits.slice(1);
                        if (stripped.prefix) setPhoneCountryCode(stripped.prefix);
                        setPhoneNumber(digits.slice(0, 9));
                      }}
                      placeholder="59xxxxxxx"
                      className="flex-1 h-12 bg-background px-3 text-sm focus:outline-none rounded-e-md"
                      required
                      data-testid="input-phone-number"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {language === "ar"
                      ? `مثال: ${phoneCountryCode}59xxxxxxx`
                      : `Example: ${phoneCountryCode}59xxxxxxx`}
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={phoneSending || phoneNumber.length < 7}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-send-phone-otp"
                >
                  {phoneSending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : phoneIntent === "reset"
                      ? (language === "ar" ? "إرسال رمز التحقق" : "Send Verification Code")
                    : phoneChannel !== "whatsapp"
                      ? (language === "ar" ? "إرسال رمز SMS" : "Send SMS Code")
                      : (language === "ar" ? "إرسال رمز واتساب" : "Send WhatsApp Code")}
                </Button>
              </form>
            </div>
          )}

          {/* ── PHONE: ENTER OTP ── */}
          {step === "phone-otp" && (
            <div className="space-y-6">
              <button
                onClick={() => {
                  phoneConfirmationRef.current = null;
                  (phoneConfirmationRef as any).pendingVerifyToken = undefined;
                  firebaseSmsConfirmationRef.current = null;
                  resetRecaptcha();
                  setPhoneOtp("");
                  setStep("auth");
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-phone-otp"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-2">
                {phoneChannel !== "whatsapp" ? (
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${phoneChannel === "twilio" ? "bg-violet-100 dark:bg-violet-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`}>
                    <MessageSquare className={`w-7 h-7 ${phoneChannel === "twilio" ? "text-violet-600" : "text-blue-600"}`} />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  </div>
                )}
                <h1 className="font-display text-3xl mb-2" data-testid="text-phone-otp-title">
                  {phoneChannel === "whatsapp"
                    ? (language === "ar" ? "رمز واتساب" : "WhatsApp Code")
                    : (language === "ar" ? "رمز SMS" : "SMS Code")}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {language === "ar" ? "أرسلنا رمزاً إلى" : "We sent a code to"}{" "}
                  <span className="font-medium text-foreground" dir="ltr">{phoneCountryCode}{phoneNumber}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone-otp-input">
                  {language === "ar" ? "رمز التحقق" : "Verification Code"}
                </Label>
                <Input
                  id="phone-otp-input"
                  value={phoneOtp}
                  onChange={e => setPhoneOtp(normalizeArabicDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                  className="rounded-md h-12 text-center text-2xl tracking-widest font-mono"
                  placeholder="000000"
                  maxLength={6}
                  dir="ltr"
                  data-testid="input-phone-otp"
                />
              </div>

              <Button
                onClick={handleVerifyPhoneOtp}
                disabled={phoneOtp.length !== 6 || phoneVerifying}
                className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                data-testid="button-verify-phone-otp"
              >
                {phoneVerifying
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : (language === "ar" ? "تحقق من الرمز" : "Verify Code")}
              </Button>

              <div className="text-center space-y-2">
                <button
                  type="button"
                  onClick={() => sendOtpForIntent(phoneIntent, phoneFullNumber, phoneChannel).catch(() => undefined)}
                  disabled={resendCountdown > 0 || phoneSending}
                  className="text-sm font-medium text-primary disabled:text-muted-foreground disabled:cursor-not-allowed hover:underline"
                  data-testid="button-resend-phone-otp"
                >
                  {phoneSending
                    ? (language === "ar" ? "جارٍ الإرسال..." : "Sending...")
                    : resendCountdown > 0
                      ? (language === "ar" ? `إعادة الإرسال خلال ${resendCountdown} ثانية` : `Resend in ${resendCountdown}s`)
                      : (language === "ar" ? "إعادة إرسال الرمز" : "Resend code")}
                </button>
                <p className="text-xs text-muted-foreground">
                  {language === "ar"
                    ? "يمكن إرسال رسالتين كحد أقصى، وبينهما 30 ثانية."
                    : "A maximum of two messages can be sent, at least 30 seconds apart."}
                </p>
              </div>
            </div>
          )}

          {/* ── PHONE SIGNUP STEP 2: ENTER NAME ── */}
          {step === "phone-signup-name" && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <h1 className="font-display text-3xl mb-2" data-testid="text-phone-signup-name-title">
                  {language === "ar" ? "ما اسمك؟" : "Your Name"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {language === "ar" ? "سنستخدمه على فاتورتك وحسابك" : "We'll use this on your invoice and account"}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!phoneName.trim()) return;
                  setStep("phone-signup-password");
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="phone-fullname">{t.auth.fullName}</Label>
                  <Input
                    id="phone-fullname"
                    value={phoneName}
                    onChange={(e) => setPhoneName(e.target.value)}
                    className="rounded-md h-12"
                    required
                    data-testid="input-phone-fullname"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!phoneName.trim()}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-phone-name-next"
                >
                  {language === "ar" ? "التالي" : "Next"}
                </Button>
              </form>
            </div>
          )}

          {/* ── PHONE SIGNUP STEP 3: SET PASSWORD ── */}
          {step === "phone-signup-password" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("phone-signup-name")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-back-arrow-phone-signup-pwd"
                aria-label="Go back"
              >
                {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
              <div className="text-center mb-2">
                <h1 className="font-display text-3xl mb-2" data-testid="text-phone-signup-pwd-title">
                  {language === "ar" ? "أنشئي كلمة المرور" : "Create Password"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {language === "ar" ? "ستستخدمينها مع رقم هاتفك لتسجيل الدخول" : "You'll use it with your phone number to sign in"}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (phoneSignupPassword.length < 6) {
                    toast({ title: t.auth.error, description: phoneErrorMessage({ message: "password_too_short" }), variant: "destructive" });
                    return;
                  }
                  if (phoneSignupPassword !== phoneSignupConfirm) {
                    toast({ title: t.auth.error, description: language === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match", variant: "destructive" });
                    return;
                  }
                  phoneSignupMutation.mutate({ fullName: phoneName.trim(), password: phoneSignupPassword });
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="phone-signup-pwd">{t.auth.password}</Label>
                  <div className="relative">
                    <Input
                      id="phone-signup-pwd"
                      type={showPhoneSignupPwd ? "text" : "password"}
                      value={phoneSignupPassword}
                      onChange={(e) => setPhoneSignupPassword(e.target.value)}
                      className="rounded-md h-12 pe-10"
                      minLength={6}
                      required
                      data-testid="input-phone-signup-password"
                    />
                    <button type="button" onClick={() => setShowPhoneSignupPwd((v) => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                      {showPhoneSignupPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-signup-pwd-confirm">{language === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}</Label>
                  <Input
                    id="phone-signup-pwd-confirm"
                    type={showPhoneSignupPwd ? "text" : "password"}
                    value={phoneSignupConfirm}
                    onChange={(e) => setPhoneSignupConfirm(e.target.value)}
                    className="rounded-md h-12"
                    minLength={6}
                    required
                    data-testid="input-phone-signup-password-confirm"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={phoneSignupMutation.isPending}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-create-phone-account"
                >
                  {phoneSignupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === "ar" ? "إنشاء الحساب" : "Create Account")}
                </Button>
              </form>
            </div>
          )}

          {/* ── PHONE: SET NEW PASSWORD AFTER RESET ── */}
          {step === "phone-reset-newpass" && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <h1 className="font-display text-3xl mb-2" data-testid="text-phone-reset-pwd-title">
                  {language === "ar" ? "كلمة المرور الجديدة" : "New Password"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {language === "ar" ? "اختاري كلمة مرور جديدة لحسابك" : "Choose a new password for your account"}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (phoneResetPassword.length < 6) {
                    toast({ title: t.auth.error, description: phoneErrorMessage({ message: "password_too_short" }), variant: "destructive" });
                    return;
                  }
                  if (phoneResetPassword !== phoneResetConfirm) {
                    toast({ title: t.auth.error, description: language === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match", variant: "destructive" });
                    return;
                  }
                  phoneResetMutation.mutate({ newPassword: phoneResetPassword });
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="phone-reset-pwd">{language === "ar" ? "كلمة المرور الجديدة" : "New password"}</Label>
                  <div className="relative">
                    <Input
                      id="phone-reset-pwd"
                      type={showPhoneResetPwd ? "text" : "password"}
                      value={phoneResetPassword}
                      onChange={(e) => setPhoneResetPassword(e.target.value)}
                      className="rounded-md h-12 pe-10"
                      minLength={6}
                      required
                      data-testid="input-phone-reset-password"
                    />
                    <button type="button" onClick={() => setShowPhoneResetPwd((v) => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                      {showPhoneResetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-reset-pwd-confirm">{language === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}</Label>
                  <Input
                    id="phone-reset-pwd-confirm"
                    type={showPhoneResetPwd ? "text" : "password"}
                    value={phoneResetConfirm}
                    onChange={(e) => setPhoneResetConfirm(e.target.value)}
                    className="rounded-md h-12"
                    minLength={6}
                    required
                    data-testid="input-phone-reset-password-confirm"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={phoneResetMutation.isPending}
                  className="w-full rounded-md h-12 uppercase tracking-widest text-sm font-semibold"
                  data-testid="button-phone-reset-submit"
                >
                  {phoneResetMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === "ar" ? "حفظ" : "Save")}
                </Button>
              </form>
            </div>
          )}

        </div>
      </main>
      {/* Invisible reCAPTCHA anchor for Firebase SMS phone verification */}
      <div id="recaptcha-container" />
      <Footer />
    </div>
  );
}
