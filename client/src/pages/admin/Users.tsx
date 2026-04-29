import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Search,
  Trash2,
  ShieldCheck,
  ShieldOff,
  ChevronDown,
  PackageX,
  Eye,
  ShoppingBag,
  X,
  ArrowLeft,
  Check,
  Receipt,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { useOrder, useUpdateOrderStatus } from "@/hooks/use-orders";

type AdminUser = {
  id: number;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  isVerified: boolean | null;
  isBlocked: boolean | null;
  createdAt: string | null;
  orderCount: number;
  deliveredCount: number;
  cancelledCount: number;
};

function getInitials(name: string | null, email: string) {
  if (name && name.trim()) {
    return name
      .trim()
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return email[0].toUpperCase();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "yyyy-MM-dd");
}

type OrderSummary = {
  id: number;
  totalAmount: string;
  status: string;
  paymentMethod: string;
  createdAt: string | null;
  fullName: string;
  city: string;
};

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800",
  OnTheWay: "bg-blue-100 text-blue-800",
  Delivered: "bg-green-100 text-green-800",
  Cancelled: "bg-red-100 text-red-800",
};

function SelectBox({ checked, onChange, indeterminate = false, testId }: {
  checked: boolean;
  onChange: () => void;
  indeterminate?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={e => { e.stopPropagation(); onChange(); }}
      data-testid={testId}
      className={`w-6 h-6 flex-shrink-0 flex items-center justify-center border-2 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary ${
        checked || indeterminate
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-background border-border hover:border-primary/60"
      }`}
    >
      {indeterminate ? (
        <span className="block w-3 h-0.5 bg-current" />
      ) : checked ? (
        <Check className="w-3.5 h-3.5 stroke-[3]" />
      ) : null}
    </button>
  );
}

