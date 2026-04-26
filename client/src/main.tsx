import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { useLanguage } from "./i18n";

const lang = useLanguage.getState().language;
const dir = lang === "ar" ? "rtl" : "ltr";
document.documentElement.dir = dir;
document.documentElement.lang = lang;

createRoot(document.getElementById("root")!).render(<App />);
