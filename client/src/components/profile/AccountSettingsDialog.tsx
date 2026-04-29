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

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setFullName(user.fullName ?? "");
    setPhone(user.phone ?? "");
    setAddress(user.address ?? "");
  }, [open, user]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/auth/profile", {
        fullName,
        phone,
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
          <div>
            <Label className="text-xs">{ar ? "البريد الإلكتروني" : "Email"}</Label>
            <Input
              value={user?.email ?? ""}
              disabled
              className="mt-1"
              data-testid="input-account-email"
            />
          </div>
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
          <div>
            <Label className="text-xs" htmlFor="acc-phone">
              {ar ? "رقم الهاتف" : "Phone"}
            </Label>
            <Input
              id="acc-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              data-testid="input-account-phone"
            />
          </div>
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
            onClick={() => profileMutation.mutate()}
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
