import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useCategories() {
  return useQuery({
    queryKey: [api.categories.list.path],
    queryFn: async () => {
      const res = await fetch(api.categories.list.path);
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      const parsed = api.categories.list.responses[200].safeParse(data);
      if (parsed.success) return parsed.data;
      return (data as any[]).map((cat: any) => ({
        id: Number(cat.id),
        name: cat.name ?? "",
        nameAr: cat.nameAr ?? cat.name_ar ?? null,
        slug: cat.slug ?? "",
        image: cat.image ?? null,
        showOnHome: cat.showOnHome ?? cat.show_on_home ?? false,
      }));
    },
  });
}
