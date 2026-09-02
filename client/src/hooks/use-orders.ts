import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

export function useOrders() {
  return useQuery({
    queryKey: [api.orders.list.path],
    queryFn: async () => {
      const res = await fetch(api.orders.list.path, { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      return api.orders.list.responses[200].parse(data);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Always returns only the current user's own orders, even for admins. Use this in Profile. */
export function useMyOrders() {
  return useQuery({
    queryKey: [api.orders.list.path, "own"],
    queryFn: async () => {
      const res = await fetch(api.orders.list.path + "?own=true", { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      return api.orders.list.responses[200].parse(data);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: [api.orders.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.orders.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch order details");
      const data = await res.json();
      const parsed = api.orders.get.responses[200].safeParse(data);
      if (parsed.success) return parsed.data;
      return data as z.infer<(typeof api.orders.get.responses)[200]>;
    },
    enabled: !!id,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.orders.create.input>) => {
      const res = await fetch(api.orders.create.path, {
        method: api.orders.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.message || "Failed to create order") as any;
        err.code = errData.code;
        err.outOfStock = errData.outOfStock;
        throw err;
      }
      return api.orders.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.get.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const url = buildUrl(api.orders.updateStatus.path, { id });
      const res = await fetch(url, {
        method: api.orders.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update status");
      return api.orders.updateStatus.responses[200].parse(await res.json());
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.orders.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.get.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}

export function useBulkUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      const res = await fetch("/api/orders/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update orders");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.orders.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.get.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}

// ── Admin-only order item editing (add / replace product-color / remove) ──
// Every mutation invalidates the order detail, the orders list (line-item
// count/total can change), and the products list (stock levels change).
function invalidateAfterOrderItemEdit(queryClient: ReturnType<typeof useQueryClient>, orderId: number) {
  queryClient.invalidateQueries({ queryKey: [api.orders.get.path, orderId] });
  queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.products.get.path] });
}

export function useAddOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      productId,
      quantity,
      size,
      color,
    }: { orderId: number; productId: number; quantity: number; size?: string | null; color?: string | null }) => {
      const res = await fetch(`/api/admin/orders/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity, size, color }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to add item");
      return data;
    },
    onSuccess: (_, { orderId }) => invalidateAfterOrderItemEdit(queryClient, orderId),
  });
}

export function useUpdateOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      itemId,
      productId,
      quantity,
      size,
      color,
    }: { orderId: number; itemId: number; productId?: number; quantity?: number; size?: string | null; color?: string | null }) => {
      const res = await fetch(`/api/admin/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity, size, color }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to update item");
      return data;
    },
    onSuccess: (_, { orderId }) => invalidateAfterOrderItemEdit(queryClient, orderId),
  });
}

export function useRemoveOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, itemId }: { orderId: number; itemId: number }) => {
      const res = await fetch(`/api/admin/orders/${orderId}/items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to remove item");
      return data;
    },
    onSuccess: (_, { orderId }) => invalidateAfterOrderItemEdit(queryClient, orderId),
  });
}
