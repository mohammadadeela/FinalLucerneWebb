import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Landing page for the "Copy code" button inside OTP emails.
   The code arrives in the URL fragment (/copy-code#123456). Fragments are
   never sent to the server, and we strip it from the address bar right
   after reading it so it doesn't linger in the visible URL or history. */

const CODE_PATTERN = /^[A-Za-z0-9]{4,10}$/;

function readCodeFromHash(): string | null {
  try {
    const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
    return CODE_PATTERN.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function CopyCode() {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (value: string) => {
    const ok = await writeToClipboard(value);
    setCopied(ok);
    return ok;
  }, []);

  useEffect(() => {
    const found = readCodeFromHash();
    setCode(found);
    if (found) {
      window.history.replaceState(null, "", window.location.pathname);
      // Most browsers only allow clipboard writes after a tap, so this may
      // silently fail — the big button below is the reliable path.
      void copy(found);
    }

    // Keep this one-time-code page out of search results and referrers.
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    const referrer = document.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    document.head.append(robots, referrer);
    return () => {
      robots.remove();
      referrer.remove();
    };
  }, [copy]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 4000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-sm px-6 py-10 sm:px-10 text-center">
        <p className="text-[11px] font-bold tracking-[0.3em] text-gray-900 uppercase">Lucerne Boutique</p>
        <p className="text-xs text-gray-400 mt-1">لوسيرن بوتيك</p>

        {code ? (
          <>
            <h1 className="mt-8 text-base font-semibold text-gray-800">رمز التحقق الخاص بك</h1>
            <p className="text-sm text-gray-500">Your verification code</p>

            <div
              className="mt-5 select-all rounded-xl border border-gray-200 bg-gray-50 py-5 font-mono text-5xl font-bold text-gray-900 tabular-nums"
              style={{ letterSpacing: "0.3em", paddingLeft: "0.3em" }}
              dir="ltr"
              data-testid="text-otp-code"
            >
              {code}
            </div>

            <Button
              type="button"
              onClick={() => void copy(code)}
              className={`mt-6 w-full h-14 text-base font-bold rounded-xl transition-colors ${
                copied ? "bg-green-600 hover:bg-green-600 text-white" : ""
              }`}
              data-testid="button-copy-code"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5 me-2" aria-hidden="true" />
                  تم النسخ · Copied
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5 me-2" aria-hidden="true" />
                  نسخ الرمز · Copy code
                </>
              )}
            </Button>

            <p className="sr-only" role="status" aria-live="polite">
              {copied ? "Code copied" : ""}
            </p>

            <p className="mt-6 text-sm text-gray-600 leading-relaxed">
              ارجعي إلى الصفحة السابقة والصقي الرمز
            </p>
            <p className="text-xs text-gray-400 mt-1">Go back to the previous tab and paste the code</p>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-base font-semibold text-gray-800">هذا الرابط غير صالح</h1>
            <p className="text-sm text-gray-500 mt-1">This link isn't valid. Please request a new code.</p>
            <Link href="/auth">
              <Button type="button" variant="outline" className="mt-6 w-full h-12 rounded-xl" data-testid="link-back-to-auth">
                العودة · Back
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
