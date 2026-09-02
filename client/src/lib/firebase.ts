import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  getRedirectResult,
  signOut as firebaseSignOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  fetchSignInMethodsForEmail,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  if (!apiKey) throw new Error("Firebase API key not configured");

  if (getApps().length > 0) {
    _app = getApps()[0];
  } else {
    _app = initializeApp({ apiKey, authDomain, projectId, appId });
  }
  return _app;
}

function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

const POPUP_IGNORED_CODES = [
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/popup-blocked",
];

async function signInWithProviderSmartly(
  provider: GoogleAuthProvider | FacebookAuthProvider
): Promise<{ idToken: string; email: string; displayName: string | null } | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;

  return new Promise((resolve, reject) => {
    let settled = false;
    let blurred = false;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (focusTimer !== null) clearTimeout(focusTimer);
      fn();
    };

    // When the popup opens the main window loses focus.
    // When the popup is closed (without completing sign-in) the main
    // window regains focus but Firebase never resolves/rejects.
    // We give Firebase 2.5 s after focus returns to fire naturally;
    // if it hasn't, we treat the popup as closed by the user.
    const onBlur = () => { blurred = true; };
    const onFocus = () => {
      if (!blurred) return;
      focusTimer = setTimeout(() => {
        settle(() => resolve(null)); // treat as cancelled — no error toast needed
      }, 2500);
    };

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    signInWithPopup(auth, provider)
      .then((result) => {
        result.user.getIdToken().then((idToken) => {
          settle(() =>
            resolve({ idToken, email: result.user.email!, displayName: result.user.displayName })
          );
        }).catch((err) => settle(() => reject(err)));
      })
      .catch((err: any) => {
        if (POPUP_IGNORED_CODES.includes(err?.code)) {
          settle(() => resolve(null));
        } else {
          settle(() => reject(err));
        }
      });
  });
}

export async function signInWithGoogle(): Promise<{ idToken: string; email: string; displayName: string | null } | null> {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  return signInWithProviderSmartly(provider);
}

export async function signInWithFacebook(): Promise<{ idToken: string; email: string; displayName: string | null } | null> {
  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  return signInWithProviderSmartly(provider);
}

export async function handleFirebaseRedirectResult(): Promise<{
  idToken: string;
  email: string;
  displayName: string | null;
  provider: string;
} | null> {
  try {
    const auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const idToken = await result.user.getIdToken();
    const providerId = result.providerId ?? result.user.providerData[0]?.providerId ?? "";
    const provider = providerId.toLowerCase().includes("google") ? "google" : "facebook";
    return { idToken, email: result.user.email!, displayName: result.user.displayName, provider };
  } catch (err: any) {
    const ignored = ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/popup-blocked"];
    if (!ignored.includes(err?.code)) throw err;
    return null;
  }
}

export async function signOutFirebase(): Promise<void> {
  if (_auth) await firebaseSignOut(_auth);
}

// Given an email, returns the name of the provider it's already registered
// with ("Google" / "Facebook"), or null if unknown. Used to give a clear
// message on "auth/account-exists-with-different-credential" errors, which
// Firebase throws when one email is linked to a different sign-in method
// than the one just attempted.
export async function getExistingProviderLabel(email: string): Promise<string | null> {
  try {
    const auth = getFirebaseAuth();
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.includes("google.com")) return "Google";
    if (methods.includes("facebook.com")) return "Facebook";
    if (methods.includes("password")) return "email";
    // Empty list ≠ password account: Firebase intentionally returns [] when
    // email-enumeration protection is on. We simply don't know — return null
    // so the caller shows a generic "different sign-in method" message.
    return null;
  } catch {
    return null;
  }
}

// ── Phone auth ─────────────────────────────────────────────────────────────
let _recaptcha: RecaptchaVerifier | null = null;

function getRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  const auth = getFirebaseAuth();
  if (_recaptcha) return _recaptcha;
  _recaptcha = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  return _recaptcha;
}

export function resetRecaptcha(): void {
  try {
    if (_recaptcha) {
      _recaptcha.clear();
    }
  } catch {}
  _recaptcha = null;
}

export async function sendPhoneVerificationCode(
  fullPhoneE164: string,
  containerId = "recaptcha-container",
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  const verifier = getRecaptchaVerifier(containerId);
  return signInWithPhoneNumber(auth, fullPhoneE164, verifier);
}

export async function confirmPhoneCode(
  confirmation: ConfirmationResult,
  code: string,
): Promise<{ idToken: string; phoneNumber: string | null }> {
  const result = await confirmation.confirm(code);
  const idToken = await result.user.getIdToken();
  return { idToken, phoneNumber: result.user.phoneNumber };
}
