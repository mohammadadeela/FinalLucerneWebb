import { useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLogin, useRegister, useAuth, mergeGuestCartInBackground } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { signInWithGoogle, signInWithFacebook, handleFirebaseRedirectResult } from "@/lib/firebase";
import { SiFacebook } from "react-icons/si";
import { Loader2, Mail, Lock, ShieldX, X, ArrowLeft, ArrowRight, Eye, EyeOff, BookmarkCheck } from "lucide-react";

type Step =
  | "auth"
  | "reg-email"
  | "reg-code"
  | "reg-details"
  | "forgot-email"
  | "forgot-code"
  | "forgot-newpass";

type LoginErrorCode = "email_not_found" | "invalid_password" | "account_blocked";

function LoginNotification({
  code,
  language,
  onSignup,
  onForgot,
  onDismiss,
}: {
  code: LoginErrorCode | null;
  language: string;
  onSignup: () => void;
  onForgot: () => void;
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
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [socialLoading, setSocialLoading] = useState<"google" | "facebook" | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

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
            toast({ title: t.auth.welcomeBackToast });
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
        if (err.code === "auth/unauthorized-domain") {
          toast({ title: t.auth.error, description: language === "ar" ? "النطاق غير مصرح له في Firebase." : "This domain is not authorized in Firebase Console.", variant: "destructive" });
        } else {
          console.error("Firebase redirect error:", err);
        }
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
    onSuccess: (user) => {
      queryClient.setQueryData([api.auth.me.path], user);
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      mergeGuestCartInBackground(queryClient);
      toast({ title: t.auth.welcomeBackToast });
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

  /* ─────────────────── Handlers ─────────────────── */
  const [loginError, setLoginError] = useState<LoginErrorCode | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const result = await login.mutateAsync({ email: loginEmail, password: loginPassword });
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
      if (code === "email_not_found" || code === "invalid_password" || code === "account_blocked") {
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
      toast({ title: t.auth.welcomeBackToast });
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
      if (err.code === "auth/unauthorized-domain") {
        toast({ title: t.auth.error, description: language === "ar" ? "النطاق غير مصرح له في Firebase. يرجى إضافته من لوحة التحكم." : "This domain is not authorized in Firebase Console.", variant: "destructive" });
      } else if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request" || err.code === "auth/popup-blocked") {
        // closed or blocked — no toast needed
      } else {
        toast({ title: t.auth.error, description: err.message, variant: "destructive" });
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
      if (err.code === "auth/operation-not-allowed") {
        toast({ title: t.auth.error, description: language === "ar" ? "تسجيل الدخول بفيسبوك غير مفعّل. يرجى التواصل مع الدعم." : "Facebook login is not enabled. Please contact support.", variant: "destructive" });
      } else if (err.code === "auth/unauthorized-domain") {
        toast({ title: t.auth.error, description: language === "ar" ? "النطاق غير مصرح له في إعدادات Firebase. يرجى إضافته من لوحة التحكم." : "This domain is not authorized in Firebase. Add it in Firebase Console → Authorized Domains.", variant: "destructive" });
      } else if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request" || err.code === "auth/popup-blocked") {
        // closed or blocked — no toast needed
      } else {
        toast({ title: t.auth.error, description: err.message, variant: "destructive" });
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
  const SocialButtons = () => (
    <div className="space-y-3 mb-6">
      <button
        onClick={handleGoogleLogin}
        disabled={!!socialLoading || firebaseLoginMutation.isPending}
        className="w-full h-12 flex items-center justify-center gap-3 border border-border hover:bg-muted transition-colors text-sm font-medium"
        data-testid="button-google-login"
      >
        {socialLoading === "google" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        {t.auth.continueWithGoogle}
      </button>

      <button
        onClick={handleFacebookLogin}
        disabled={!!socialLoading || firebaseLoginMutation.isPending}
        className="w-full h-12 flex items-center justify-center gap-3 border border-border hover:bg-muted transition-colors text-sm font-medium"
        data-testid="button-facebook-login"
      >
        {socialLoading === "facebook" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <SiFacebook className="w-5 h-5 text-[#1877F2]" />
        )}
        {t.auth.continueWithFacebook}
      </button>
    </div>
  );

  const Divider = () => (
    <div className="relative flex items-center gap-3 mb-6">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground uppercase tracking-widest">{t.auth.orContinueWith}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );

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

              <SocialButtons />
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

              <div className="mt-8 text-center text-sm text-muted-foreground">
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
                  onChange={e => setSignupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
                  onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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

        </div>
      </main>
      <Footer />
    </div>
  );
}
