import { Switch, Route, useLocation } from "wouter";
import { useState, useEffect, useRef, Component, type ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAbandonedCartReminder } from "@/hooks/use-abandoned-cart-reminder";
import NotFound from "@/pages/not-found";
import { SiInstagram } from "react-icons/si";
import { X } from "lucide-react";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{ padding: "2rem", fontFamily: "monospace", direction: "ltr" }}
        >
          <h2 style={{ color: "red" }}>Application Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {(this.state.error as Error).message}
            {"\n"}
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

import Home from "@/pages/Home";
import ProductDetails from "@/pages/ProductDetails";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Auth from "@/pages/Auth";
import Profile from "@/pages/Profile";
import DressesPage from "@/pages/DressesPage";
import ShoesPage from "@/pages/ShoesPage";
import ClothesPage from "@/pages/ClothesPage";
import SalesPage from "@/pages/SalesPage";
import Shop from "@/pages/Shop";

import OurLocation from "@/pages/OurLocation";
import FAQ from "@/pages/FAQ";
import ShippingReturns from "@/pages/ShippingReturns";
import Contact from "@/pages/Contact";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Wishlist from "@/pages/Wishlist";

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
import AdminExchanges from "@/pages/admin/Exchanges";
import DynamicCategoryPage from "@/pages/DynamicCategoryPage";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function InstagramButton() {
  const [location] = useLocation();
  const [labelOpen, setLabelOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("ig_dismissed") === "1"
  );
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const getInitialPos = () => ({
    x: 24,
    y: window.innerHeight - 24 - 56,
  });

  const currentPos = pos ?? getInitialPos();

  const beginDrag = (clientX: number, clientY: number) => {
    const p = pos ?? getInitialPos();
    dragOffset.current = { x: clientX - p.x, y: clientY - p.y };
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
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 56, ev.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 56, ev.clientY - dragOffset.current.y)),
      });
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
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 56, t.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 56, t.clientY - dragOffset.current.y)),
      });
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
    setDismissed(true);
    sessionStorage.setItem("ig_dismissed", "1");
  };

  // Auto-show label once after 20 s, mobile only
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

  return (
    <div
      className="fixed z-50 group select-none"
      style={{ left: currentPos.x, top: currentPos.y, touchAction: "none", cursor: "grab" }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      data-testid="instagram-widget"
    >
      {/* Close button — visible on hover */}
      <button
        data-close="true"
        onClick={dismiss}
        aria-label="Close"
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/75 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-black z-10 cursor-pointer"
        data-testid="button-instagram-close"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Instagram button */}
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

      {/* Tooltip label */}
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
      <Route path="/admin/exchanges" component={AdminExchanges} />

      <Route path="/category/:slug" component={DynamicCategoryPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function AbandonedCartReminder() {
  useAbandonedCartReminder();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ScrollToTop />
          <AbandonedCartReminder />
          <Router />
          <InstagramButton />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
