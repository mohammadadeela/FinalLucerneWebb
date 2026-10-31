/* After logging in, return a customer to where they were (checkout or cart) instead of the home page.
   Only these exact paths are ever honoured, so this can never be used as an open redirect. */
const KEY = "lucerne_post_login";
const ALLOWED = new Set(["/checkout", "/cart"]);

export function rememberPostLoginTarget(path: string) {
  if (!ALLOWED.has(path)) return;
  try { sessionStorage.setItem(KEY, path); } catch {}
}

/** Returns the remembered page (once) or "/" when there is none. */
export function consumePostLoginTarget(): string {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value && ALLOWED.has(value) ? value : "/";
  } catch {
    return "/";
  }
}
