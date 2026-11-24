import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { useLanguage } from "./i18n";

const lang = useLanguage.getState().language;
const dir = lang === "ar" ? "rtl" : "ltr";
document.documentElement.dir = dir;
document.documentElement.lang = lang;

// When a new deployment is made, Vite renames JS chunk files (content hashes
// change). If a user still has the old index.html in cache and tries to lazy-
// load a chunk that no longer exists on the server, Vite fires this event.
// Reloading fetches the latest index.html and the correct new chunks.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

// The shop in English asks the server for English product names. The admin area never
// does, so staff always see and edit the original names.
const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const { area, storeLanguage } = useLanguage.getState() as any;
    const isApi = url.startsWith("/api/") || url.startsWith(window.location.origin + "/api/");
    if (isApi && area !== "admin" && storeLanguage === "en" && !window.location.pathname.startsWith("/admin")) {
      const headers = new Headers(init?.headers || (typeof input === "object" && !(input instanceof URL) ? input.headers : undefined));
      headers.set("X-Store-Lang", "en");
      return nativeFetch(input, { ...init, headers });
    }
  } catch {
    /* fall through to a plain request */
  }
  return nativeFetch(input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
