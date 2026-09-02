import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { Loader2, User as UserIcon } from "lucide-react";
import { PhoneCountrySelect, PHONE_COUNTRIES } from "@/components/ui/PhoneCountrySelect";
import { isPlaceholderEmail } from "@/lib/utils";

const PHONE_COUNTRY_CODES = PHONE_COUNTRIES.map((c) => ({ code: c.code, flag: c.flag }));

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
  for (const c of PHONE_COUNTRY_CODES) {
    const code = c.code.slice(1); // "970" | "972"
    if (digits.startsWith(code)) {
      let rest = digits.slice(code.length);
      if (rest.startsWith("0")) rest = rest.slice(1);
      return { digits: rest, prefix: c.code };
    }
  }
  return { digits };
}

/** Split a stored phone like "+970591234567" into prefix + 9 local digits. */
function splitStoredPhone(stored: string): { prefix: string; digits: string } {
  const trimmed = (stored || "").trim();
  for (const c of PHONE_COUNTRY_CODES) {
    if (trimmed.startsWith(c.code)) {
      return { prefix: c.code, digits: trimmed.slice(c.code.length).replace(/\D/g, "") };
    }
  }
  // Fallback — strip "+" and assume default prefix
  return { prefix: PHONE_COUNTRY_CODES[0].code, digits: trimmed.replace(/\D/g, "") };
}

export function AccountSettingsDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: {
    fullName?: string | null;
    phone?: string | null;
    address?: string | null;
    email: string;
  } | null | undefined;
}) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Phone-only accounts sign in with their phone number, so it doubles as
  // their identity — letting them edit it here would be like letting them
  // rename their own login. It stays locked; only the checkout/shipping
  // phone on an order can be changed. Accounts that signed up with an email
  // never had this restriction, since their phone is just contact info.
  const isPhoneAccount = isPlaceholderEmail(user?.email);

  const [fullName, setFullName] = useState("");
  const [phonePrefix, setPhonePrefix] = useState(PHONE_COUNTRY_CODES[0].code);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setFullName(user.fullName ?? "");
    const { prefix, digits } = splitStoredPhone(user.phone ?? "");
    setPhonePrefix(prefix);
    setPhoneDigits(digits.slice(0, 9));
    setAddress(user.address ?? "");
  }, [open, user]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      // Phone-auth accounts can't edit their sign-up number here — always
      // resend what's already on file so the field is a no-op, not a change.
      const fullPhone = isPhoneAccount ? (user?.phone ?? "") : (phoneDigits ? `${phonePrefix}${phoneDigits}` : "");
      const res = await apiRequest("PATCH", "/api/auth/profile", {
        fullName,
        phone: fullPhone,
        address,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: ar ? "تم حفظ التغييرات" : "Changes saved" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: ar ? "تعذر الحفظ" : "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    // Validate phone (allow empty, otherwise 7–11 digits, no leading zero).
    // Phone-auth accounts don't expose this field for editing, so skip.
    if (!isPhoneAccount && phoneDigits.length > 0 && (phoneDigits.length < 7 || phoneDigits.length > 11)) {
      toast({
        title: ar ? "رقم الهاتف غير صحيح" : "Invalid phone number",
        description: ar
          ? "أدخل رقم الهاتف بدون الصفر الأول (مثال: 59xxxxxxx)"
          : "Enter phone without leading 0 (e.g. 59xxxxxxx)",
        variant: "destructive",
      });
      return;
    }
    profileMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-lg rounded-xl" data-testid="dialog-account-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="w-5 h-5" />
            {ar ? "إعدادات الحساب" : "Account Settings"}
          </DialogTitle>
          <DialogDescription>
            {ar ? "حدّثي بياناتك الشخصية" : "Update your personal information"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isPhoneAccount ? (
            <div>
              <Label className="text-xs">
                {ar ? "رقم الهاتف المسجل" : "Registered Phone Number"}
              </Label>
              <Input
                value={user?.phone ?? ""}
                disabled
                dir="ltr"
                className="mt-1"
                data-testid="input-account-email"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {ar
                  ? "هذا هو رقم تسجيل الدخول الخاص بك ولا يمكن تغييره من هنا."
                  : "This is your sign-in number and can't be changed here."}
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-xs">{ar ? "البريد الإلكتروني" : "Email"}</Label>
              <Input
                value={user?.email ?? ""}
                disabled
                className="mt-1"
                data-testid="input-account-email"
              />
            </div>
          )}
          <div>
            <Label className="text-xs" htmlFor="acc-fullname">
              {ar ? "الاسم الكامل" : "Full Name"}
            </Label>
            <Input
              id="acc-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1"
              data-testid="input-account-fullname"
            />
          </div>
          {!isPhoneAccount && (
            <div>
              <Label className="text-xs" htmlFor="acc-phone">
                {ar ? "رقم الهاتف" : "Phone"}
              </Label>
              <div
                className="mt-1 flex gap-0 rounded-md border border-border overflow-hidden focus-within:ring-2 focus-within:ring-ring"
                dir="ltr"
              >
                <PhoneCountrySelect
                  value={phonePrefix}
                  onChange={setPhonePrefix}
                  testId="select-account-phone-prefix"
                />
                <input
                  id="acc-phone"
                  inputMode="numeric"
                  value={phoneDigits}
                  onChange={(e) => {
                    let digits = normalizeArabicDigits(e.target.value).replace(/\D/g, "");
                    const stripped = stripAutofillCountryCode(digits);
                    digits = stripped.digits;
                    if (digits.startsWith("0")) digits = digits.slice(1);
                    if (stripped.prefix) setPhonePrefix(stripped.prefix);
                    setPhoneDigits(digits.slice(0, 9));
                  }}
                  placeholder="59xxxxxxx"
                  className="flex-1 h-10 bg-background px-3 text-sm focus:outline-none"
                  data-testid="input-account-phone"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {ar ? "مثال: " : "Example: "}
                <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                  {phonePrefix}59xxxxxxx
                </span>
              </p>
            </div>
          )}
          <div>
            <Label className="text-xs" htmlFor="acc-address">
              {ar ? "العنوان" : "Address"}
            </Label>
            <Input
              id="acc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1"
              data-testid="input-account-address"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={profileMutation.isPending}
            className="w-full mt-2"
            data-testid="button-save-profile"
          >
            {profileMutation.isPending && (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            )}
            {ar ? "حفظ المعلومات" : "Save Info"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
