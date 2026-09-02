import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

export interface CartItem {
  product: Product;
  quantity: number;
  size?: string;
  color?: string;
}

interface GuestCartStore {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number, size?: string, color?: string) => void;
  removeFromCart: (productId: number, size?: string, color?: string) => void;
  updateQuantity: (productId: number, quantity: number, size?: string, color?: string) => void;
  clearCart: () => void;
}

export const useGuestCart = create<GuestCartStore>()(
  persist(
    (set) => ({
      items: [],
      addToCart: (product, quantity = 1, size, color) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.product.id === product.id && i.size === size && i.color === color
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: i.quantity + quantity } : i
              ),
            };
          }
          return { items: [...state.items, { product, quantity, size, color }] };
        });
      },
      removeFromCart: (productId, size, color) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.product.id === productId && i.size === size && i.color === color)
          ),
        }));
      },
      updateQuantity: (productId, quantity, size, color) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId && i.size === size && i.color === color
              ? { ...i, quantity: Math.max(1, quantity) }
              : i
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
    }),
    { name: "fashion-cart" }
  )
);

export interface CartStore {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number, size?: string, color?: string) => void;
  removeFromCart: (productId: number, size?: string, color?: string) => void;
  updateQuantity: (productId: number, quantity: number, size?: string, color?: string) => void;
  clearCart: () => void;
  cartTotal: () => number;
  isLoading?: boolean;
}

function computeTotal(items: CartItem[]): number {
  return items.reduce((total, item) => {
    const price = item.product.discountPrice
      ? parseFloat(item.product.discountPrice)
      : parseFloat(item.product.price);
    return total + price * item.quantity;
  }, 0);
}

type ServerCartItem = {
  product: Product;
  quantity: number;
  size?: string | null;
  color?: string | null;
};

function toCartItem(s: ServerCartItem): CartItem {
  return {
    product: s.product,
    quantity: s.quantity,
    size: s.size ?? undefined,
    color: s.color ?? undefined,
  };
}

const CART_KEY = ["/api/cart"];

export function useCart(): CartStore {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();

  const guestItems = useGuestCart((s) => s.items);
  const guestAdd = useGuestCart((s) => s.addToCart);
  const guestRemove = useGuestCart((s) => s.removeFromCart);
  const guestUpdate = useGuestCart((s) => s.updateQuantity);
  const guestClear = useGuestCart((s) => s.clearCart);

  const serverQuery = useQuery<ServerCartItem[]>({
    queryKey: CART_KEY,
    enabled: !!user,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CART_KEY });

  const sameItem = (i: ServerCartItem, productId: number, size?: string | null, color?: string | null) =>
    i.product.id === productId &&
    (i.size ?? null) === (size ?? null) &&
    (i.color ?? null) === (color ?? null);

  const addMutation = useMutation({
    mutationFn: (vars: { product: Product; quantity: number; size?: string; color?: string }) =>
      apiRequest("POST", "/api/cart", {
        productId: vars.product.id,
        quantity: vars.quantity,
        size: vars.size,
        color: vars.color,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: CART_KEY });
      const prev = queryClient.getQueryData<ServerCartItem[]>(CART_KEY);
      queryClient.setQueryData<ServerCartItem[]>(CART_KEY, (old = []) => {
        const existing = old.find((i) => sameItem(i, vars.product.id, vars.size, vars.color));
        if (existing) {
          return old.map((i) =>
            i === existing ? { ...i, quantity: i.quantity + vars.quantity } : i
          );
        }
        return [
          ...old,
          { product: vars.product, quantity: vars.quantity, size: vars.size ?? null, color: vars.color ?? null },
        ];
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) queryClient.setQueryData(CART_KEY, context.prev);
    },
    onSettled: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { productId: number; quantity: number; size?: string; color?: string }) =>
      apiRequest("PUT", "/api/cart/item", vars),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: CART_KEY });
      const prev = queryClient.getQueryData<ServerCartItem[]>(CART_KEY);
      queryClient.setQueryData<ServerCartItem[]>(CART_KEY, (old = []) =>
        old.map((i) =>
          sameItem(i, vars.productId, vars.size, vars.color) ? { ...i, quantity: vars.quantity } : i
        )
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) queryClient.setQueryData(CART_KEY, context.prev);
    },
    onSettled: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (vars: { productId: number; size?: string; color?: string }) =>
      apiRequest("DELETE", "/api/cart/item", vars),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: CART_KEY });
      const prev = queryClient.getQueryData<ServerCartItem[]>(CART_KEY);
      queryClient.setQueryData<ServerCartItem[]>(CART_KEY, (old = []) =>
        old.filter((i) => !sameItem(i, vars.productId, vars.size, vars.color))
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) queryClient.setQueryData(CART_KEY, context.prev);
    },
    onSettled: invalidate,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/cart"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: CART_KEY });
      const prev = queryClient.getQueryData<ServerCartItem[]>(CART_KEY);
      queryClient.setQueryData(CART_KEY, []);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) queryClient.setQueryData(CART_KEY, context.prev);
    },
    onSettled: invalidate,
  });

  if (!user) {
    return {
      items: guestItems,
      addToCart: guestAdd,
      removeFromCart: guestRemove,
      updateQuantity: (productId, quantity, size, color) => {
        if (quantity < 1) {
          guestRemove(productId, size, color);
        } else {
          guestUpdate(productId, quantity, size, color);
        }
      },
      clearCart: guestClear,
      cartTotal: () => computeTotal(guestItems),
      isLoading: false,
    };
  }

  const serverItems: CartItem[] = (serverQuery.data ?? []).map(toCartItem);

  return {
    items: serverItems,
    addToCart: (product, quantity = 1, size, color) =>
      addMutation.mutate({ product, quantity, size, color }),
    removeFromCart: (productId, size, color) =>
      removeMutation.mutate({ productId, size: size ?? undefined, color: color ?? undefined }),
    updateQuantity: (productId, quantity, size, color) => {
      if (quantity < 1) {
        removeMutation.mutate({ productId, size: size ?? undefined, color: color ?? undefined });
      } else {
        updateMutation.mutate({ productId, quantity, size: size ?? undefined, color: color ?? undefined });
      }
    },
    clearCart: () => clearMutation.mutate(),
    cartTotal: () => computeTotal(serverItems),
    isLoading: serverQuery.isLoading,
  };
}
