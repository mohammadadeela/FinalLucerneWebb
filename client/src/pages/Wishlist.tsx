import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "wouter";
import { Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { ProductCard } from "@/components/ui/ProductCard";
import { useLanguage } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/use-products";

type WishlistItem = {
  id: number;
  userId: number;
  productId: number;
  color?: string | null;
  createdAt: string | null;
};

export default function Wishlist() {
  const { t } = useLanguage();
  const { data: user } = useAuth();

  const { data: wishlistItems = [], isLoading: wishlistLoading } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: !!user,
  });

  const { data: allProducts = [], isLoading: productsLoading } = useProducts();

  const isLoading = wishlistLoading || productsLoading;

  const validProducts = useMemo(() => {
    return wishlistItems
      .map((item) => {
        const product = allProducts.find((p) => p.id === item.productId);
        return product ? { ...item, product } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [wishlistItems, allProducts]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Heart className="w-6 h-6 fill-rose-500 stroke-rose-500" />
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">
            {t.wishlist.title}
          </h1>
          {validProducts.length > 0 && (
            <span className="text-muted-foreground text-sm">
              ({validProducts.length})
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-[3/4] bg-secondary animate-pulse" />
                <div className="h-4 bg-secondary animate-pulse rounded w-3/4" />
                <div className="h-4 bg-secondary animate-pulse rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : validProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
              <Heart className="w-10 h-10 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-xl">{t.wishlist.empty}</h2>
              <p className="text-muted-foreground text-sm max-w-sm">{t.wishlist.emptyDesc}</p>
            </div>
            <Button asChild className="rounded-md px-8">
              <Link href="/shop">
                <ShoppingBag className="w-4 h-4 me-2" />
                {t.wishlist.continueShopping}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {validProducts.map((item) => (
              <ProductCard
                key={item.id}
                product={item.product}
                initialColorName={item.color}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
