import { Switch, Route, useLocation } from "wouter";
import { useState, useEffect, useRef, lazy, Suspense, Component, type ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAbandonedCartReminder } from "@/hooks/use-abandoned-cart-reminder";
import { useSessionWatcher } from "@/hooks/use-auth";
import { usePreloadProductImages } from "@/hooks/use-products";
import NotFound from "@/pages/not-found";
import { SiInstagram } from "react-icons/si";
import { X } from "lucide-react";
import ChatBot from "@/components/ui/ChatBot";
import Home from "@/pages/Home";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminProducts from "@/pages/admin/Products";
import AdminOrders from "@/pages/admin/Orders";
import AdminUsers from "@/pages/admin/Users";
import AdminSiteContent from "@/pages/admin/SiteContent";
import AdminPOS from "@/pages/admin/POS";
import POSCustomer from "@/pages/admin/POSCustomer";
import AdminDatabase from "@/pages/admin/Database";
import AdminDiscountCodes from "@/pages/admin/DiscountCodes";
import AdminCategories from "@/pages/admin/Categories";
import AdminAnalytics from "@/pages/admin/Analytics";
import AdminCategoryReports from "@/pages/admin/CategoryReports";
import AdminCategoryReportDetail from "@/pages/admin/CategoryReportDetail";
import AdminExchanges from "@/pages/admin/Exchanges";
import AdminBulkUpload from "@/pages/admin/BulkUpload";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Wishlist from "@/pages/Wishlist";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import OrderConfirmation from "@/pages/OrderConfirmation";
import ProductDetails from "@/pages/ProductDetails";
import Shop from "@/pages/Shop";
import DressesPage from "@/pages/DressesPage";
import ShoesPage from "@/pages/ShoesPage";
import ClothesPage from "@/pages/ClothesPage";
import SalesPage from "@/pages/SalesPage";

/* Reads the CSS `zoom` factor currently applied to <html> (e.g. the 0.87
   desktop scale on product/home pages). Mouse coordinates and
   getBoundingClientRect() are reported in on-screen, already-zoomed pixels,
   but inline `left`/`top` style values are pre-zoom CSS pixels that the
   browser multiplies by this factor when painting. Drag math must convert
   between the two spaces or the icon drifts away from the cursor. */
