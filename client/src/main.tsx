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

createRoot(document.getElementById("root")!).render(<App />);