export default function AdminUsers() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { data: currentUser } = useAuth();
  const isAr = language === "ar";
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [openRoleMenu, setOpenRoleMenu] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<
    "all" | "active" | "blocked" | "admins" | "employees" | "highCancel" | "bestCustomers"
  >("all");
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [orderFilter, setOrderFilter] = useState<"all" | "Pending" | "OnTheWay" | "Delivered" | "Cancelled">("all");

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: userOrders = [], isLoading: ordersLoading } = useQuery<
    OrderSummary[]
  >({
    queryKey: ["/api/admin/users", viewingUser?.id, "orders"],
    enabled: !!viewingUser,
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${viewingUser!.id}/orders`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const { data: orderDetails } = useOrder(selectedOrderId || 0);
  const updateStatus = useUpdateOrderStatus();

  const handleViewOrder = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowOrderDetail(true);
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: isAr ? `تم تحديث الحالة` : `Status updated` });
    } catch (err: any) {
      toast({
        title: isAr ? "فشل التحديث" : "Failed to update",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AdminUser> }) =>
      apiRequest("PATCH", `/api/admin/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({
        title: err.message || t.admin.failedToUpdate,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t.admin.userDeleted });
    },
    onError: (err: any) => {
      toast({
        title: err.message || t.admin.failedToUpdate,
        variant: "destructive",
      });
    },
  });

  const handleBlock = (user: AdminUser) => {
    if (user.id === currentUser?.id) {
      toast({ title: t.admin.cannotBlockSelf, variant: "destructive" });
      return;
    }
    const newBlocked = !user.isBlocked;
    updateMutation.mutate(
      { id: user.id, data: { isBlocked: newBlocked } as any },
      {
        onSuccess: () => {
          toast({
            title: newBlocked ? t.admin.userBlocked : t.admin.userUnblocked,
          });
        },
      },
    );
  };

  const handleRoleChange = (user: AdminUser, newRole: string) => {
    setOpenRoleMenu(null);
    updateMutation.mutate(
      { id: user.id, data: { role: newRole } as any },
      {
        onSuccess: () => {
          toast({ title: t.admin.roleChanged });
        },
      },
    );
  };

  const handleDelete = (id: number) => {
    if (id === currentUser?.id) {
      toast({ title: t.admin.cannotDeleteSelf, variant: "destructive" });
      return;
    }
    deleteMutation.mutate(id);
    setConfirmDelete(null);
  };

  const toggleSelect = (id: number) => {
    if (id === currentUser?.id) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableIds = filtered.filter(u => u.id !== currentUser?.id).map(u => u.id);
    if (selectedIds.size === selectableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const handleBulkAction = async (action: "block" | "unblock" | "make-admin" | "make-customer") => {
    if (selectedIds.size === 0) return;
    setBulkPending(true);
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      const { updated } = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const label =
        action === "block" ? (isAr ? "تم الحظر" : "Blocked") :
        action === "unblock" ? (isAr ? "تم رفع الحظر" : "Unblocked") :
        action === "make-admin" ? (isAr ? "تم ترقية الصلاحية" : "Made admin") :
        (isAr ? "تم خفض الصلاحية" : "Made customer");
      toast({ title: `${label} — ${updated} ${isAr ? "مستخدم" : "user(s)"}` });
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setBulkPending(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const msg = isAr
      ? `هل تريد حذف ${selectedIds.size} مستخدم؟`
      : `Delete ${selectedIds.size} user(s)?`;
    if (!confirm(msg)) return;
    setBulkPending(true);
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      const { deleted } = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: isAr ? `تم حذف ${deleted} مستخدم` : `${deleted} user(s) deleted` });
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setBulkPending(false);
    }
  };

  const filtered = users
    .filter((u) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q);
      const matchesFilter =
        filterType === "all" ||
        (filterType === "active" && !u.isBlocked) ||
        (filterType === "blocked" && u.isBlocked) ||
        (filterType === "admins" && u.role === "admin") ||
        (filterType === "employees" && u.role === "employee") ||
        (filterType === "highCancel" && u.cancelledCount > 2) ||
        (filterType === "bestCustomers" && u.deliveredCount >= 2 && u.role === "customer" && !u.isBlocked);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) =>
      filterType === "bestCustomers" ? b.deliveredCount - a.deliveredCount : 0,
    );

  const stats = {
    total: users.length,
    active: users.filter((u) => !u.isBlocked).length,
    blocked: users.filter((u) => u.isBlocked).length,
    admins: users.filter((u) => u.role === "admin").length,
    employees: users.filter((u) => u.role === "employee").length,
    highCancel: users.filter((u) => u.cancelledCount > 2).length,
    bestCustomers: users.filter(
      (u) => u.deliveredCount >= 2 && u.role === "customer" && !u.isBlocked,
    ).length,
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title={t.admin.users}
        description={t.admin.manageUsers}
        icon={Users}
        iconGradient="from-orange-500 to-rose-600"
        testId="text-users-title"
      />

      {/* Stats — clickable filter cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {(
          [
            {
              key: "all",
              label: t.admin.totalUsers,
              value: stats.total,
              icon: Users,
              color: "text-blue-600",
              bg: "bg-blue-50",
              ring: "ring-blue-400",
              activeBorder: "border-blue-400",
            },
            {
              key: "active",
              label: t.admin.activeUsers,
              value: stats.active,
              icon: UserCheck,
              color: "text-green-600",
              bg: "bg-green-50",
              ring: "ring-green-400",
              activeBorder: "border-green-400",
            },
            {
              key: "blocked",
              label: t.admin.blockedUsers,
              value: stats.blocked,
              icon: UserX,
              color: "text-red-600",
              bg: "bg-red-50",
              ring: "ring-red-400",
              activeBorder: "border-red-400",
            },
            {
              key: "employees",
              label: language === "ar" ? "الموظفون" : "Employees",
              value: stats.employees,
              icon: Receipt,
              color: "text-amber-600",
              bg: "bg-amber-50",
              ring: "ring-amber-400",
              activeBorder: "border-amber-400",
            },
            {
              key: "admins",
              label: t.admin.adminUsers,
              value: stats.admins,
              icon: Shield,
              color: "text-purple-600",
              bg: "bg-purple-50",
              ring: "ring-purple-400",
              activeBorder: "border-purple-400",
            },
            {
              key: "highCancel",
              label: language === "ar" ? "إلغاء +2 مرات" : "Cancelled +2×",
              value: stats.highCancel,
              icon: PackageX,
              color: "text-orange-600",
              bg: "bg-orange-50",
              ring: "ring-orange-400",
              activeBorder: "border-orange-400",
            },
            {
              key: "bestCustomers",
              label: language === "ar" ? "أفضل العملاء" : "Best Customers",
              value: stats.bestCustomers,
              icon: Crown,
              color: "text-yellow-600",
              bg: "bg-yellow-50",
              ring: "ring-yellow-400",
              activeBorder: "border-yellow-400",
            },
          ] as const
        ).map((card) => {
          const isActive = filterType === card.key;
          return (
            <button
              key={card.key}
              onClick={() => setFilterType(isActive ? "all" : card.key)}
              className={`relative bg-card border rounded-lg p-3 text-start w-full transition-all cursor-pointer overflow-hidden group ${
                isActive
                  ? `${card.activeBorder} ring-2 ${card.ring}/40 shadow-sm`
                  : "border-border hover:border-foreground/30 hover:shadow-sm hover:-translate-y-0.5"
              }`}
              data-testid={`card-user-stat-${card.key}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                    {card.label}
                  </p>
                  <p
                    className={`text-2xl font-bold mt-1 leading-none ${isActive ? card.color : "text-foreground"}`}
                  >
                    {card.value}
                  </p>
                </div>
                <div className={`p-2 rounded-md ${card.bg} flex-shrink-0`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              {isActive && (
                <div className={`absolute bottom-0 inset-x-0 h-0.5 ${card.bg} ring-1 ${card.ring}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t.admin.searchUsers}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-border bg-background ps-9 pe-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          data-testid="input-search-users"
        />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-primary/5 border border-primary/20 rounded-lg shadow-sm animate-in slide-in-from-top-2 duration-200" data-testid="bulk-actions-bar-users">
          <span className="text-sm font-semibold" data-testid="text-selected-count-users">
            {isAr ? `${selectedIds.size} مستخدم محدد` : `${selectedIds.size} selected`}
          </span>
          <div className="w-px h-5 bg-border hidden sm:block" />
          <Button size="sm" disabled={bulkPending} onClick={() => handleBulkAction("block")} className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 h-8 shadow-sm" data-testid="button-bulk-block">
            <ShieldOff className="w-3.5 h-3.5" />
            {isAr ? "حظر" : "Block"}
          </Button>
          <Button size="sm" disabled={bulkPending} onClick={() => handleBulkAction("unblock")} className="bg-green-600 hover:bg-green-700 text-white gap-1.5 h-8 shadow-sm" data-testid="button-bulk-unblock">
            <ShieldCheck className="w-3.5 h-3.5" />
            {isAr ? "رفع الحظر" : "Unblock"}
          </Button>
          <Button size="sm" disabled={bulkPending} onClick={() => handleBulkAction("make-admin")} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 h-8 shadow-sm" data-testid="button-bulk-make-admin">
            <Shield className="w-3.5 h-3.5" />
            {isAr ? "ترقية لأدمن" : "Make Admin"}
          </Button>
          <Button size="sm" disabled={bulkPending} onClick={() => handleBulkAction("make-customer")} variant="outline" className="gap-1.5 h-8" data-testid="button-bulk-make-customer">
            <UserCheck className="w-3.5 h-3.5" />
            {isAr ? "خفض لعميل" : "Make Customer"}
          </Button>
          <Button size="sm" disabled={bulkPending} onClick={handleBulkDelete} variant="destructive" className="gap-1.5 h-8 shadow-sm" data-testid="button-bulk-delete-users">
            <Trash2 className="w-3.5 h-3.5" />
            {isAr ? "حذف" : "Delete"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="text-xs h-8 ms-auto" data-testid="button-clear-selection-users">
            {isAr ? "إلغاء التحديد" : "Clear"}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {t.admin.noUsersFound}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase text-xs tracking-wide">
                <th className="px-4 py-3 w-10">
                  {(() => {
                    const selectableCount = filtered.filter(u => u.id !== currentUser?.id).length;
                    return (
                      <SelectBox
                        checked={selectableCount > 0 && selectedIds.size === selectableCount}
                        indeterminate={selectedIds.size > 0 && selectedIds.size < selectableCount}
                        onChange={toggleSelectAll}
                        testId="checkbox-select-all-users"
                      />
                    );
                  })()}
                </th>
                <th className="text-start px-4 py-3 font-medium">
                  {t.admin.name}
                </th>
                <th className="text-start px-4 py-3 font-medium hidden md:table-cell">
                  {t.admin.userEmail}
                </th>
                <th className="text-start px-4 py-3 font-medium hidden lg:table-cell">
                  {t.admin.userPhone}
                </th>
                <th className="text-start px-4 py-3 font-medium">
                  {t.admin.userRole}
                </th>
                <th className="text-start px-4 py-3 font-medium">
                  {t.admin.userStatus}
                </th>
                <th className="text-start px-4 py-3 font-medium hidden md:table-cell">
                  {t.admin.userOrders}
                </th>
                <th className="text-start px-4 py-3 font-medium hidden lg:table-cell">
                  {t.admin.userJoined}
                </th>
                <th className="text-end px-4 py-3 font-medium">
                  {t.admin.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const initials = getInitials(user.fullName, user.email);
                const isBlocked = user.isBlocked ?? false;
                const isAdmin = user.role === "admin";
                const isEmployee = user.role === "employee";

                const isHighCancel = user.cancelledCount > 2;
                const isBestCustomer = user.deliveredCount >= 2 && user.role === "customer" && !user.isBlocked;

                return (
                  <tr
                    key={user.id}
                    onClick={() => !isSelf && toggleSelect(user.id)}
                    className={`border-b border-border last:border-0 transition-colors ${
                      isSelf
                        ? "cursor-default"
                        : "cursor-pointer"
                    } ${
                      selectedIds.has(user.id)
                        ? "bg-primary/5 hover:bg-primary/10"
                        : isBlocked
                          ? "opacity-60 hover:bg-muted/20"
                          : isHighCancel
                            ? "bg-orange-50/60 dark:bg-orange-950/20 hover:bg-orange-100/60"
                            : isBestCustomer
                              ? "bg-yellow-50/40 dark:bg-yellow-950/10 hover:bg-yellow-100/50"
                              : isSelf
                                ? ""
                                : "hover:bg-muted/20"
                    }`}
                    data-testid={`row-user-${user.id}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <div
                          className="w-6 h-6 flex-shrink-0 flex items-center justify-center border-2 border-dashed border-border opacity-40 cursor-not-allowed"
                          title={isAr ? "لا يمكن تحديد حسابك" : "Cannot select your own account"}
                          data-testid={`checkbox-select-user-${user.id}`}
                        />
                      ) : (
                        <SelectBox checked={selectedIds.has(user.id)} onChange={() => toggleSelect(user.id)} testId={`checkbox-select-user-${user.id}`} />
                      )}
                    </td>

                    {/* Avatar + Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                              isBlocked
                                ? "bg-red-100 text-red-600"
                                : isAdmin
                                  ? "bg-purple-100 text-purple-700"
                                  : isBestCustomer
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-primary/10 text-primary"
                            }`}
                            data-testid={`avatar-user-${user.id}`}
                          >
                            {initials}
                          </div>
                          {isBestCustomer && (
                            <Crown className="absolute -top-1 -end-1 w-3.5 h-3.5 text-yellow-500 drop-shadow-sm" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p
                              className="font-medium text-foreground truncate max-w-[120px]"
                              data-testid={`text-name-${user.id}`}
                            >
                              {user.fullName || "—"}
                            </p>
                            {isBestCustomer && (
                              <span className="hidden sm:inline-flex items-center text-[9px] font-bold text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 px-1 py-0.5 rounded-full flex-shrink-0">
                                VIP
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[130px] md:hidden">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td
                      className="px-4 py-3 text-muted-foreground hidden md:table-cell"
                      data-testid={`text-email-${user.id}`}
                    >
                      {user.email}
                    </td>

                    {/* Phone */}
                    <td
                      className="px-4 py-3 text-muted-foreground hidden lg:table-cell"
                      data-testid={`text-phone-${user.id}`}
                    >
                      {user.phone || "—"}
                    </td>

                    {/* Role */}
                    <td
                      className="px-4 py-3"
                      data-testid={`text-role-${user.id}`}
                    >
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          isAdmin
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300"
                            : isEmployee
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {isAdmin && <Shield className="w-3 h-3" />}
                        {isEmployee && <Receipt className="w-3 h-3" />}
                        {isAdmin ? t.admin.adminRole : isEmployee ? (language === "ar" ? "موظف" : "Employee") : t.admin.customerRole}
                      </span>
                    </td>

                    {/* Status */}
                    <td
                      className="px-4 py-3"
                      data-testid={`text-status-${user.id}`}
                    >
                      {isBlocked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          <UserX className="w-3 h-3" />
                          {t.admin.blocked}
                        </span>
                      ) : user.isVerified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          <UserCheck className="w-3 h-3" />
                          {t.admin.verified}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                          {t.admin.unverified}
                        </span>
                      )}
                    </td>

                    {/* Order breakdown */}
                    <td
                      className="px-4 py-3 hidden md:table-cell"
                      data-testid={`text-orders-${user.id}`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-[90px]">
                        <span className="text-foreground font-semibold text-sm">
                          {user.orderCount}{" "}
                          {language === "ar" ? "طلب" : "total"}
                        </span>
                        {user.orderCount > 0 && (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="inline-flex items-center gap-1 text-xs text-green-700"
                              data-testid={`text-delivered-${user.id}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                              {user.deliveredCount}{" "}
                              {language === "ar" ? "تم التسليم" : "delivered"}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${user.cancelledCount > 2 ? "text-orange-600 font-bold" : user.cancelledCount > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                              data-testid={`text-cancelled-${user.id}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full inline-block ${user.cancelledCount > 2 ? "bg-orange-500" : user.cancelledCount > 0 ? "bg-red-500" : "bg-muted-foreground/40"}`}
                              />
                              {user.cancelledCount}{" "}
                              {language === "ar" ? "تم الإلغاء" : "cancelled"}
                              {user.cancelledCount > 2 && (
                                <span className="ms-1 bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-orange-300">
                                  {language === "ar"
                                    ? "⚠ إلغاء متكرر"
                                    : "⚠ High"}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Joined */}
                    <td
                      className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs"
                      data-testid={`text-joined-${user.id}`}
                    >
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {/* Block / Unblock */}
                        {!isSelf && (
                          <button
                            onClick={() => handleBlock(user)}
                            disabled={updateMutation.isPending}
                            title={
                              isBlocked
                                ? t.admin.unblockUser
                                : t.admin.blockUser
                            }
                            className={`p-1.5 rounded transition-colors ${
                              isBlocked
                                ? "text-green-600 hover:bg-green-50"
                                : "text-orange-500 hover:bg-orange-50"
                            }`}
                            data-testid={`button-${isBlocked ? "unblock" : "block"}-${user.id}`}
                          >
                            {isBlocked ? (
                              <ShieldCheck className="w-4 h-4" />
                            ) : (
                              <ShieldOff className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* Role picker */}
                        {!isSelf && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                disabled={updateMutation.isPending}
                                title={isAr ? "تغيير الدور" : "Change Role"}
                                className={`p-1.5 rounded transition-colors outline-none ${
                                  isAdmin ? "text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                                  : isEmployee ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                  : "text-muted-foreground hover:bg-muted"
                                }`}
                                data-testid={`button-role-${user.id}`}
                              >
                                {isAdmin ? <Shield className="w-4 h-4" /> : isEmployee ? <Receipt className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48"
                              data-testid={`role-menu-${user.id}`}
                            >
                              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                {isAr ? "تغيير الدور" : "Change Role"}
                              </DropdownMenuLabel>
                              {[
                                { role: "customer", label: isAr ? "عميل" : "Customer", icon: <Users className="w-3.5 h-3.5" />, color: "text-foreground", focus: "focus:bg-muted" },
                                { role: "employee", label: isAr ? "موظف" : "Employee", icon: <Receipt className="w-3.5 h-3.5" />, color: "text-amber-600", focus: "focus:bg-amber-50 dark:focus:bg-amber-950/30 focus:text-amber-600" },
                                { role: "admin", label: isAr ? "مدير" : "Admin", icon: <Shield className="w-3.5 h-3.5" />, color: "text-purple-600", focus: "focus:bg-purple-50 dark:focus:bg-purple-950/30 focus:text-purple-600" },
                              ].map(option => (
                                <DropdownMenuItem
                                  key={option.role}
                                  onSelect={() => handleRoleChange(user, option.role)}
                                  disabled={user.role === option.role}
                                  className={`gap-2.5 cursor-pointer ${option.color} ${option.focus}`}
                                  data-testid={`role-option-${option.role}-${user.id}`}
                                >
                                  {option.icon}
                                  <span className="font-medium">{option.label}</span>
                                  {user.role === option.role && <Check className="w-3.5 h-3.5 ms-auto" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        {/* Delete */}
                        {!isSelf &&
                          (confirmDelete === user.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(user.id)}
                                disabled={deleteMutation.isPending}
                                className="text-xs bg-destructive text-destructive-foreground px-2 py-1 rounded hover:bg-destructive/90 transition-colors"
                                data-testid={`button-confirm-delete-${user.id}`}
                              >
                                {t.admin.deleteUser}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-xs text-muted-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                                data-testid={`button-cancel-delete-${user.id}`}
                              >
                                {t.admin.cancel}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(user.id)}
                              title={t.admin.deleteUser}
                              className="p-1.5 rounded text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                              data-testid={`button-delete-${user.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ))}

                        {/* View orders */}
                        <button
                          onClick={() => { setOrderFilter("all"); setViewingUser(user); }}
                          title={isAr ? "عرض الطلبات" : "View orders"}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          data-testid={`button-view-orders-${user.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Self badge */}
                        {isSelf && (
                          <span
                            className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded"
                            data-testid={`badge-self-${user.id}`}
                          >
                            You
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* User Orders Dialog */}
      <Dialog
        open={!!viewingUser}
        onOpenChange={(o) => !o && setViewingUser(null)}
      >
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {viewingUser
                  ? getInitials(viewingUser.fullName, viewingUser.email)
                  : "?"}
              </div>
              <div>
                <p className="font-bold">
                  {viewingUser?.fullName || viewingUser?.email}
                </p>
                <p className="text-xs text-muted-foreground font-normal">
                  {viewingUser?.email}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 py-2 border-b border-border shrink-0 flex-wrap">
            {([
              { key: "all" as const, label: isAr ? "الكل" : "All", activeClass: "bg-foreground text-background", inactiveClass: "text-muted-foreground bg-muted/50 hover:bg-muted" },
              { key: "Pending" as const, label: isAr ? "بالانتظار" : "Pending", activeClass: "bg-yellow-600 text-white", inactiveClass: "text-yellow-700 bg-yellow-50 hover:bg-yellow-100" },
              { key: "OnTheWay" as const, label: isAr ? "في الطريق" : "On The Way", activeClass: "bg-blue-700 text-white", inactiveClass: "text-blue-700 bg-blue-50 hover:bg-blue-100" },
              { key: "Delivered" as const, label: isAr ? "تم التسليم" : "Delivered", activeClass: "bg-green-700 text-white", inactiveClass: "text-green-700 bg-green-50 hover:bg-green-100" },
              { key: "Cancelled" as const, label: isAr ? "ملغي" : "Cancelled", activeClass: "bg-red-700 text-white", inactiveClass: "text-red-700 bg-red-50 hover:bg-red-100" },
            ]).map(({ key, label, activeClass, inactiveClass }) => {
              const count = key === "all"
                ? userOrders.length
                : userOrders.filter(o => o.status === key).length;
              if (key !== "all" && count === 0) return null;
              return (
                <button
                  key={key}
                  data-testid={`filter-${key}-orders`}
                  onClick={() => setOrderFilter(key)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer font-medium ${
                    orderFilter === key ? `${activeClass} font-semibold` : inactiveClass
                  }`}
                >
                  {key === "all" && <ShoppingBag className="w-3 h-3 inline-block me-1 -mt-0.5" />}
                  {count} {label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            {ordersLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
              </div>
            ) : userOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <ShoppingBag className="w-10 h-10 opacity-20" />
                <p className="text-sm">
                  {isAr
                    ? "لا توجد طلبات لهذا المستخدم"
                    : "No orders for this user"}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-start">
                      {isAr ? "رقم الطلب" : "Order #"}
                    </th>
                    <th className="px-4 py-2.5 text-start">
                      {isAr ? "التاريخ" : "Date"}
                    </th>
                    <th className="px-4 py-2.5 text-start">
                      {isAr ? "المدينة" : "City"}
                    </th>
                    <th className="px-4 py-2.5 text-center">
                      {isAr ? "الحالة" : "Status"}
                    </th>
                    <th className="px-4 py-2.5 text-end">
                      {isAr ? "الإجمالي" : "Total"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...userOrders]
                    .filter((order) => {
                      if (orderFilter === "all") return true;
                      return order.status === orderFilter;
                    })
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt ?? 0).getTime() -
                        new Date(a.createdAt ?? 0).getTime(),
                    )
                    .map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => handleViewOrder(order.id)}
                        className="border-b border-border last:border-0 hover:bg-primary/5 cursor-pointer transition-colors group"
                        data-testid={`row-user-order-${order.id}`}
                      >
                        <td className="px-4 py-3 font-mono font-semibold group-hover:text-primary transition-colors">
                          #{order.id.toString().padStart(6, "0")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {order.createdAt
                            ? format(
                                new Date(order.createdAt),
                                "yyyy-MM-dd · h:mm aa",
                              )
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {order.city}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] || "bg-muted text-muted-foreground"}`}
                          >
                            {(t.orderStatus as any)?.[order.status] ||
                              order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end font-semibold">
                          ₪{parseFloat(order.totalAmount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Order detail dialog */}
      <Dialog open={showOrderDetail} onOpenChange={setShowOrderDetail}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-2xl rounded-none max-h-[85svh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowOrderDetail(false)}
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                data-testid="button-back-to-user-orders"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <DialogTitle className="font-display text-xl sm:text-2xl font-mono">
                {t.profile.orderNumber} #
                {selectedOrderId?.toString().padStart(6, "0")}
              </DialogTitle>
            </div>
          </DialogHeader>

          {orderDetails ? (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t.admin.customerName}
                  </p>
                  <p className="font-medium">{orderDetails.order.fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t.admin.phoneLabel}
                  </p>
                  <p className="font-medium">{orderDetails.order.phone}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    {t.admin.deliveryAddress}
                  </p>
                  <p className="font-medium">
                    {orderDetails.order.address}, {orderDetails.order.city}
                  </p>
                </div>
                {orderDetails.order.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      {t.admin.notesLabel}
                    </p>
                    <p className="font-medium">{orderDetails.order.notes}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">{t.admin.items}</h3>
                <div className="space-y-2">
                  {orderDetails.items.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      {isAr ? "لا توجد تفاصيل منتجات لهذا الطلب" : "No product details for this order"}
                    </p>
                  )}
                  {orderDetails.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between text-sm border-b border-border pb-2 mb-2 last:border-0 last:pb-0 last:mb-0"
                    >
                      <div className="flex items-start gap-3">
                        {item.product?.mainImage && (
                          <img
                            src={item.product.mainImage}
                            alt=""
                            className="w-10 h-12 object-cover bg-secondary flex-shrink-0"
                          />
                        )}
                        <div>
                          <p className="font-medium">
                            {item.product?.name}
                            {item.product?.id && (
                              <span className="ms-2 font-mono text-[10px] text-muted-foreground">
                                #{String(item.product.id).padStart(4, "0")}
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {t.admin.qty}: {item.quantity}
                            </span>
                            {item.size && (
                              <span className="text-xs bg-secondary px-1.5 py-0.5 font-medium">
                                {t.product.size}: {item.size}
                              </span>
                            )}
                            {item.color && (
                              <span className="text-xs bg-secondary px-1.5 py-0.5 font-medium">
                                {t.product.color}: {item.color}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="font-medium flex-shrink-0">
                        ₪{(parseFloat(item.price) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 flex justify-between">
                <p className="font-semibold">{t.admin.totalLabel}:</p>
                <p className="text-lg font-bold">
                  ₪{parseFloat(orderDetails.order.totalAmount).toFixed(2)}
                </p>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium">
                  {t.admin.changeStatus}
                </label>
                <select
                  value={orderDetails.order.status}
                  onChange={(e) =>
                    handleStatusChange(orderDetails.order.id, e.target.value)
                  }
                  className="w-full mt-2 border border-border bg-background px-3 py-2 rounded-none text-sm"
                  data-testid="select-order-status-user-detail"
                >
                  {["Pending", "OnTheWay", "Delivered", "Cancelled"].map(
                    (s) => (
                      <option key={s} value={s}>
                        {(t.orderStatus as any)?.[s] || s}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center py-16">
              <div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
