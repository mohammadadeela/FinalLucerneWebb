/** An Arabic keyboard's number row types Eastern Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩, or the Persian ۰۱۲۳۴۵۶۷۸۹) instead of 0-9.
 *  Stripping "non-digits" would silently drop them, so convert them to plain digits first. */
const ARABIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";
export function normalizeArabicDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => {
    const i = ARABIC.indexOf(c);
    return String(i >= 0 ? i : PERSIAN.indexOf(c));
  });
}