function getPageZoom(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom || "1");
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function isChunkError(error: Error) {
  return (
    error.name === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /Importing a module script failed/i.test(error.message) ||
    /Loading chunk \d+ failed/i.test(error.message)
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    // Stale deployment: chunk hashes changed — silently reload to get fresh bundle
    if (isChunkError(error)) {
      window.location.reload();
      return { error: null };
    }
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>⚠️</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              حدث خطأ غير متوقع
            </h2>
            <p style={{ color: "#666", marginBottom: "0.25rem" }}>Something went wrong</p>
            <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
              الرجاء إعادة تحميل الصفحة — سلتك محفوظة / Please reload the page — your cart is saved
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#111",
                color: "#fff",
                border: "none",
                padding: "0.75rem 2rem",
                fontSize: "1rem",
                cursor: "pointer",
                borderRadius: 6,
              }}
            >
              إعادة التحميل / Reload
            </button>
            <details style={{ marginTop: "1.5rem", textAlign: "left", direction: "ltr" }}>
              <summary style={{ cursor: "pointer", color: "#999", fontSize: "0.8rem" }}>
                Technical details
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.7rem",
                  color: "#999",
                  marginTop: "0.5rem",
                }}
              >
                {(this.state.error as Error).message}
                {"\n"}
                {(this.state.error as Error).stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Auth = lazy(() => import("@/pages/Auth"));
const Profile = lazy(() => import("@/pages/Profile"));
const OurLocation = lazy(() => import("@/pages/OurLocation"));
const FAQ = lazy(() => import("@/pages/FAQ"));
const ShippingReturns = lazy(() => import("@/pages/ShippingReturns"));
const Contact = lazy(() => import("@/pages/Contact"));
const DynamicCategoryPage = lazy(() => import("@/pages/DynamicCategoryPage"));

function PageSkeleton() {
  return <div className="min-h-screen bg-background" />;
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function PageScaleController() {
  const [location] = useLocation();

  useEffect(() => {
    const shouldScale =
      location === "/" ||
      location.startsWith("/product/") ||
      location === "/dresses" ||
      location === "/clothes" ||
      location === "/shoes" ||
      location === "/sales" ||
      location === "/our-location";

    document.documentElement.classList.toggle("product-details-page", shouldScale);

    return () => {
      document.documentElement.classList.remove("product-details-page");
    };
  }, [location]);

  return null;
}

function InstagramButton({
  dismissed,
  onDismiss,
}: {
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const [location] = useLocation();
  const [labelOpen, setLabelOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPos = pos ?? { x: 24, y: window.innerHeight - 24 - 56 };

  const beginDrag = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const actualX = rect ? rect.left : (pos?.x ?? 24);
    const actualY = rect ? rect.top : (pos?.y ?? window.innerHeight - 24 - 56);
    dragOffset.current = { x: clientX - actualX, y: clientY - actualY };
    isDragging.current = true;
    hasMoved.current = false;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button[data-close]")) return;
    e.preventDefault();
    beginDrag(e.clientX, e.clientY);

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      hasMoved.current = true;
      const zoom = getPageZoom();
      const iconSize = 56 * zoom;
      const screenX = Math.max(0, Math.min(window.innerWidth - iconSize, ev.clientX - dragOffset.current.x));
      const screenY = Math.max(0, Math.min(window.innerHeight - iconSize, ev.clientY - dragOffset.current.y));
      setPos({ x: screenX / zoom, y: screenY / zoom });
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("button[data-close]")) return;
    const touch = e.touches[0];
    beginDrag(touch.clientX, touch.clientY);

    const onMove = (ev: TouchEvent) => {
      if (!isDragging.current) return;
      hasMoved.current = true;
      const t = ev.touches[0];
      const zoom = getPageZoom();
      const iconSize = 56 * zoom;
      const screenX = Math.max(0, Math.min(window.innerWidth - iconSize, t.clientX - dragOffset.current.x));
      const screenY = Math.max(0, Math.min(window.innerHeight - iconSize, t.clientY - dragOffset.current.y));
      setPos({ x: screenX / zoom, y: screenY / zoom });
    };
    const onEnd = () => {
      isDragging.current = false;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    if (hasMoved.current) e.preventDefault();
  };

  const dismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss();
  };

  useEffect(() => {
    if (localStorage.getItem("ig_label_shown") === "1") return;
    if (window.innerWidth >= 1024) return;
    const t = setTimeout(() => {
      setLabelOpen(true);
      localStorage.setItem("ig_label_shown", "1");
      setTimeout(() => setLabelOpen(false), 4500);
    }, 20000);
    return () => clearTimeout(t);
  }, []);

  if (location.startsWith("/admin") || dismissed) return null;

  const href = "https://ig.me/m/lucerne.boutique";

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: 24, bottom: 24 };

  return (
    <div
      ref={containerRef}
      className="fixed z-50 group select-none"
      style={{ ...posStyle, touchAction: "none", cursor: "grab" }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      data-testid="instagram-widget"
    >
      <button
        data-close="true"
        onClick={dismiss}
        aria-label="Close"
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/75 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-black z-10 cursor-pointer"
        data-testid="button-instagram-close"
      >
        <X className="w-3 h-3" />
      </button>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصلي معنا على انستغرام"
        data-testid="button-instagram"
        onClick={handleLinkClick}
        className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] shadow-lg hover:scale-110 active:scale-95 transition-transform duration-200"
        style={{ cursor: "inherit" }}
      >
        <SiInstagram className="w-7 h-7 text-white" />
      </a>

      <span
        className={`absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gradient-to-r from-[#DD2A7B] to-[#8134AF] text-white text-xs font-medium px-3 py-1.5 rounded-full pointer-events-none shadow-md transition-opacity duration-200 ${
          labelOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        راسلينا على انستغرام
      </span>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/shop" component={Shop} />
        <Route path="/dresses" component={DressesPage} />
        <Route path="/shoes" component={ShoesPage} />
        <Route path="/clothes" component={ClothesPage} />
        <Route path="/sales" component={SalesPage} />
        <Route path="/product/:id" component={ProductDetails} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/checkout/success" component={CheckoutSuccess} />
        <Route path="/order-confirmation/:id" component={OrderConfirmation} />
        <Route path="/auth" component={Auth} />
        <Route path="/profile" component={Profile} />
        <Route path="/wishlist" component={Wishlist} />
        <Route path="/our-location" component={OurLocation} />
        <Route path="/faq" component={FAQ} />
        <Route path="/shipping-returns" component={ShippingReturns} />
        <Route path="/contact" component={Contact} />

        <Route path="/admin" component={AdminDashboard} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/terms-of-service" component={TermsOfService} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/site-content" component={AdminSiteContent} />
        <Route path="/admin/pos" component={AdminPOS} />
        <Route path="/admin/pos-customer" component={POSCustomer} />
        <Route path="/admin/database" component={AdminDatabase} />
        <Route path="/admin/discount-codes" component={AdminDiscountCodes} />
        <Route path="/admin/categories" component={AdminCategories} />
        <Route path="/admin/analytics" component={AdminAnalytics} />
        <Route path="/admin/reports/categories/:id" component={AdminCategoryReportDetail} />
        <Route path="/admin/reports/categories" component={AdminCategoryReports} />
        <Route path="/admin/exchanges" component={AdminExchanges} />
        <Route path="/admin/bulk-upload" component={AdminBulkUpload} />
        <Route path="/category/:slug" component={DynamicCategoryPage} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AbandonedCartReminder() {
  useAbandonedCartReminder();
  return null;
}

function ProductImagePreloader() {
  const [location] = useLocation();
  // Only the POS admin grid benefits from preloading every product image.
  // Doing it on the public storefront saturates mobile bandwidth and delays
  // the hero/first paint. Restrict to admin POS routes.
  const isPOS = location.startsWith("/admin/pos");
  if (!isPOS) return null;
  return <ProductImagePreloaderInner />;
}

function ProductImagePreloaderInner() {
  usePreloadProductImages();
  return null;
}

function SessionWatcher() {
  useSessionWatcher();
  return null;
}

function App() {
  const [igDismissed, setIgDismissed] = useState(
    () => sessionStorage.getItem("ig_dismissed") === "1"
  );

  const handleIgDismiss = () => {
    setIgDismissed(true);
    sessionStorage.setItem("ig_dismissed", "1");
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ScrollToTop />
          <PageScaleController />
          <SessionWatcher />
          <AbandonedCartReminder />
          <ProductImagePreloader />
          <Router />
          <ChatBot igVisible={!igDismissed} />
          <InstagramButton dismissed={igDismissed} onDismiss={handleIgDismiss} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
