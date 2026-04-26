import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type CreateProductRequest, type UpdateProductRequest } from "@shared/schema";

export function useProducts() {
  return useQuery({
    queryKey: [api.products.list.path],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(api.products.list.path);
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = await res.json();
      return api.products.list.responses[200].parse(data);
    },
  });
}

export function useBestSellers(limit = 8) {
  return useQuery({
    queryKey: ["/api/products/best-sellers", limit],
    queryFn: async () => {
      const res = await fetch(`/api/products/best-sellers?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch best sellers");
      return res.json() as Promise<any[]>;
    },
  });
}

export function useProduct(id: number) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [api.products.get.path, id],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const url = buildUrl(api.products.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch product");
      const data = await res.json();
      return api.products.get.responses[200].parse(data);
    },
    enabled: !!id,
    // Instantly seed from the products-list cache so the page renders immediately
    initialData: () => {
      const list = queryClient.getQueryData<any[]>([api.products.list.path]);
      const found = list?.find((p) => p.id === id);
      return found ?? undefined;
    },
    initialDataUpdatedAt: () =>
      queryClient.getQueryState([api.products.list.path])?.dataUpdatedAt,
  });
}

// Lightweight prefetch helper — call this on card hover
export function usePrefetchProduct() {
  const queryClient = useQueryClient();
  return (id: number) => {
    queryClient.prefetchQuery({
      queryKey: [api.products.get.path, id],
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const url = buildUrl(api.products.get.path, { id });
        const res = await fetch(url);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("Failed to fetch product");
        return res.json();
      },
    });
  };
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProductRequest) => {
      const res = await fetch(api.products.create.path, {
        method: api.products.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create product");
      return api.products.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/best-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateProductRequest) => {
      const url = buildUrl(api.products.update.path, { id });
      const res = await fetch(url, {
        method: api.products.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update product");
      return api.products.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.get.path, id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/best-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.products.delete.path, { id });
      const res = await fetch(url, {
        method: api.products.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete product");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/best-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}
