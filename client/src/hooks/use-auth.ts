import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type LoginRequest, type RegisterRequest } from "@shared/schema";
import { useGuestCart } from "@/store/use-cart";

export function mergeGuestCartInBackground(queryClient: ReturnType<typeof useQueryClient>) {
  const guestItems = useGuestCart.getState().items;
  if (guestItems.length === 0) return;

  const items = guestItems
    .filter((i) => i?.product?.id && Number.isInteger(Number(i.product.id)) && Number(i.product.id) > 0)
    .map((i) => ({
      productId: Number(i.product.id),
      quantity: Math.max(1, Number(i.quantity) || 1),
      size: i.size || null,
      color: i.color || null,
    }));

  if (items.length === 0) {
    useGuestCart.getState().clearCart();
    return;
  }

  fetch("/api/cart/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ items }),
  })
    .then((res) => {
      if (res.ok) {
        useGuestCart.getState().clearCart();
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      }
    })
    .catch(() => {});
}

export function useAuth() {
  return useQuery({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: "include" });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      return api.auth.me.responses[200].parse(data);
    },
    refetchInterval: 30 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to login");
      }
      return api.auth.login.responses[200].parse(await res.json());
    },
    onSuccess: (user) => {
      queryClient.setQueryData([api.auth.me.path], user);
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      mergeGuestCartInBackground(queryClient);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const res = await fetch(api.auth.register.path, {
        method: api.auth.register.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 400 && data.message) {
          throw new Error(data.message);
        }
        throw new Error(data.message || "Failed to register");
      }
      return await res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData([api.auth.me.path], user);
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      mergeGuestCartInBackground(queryClient);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to logout");
    },
    onSuccess: () => {
      queryClient.setQueryData([api.auth.me.path], null);
      queryClient.setQueryData([api.orders.list.path], []);
      queryClient.setQueryData(["/api/wishlist"], []);
      queryClient.setQueryData(["/api/wishlist/products"], []);
      queryClient.removeQueries({ queryKey: ["/api/cart"] });
      useGuestCart.getState().clearCart();
    },
  });
}
