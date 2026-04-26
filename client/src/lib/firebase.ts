import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  type Auth,
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

// Try popup first (works on mobile from user gesture), fall back to redirect
// only if popups are explicitly blocked by the browser.
async function signInWithProviderSmartly(
  provider: GoogleAuthProvider | FacebookAuthProvider
): Promise<{ idToken: string; email: string; displayName: string | null } | null> {
  const auth = getFirebaseAuth();
  try {
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    return { idToken, email: result.user.email!, displayName: result.user.displayName };
  } catch (err: any) {
    // Only fall back to redirect when the popup was explicitly blocked
    if (
      err?.code === "auth/popup-blocked" ||
      err?.code === "auth/popup-closed-by-user" && /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ) {
      await signInWithRedirect(auth, provider);
      return null; // page will navigate away; result handled after redirect returns
    }
    throw err; // re-throw all other errors (unauthorized-domain, operation-not-allowed, etc.)
  }
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
