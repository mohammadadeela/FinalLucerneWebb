import { useQuery, useQueries, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, buildUrl } from "@shared/routes";
import { type CreateProductRequest, type UpdateProductRequest } from "@shared/schema";
import { optimizeCloudinaryUrl } from "@/lib/utils";
import { unwrapApiResponse } from "@/lib/queryClient";

// Tracks URLs already loaded into the browser image cache to avoid duplicates
const _preloaded = new Set<string>();

function preloadImage(url: string) {
  if (!url || _preloaded.has(url)) return;
  _preloaded.add(url);
  const img = new Image();
  img.src = url;
}

export function useProducts() {
  return useQuery({
    queryKey: [api.products.list.path],
    // 30s (was 5 min) so stock sold at the POS shows on the website quickly.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch(api.products.list.path);
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = unwrapApiResponse(await res.json());
      return api.products.list.responses[200].parse(data);
    },
  });
}

/**
 * Call once at app root. Fires silent image preloads for every product's
 * mainImage and color-variant images as soon as the products list is cached.
 *
 * Preloads BOTH the original URL and the 400px-optimized version used by POS
 * cards so the POS grid shows images instantly from cache.
 */
export function usePreloadProductImages() {
  const { data: products } = useProducts();
  const preloadedRef = useRef(false);

  useEffect(() => {
    if (!products || preloadedRef.current) return;
    preloadedRef.current = true;
    // IMPORTANT: only preload the SMALL 400px version of each product's main
    // image — the exact URL the POS/shop cards display. Preloading the
    // full-size originals (and every variant/side photo) downloaded many
    // multi-MB files that hogged the connection and made the visible card
    // images load slowly. Cards request 400px, so that's all we warm here.
    for (const p of products) {
      const main = p.mainImage || ((p as any).colorVariants?.[0]?.mainImage ?? "");
      if (!main) continue;
      const opt400 = optimizeCloudinaryUrl(main, 400);
      preloadImage(opt400 || main);
    }
  }, [products]);
}

export function useProductsByCategory(categoryIds: number[]) {
  const key = categoryIds.slice().sort().join(",");
  return useQuery({
    queryKey: [api.products.list.path, "byCategory", key],
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    enabled: categoryIds.length > 0,
    queryFn: async () => {
      const res = await fetch(`${api.products.list.path}?categoryIds=${key}`);
      if (!res.ok) throw new Error("Failed to fetch products");
      return unwrapApiResponse<any[]>(await res.json());
    },
  });
}

export function useBestSellers(limit = 8) {
  return useQuery({
    queryKey: ["/api/products/best-sellers", limit],
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await fetch(`/api/products/best-sellers?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch best sellers");
      return unwrapApiResponse<any[]>(await res.json());
    },
  });
}

export function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: ["/api/products/featured", limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/products/featured?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch featured products");
      return unwrapApiResponse<any[]>(await res.json());
    },
  });
}

export function useNewArrivalsProducts(limit = 8, days = 14) {
  return useQuery({
    queryKey: ["/api/products/new-arrivals", limit, days],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/products/new-arrivals?limit=${limit}&days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch new arrivals");
      return unwrapApiResponse<any[]>(await res.json());
    },
  });
}

export function useOnSaleProducts(limit = 8) {
  return useQuery({
    queryKey: ["/api/products/on-sale", limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/products/on-sale?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch on-sale products");
      return unwrapApiResponse<any[]>(await res.json());
    },
  });
}

export function useHomeCategoryProducts(categoryIds: number[], limit = 8) {
  return useQueries({
    queries: categoryIds.map((catId) => ({
      queryKey: ["/api/products/by-category", catId, limit],
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const res = await fetch(`/api/products/by-category/${catId}?limit=${limit}`);
        if (!res.ok) throw new Error("Failed to fetch category products");
        return unwrapApiResponse<any[]>(await res.json());
      },
    })),
  });
}

export function useProduct(id: number) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [api.products.get.path, id],
    // 30s (was 5 min) so a product page always shows near-live stock.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const url = buildUrl(api.products.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch product");
      const data = unwrapApiResponse(await res.json());
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
        return unwrapApiResponse(await res.json());
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
      if (!res.ok) {
        let message = "Failed to create product";
        try {
          const err = await res.json();
          if (err?.message) message = err.message;
        } catch {}
        throw new Error(message);
      }
      const json = unwrapApiResponse(await res.json());
      return api.products.create.responses[201].parse(json);
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
      if (!res.ok) {
        let message = "Failed to update product";
        try {
          const err = await res.json();
          if (err?.message) message = err.message;
        } catch {}
        throw new Error(message);
      }
      const json = unwrapApiResponse(await res.json());
      return api.products.update.responses[200].parse(json);
    },
    onMutate: async ({ id, ...updates }) => {
      // Optimistically patch the product in the cached list so the edit appears
      // instantly, before the server responds.
      await queryClient.cancelQueries({ queryKey: [api.products.list.path] });
      const previous = queryClient.getQueryData<any[]>([api.products.list.path]);
      queryClient.setQueryData<any[]>([api.products.list.path], (old) =>
        Array.isArray(old)
          ? old.map((p) => (Number(p?.id) === Number(id) ? { ...p, ...updates } : p))
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      // Roll back if the server rejected the change.
      if (context?.previous) {
        queryClient.setQueryData([api.products.list.path], context.previous);
      }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.products.get.path, id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/best-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
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
        headers: { Accept: "application/json" },
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!res.ok) {
        const message =
          json?.message ||
          json?.error?.message ||
          `Failed to delete product (${res.status})`;
        throw new Error(message);
      }

      return json ? unwrapApiResponse(json) : { id };
    },
    onSuccess: (_data, id) => {
      // Update the visible admin list immediately, then refetch to sync counts,
      // labels, best-seller widgets, and any other derived data.
      queryClient.setQueryData<any[]>([api.products.list.path], (old) =>
        Array.isArray(old) ? old.filter((product) => Number(product?.id) !== Number(id)) : old,
      );
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.get.path, id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/best-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}
