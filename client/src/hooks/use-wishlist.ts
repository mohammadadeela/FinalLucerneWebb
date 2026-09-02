import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { useLocation } from "wouter";

export type WishlistItem = { id: number; userId: number; productId: number; color?: string | null; createdAt: string | null };

export function useWishlist() {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [, navigate] = useLocation();

  const query = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const wishlistItems = query.data ?? [];

  const isWishlisted = (productId: number) =>
    wishlistItems.some((item) => item.productId === productId);

  const getItemId = (productId: number) =>
    wishlistItems.find((item) => item.productId === productId)?.id;

  const getSavedColor = (productId: number) =>
    wishlistItems.find((item) => item.productId === productId)?.color ?? null;

  const addMutation = useMutation({
    mutationFn: ({ productId, color }: { productId: number; color?: string | null }) =>
      apiRequest("POST", "/api/wishlist", { productId, color }),
    onMutate: async ({ productId, color }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/wishlist"] });
      const previous = queryClient.getQueryData<WishlistItem[]>(["/api/wishlist"]);
      const tempItem: WishlistItem = {
        id: -Date.now(),
        userId: (user as any)?.id ?? 0,
        productId,
        color: color ?? null,
        createdAt: null,
      };
      queryClient.setQueryData<WishlistItem[]>(["/api/wishlist"], (old = []) => [...old, tempItem]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["/api/wishlist"], context.previous);
      }
    },
    onSuccess: () => {
      toast({ title: t.wishlist.addedToWishlist, description: t.wishlist.tapToViewWishlist, icon: "heart", onClick: () => navigate("/wishlist") } as any);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/products"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/wishlist/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/wishlist"] });
      const previous = queryClient.getQueryData<WishlistItem[]>(["/api/wishlist"]);
      queryClient.setQueryData<WishlistItem[]>(["/api/wishlist"], (old = []) =>
        old.filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["/api/wishlist"], context.previous);
      }
    },
    onSuccess: () => {
      toast({ title: t.wishlist.removedFromWishlist });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/products"] });
    },
  });

  const toggle = (productId: number, color?: string | null) => {
    if (!user) return false;
    const itemId = getItemId(productId);
    if (itemId !== undefined) {
      removeMutation.mutate(itemId);
    } else {
      addMutation.mutate({ productId, color });
    }
    return true;
  };

  return {
    wishlistItems,
    isWishlisted,
    getItemId,
    getSavedColor,
    toggle,
    isLoading: query.isLoading,
    isPending: addMutation.isPending || removeMutation.isPending,
  };
}
