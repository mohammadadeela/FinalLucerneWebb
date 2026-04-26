import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Package, ShoppingCart, Users, LogOut, ArrowLeft, ArrowRight,
  ImageIcon, Receipt, TicketPercent, FolderTree, BarChart2, ExternalLink, Database,
  Menu, X, ArrowLeftRight, Globe,
} from "lucide-react";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n";
import { useState } from "react";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user, isLoading } = useAuth();
  const logout = useLogout();
  const { t, language, setLanguage } = useLanguage();
  const BackArrow = language === "ar" ? ArrowRight : ArrowLeft;
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleLanguage = () => {
    setLanguage(language === "ar" ? "en" : "ar");
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-muted/30">
        <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  const isEmployee = user?.role === "employee";
  const isAdmin = user?.role === "admin";

  if (!user || (!isAdmin && !isEmployee)) {
    window.location.href = "/";
    return null;
  }

  if (isEmployee && !location.startsWith("/admin/pos")) {
    window.location.href = "/admin/pos";
    return null;
  }

  const adminNavItems = [
    { label: t.admin.dashboard, href: "/admin", icon: LayoutDashboard },
    { label: t.admin.products, href: "/admin/products", icon: Package },
    { label: t.admin.orders, href: "/admin/orders", icon: ShoppingCart },
    { label: language === "ar" ? "الاستبدالات" : "Exchanges", href: "/admin/exchanges", icon: ArrowLeftRight },
    { label: t.admin.users, href: "/admin/users", icon: Users },
    { label: language === "ar" ? "محتوى الصفحات" : "Site Content", href: "/admin/site-content", icon: ImageIcon },
    { label: language === "ar" ? "نقطة البيع" : "POS", href: "/admin/pos", icon: Receipt },
    { label: language === "ar" ? "أكواد الخصم" : "Discount Codes", href: "/admin/discount-codes", icon: TicketPercent },
    { label: language === "ar" ? "الفئات" : "Categories", href: "/admin/categories", icon: FolderTree },
    { label: language === "ar" ? "تقرير المبيعات" : "Sales Analytics", href: "/admin/analytics", icon: BarChart2 },
    { label: language === "ar" ? "قاعدة البيانات" : "Database", href: "/admin/database", icon: Database },
  ];

  const employeeNavItems = [
    { label: language === "ar" ? "نقطة البيع" : "POS", href: "/admin/pos", icon: Receipt },
  ];

  const navItems = isEmployee ? employeeNavItems : adminNavItems;
  const currentNav = navItems.find(n => n.href === location) || navItems.find(n => location.startsWith(n.href) && n.href !== "/admin");
  const initials = (user.fullName || user.email || "A")
    .split(/\s+/)
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const SidebarContent = () => (
    <>
      <div className="h-20 flex items-center gap-3 px-6 border-b border-border/60">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
          <span className="text-primary-foreground font-display font-bold text-base">L</span>
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base tracking-widest font-semibold uppercase truncate" data-testid="text-admin-title">{t.admin.admin}</h2>
          {isEmployee && (
            <span className="text-[9px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              {language === "ar" ? "موظف" : "Employee"}
            </span>
          )}
        </div>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                onClick={() => setMobileOpen(false)}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
                data-testid={`link-admin-nav-${item.href.replace(/\//g, '-')}`}
              >
                {isActive && (
                  <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-primary" />
                )}
                <item.icon className={`w-[18px] h-[18px] shrink-0 transition-transform ${isActive ? "" : "group-hover:scale-110"}`} />
                <span className="text-sm">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border/60 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground text-xs font-bold shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate" data-testid="text-admin-username">{user.fullName || user.email}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{isEmployee ? (language === "ar" ? "موظف" : "Employee") : (language === "ar" ? "مدير" : "Admin")}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={toggleLanguage}
          data-testid="button-language-toggle-sidebar"
        >
          <Globe className="w-4 h-4" />
          {language === "ar" ? "English" : "العربية"}
        </Button>
        <Link href="/">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground" data-testid="link-back-to-store">
            <BackArrow className="w-4 h-4 me-2" /> {t.admin.backToStore}
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => logout.mutate()}
          data-testid="button-admin-logout"
        >
          <LogOut className="w-4 h-4 me-2" /> {t.admin.logout}
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="w-64 bg-card border-e border-border/60 hidden md:flex flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
          <aside className="md:hidden fixed top-0 bottom-0 start-0 w-72 bg-card z-50 flex flex-col shadow-xl animate-in slide-in-from-left">
            <SidebarContent />
          </aside>
        </>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-14 bg-card/95 backdrop-blur border-b border-border/60 flex items-center px-4 sm:px-6 justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden p-2 -ms-2 rounded-md hover:bg-muted text-muted-foreground"
              onClick={() => setMobileOpen(true)}
              data-testid="button-mobile-menu"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {currentNav && (
              <div className="flex items-center gap-2 min-w-0">
                <currentNav.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold truncate" data-testid="text-current-page">{currentNav.label}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={toggleLanguage}
              data-testid="button-language-toggle"
            >
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">{language === "ar" ? "English" : "العربية"}</span>
            </Button>
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-2" data-testid="link-goto-website">
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">{language === "ar" ? "الموقع" : "Website"}</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => logout.mutate()}
              data-testid="button-admin-signout-top"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{t.admin.logout}</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
