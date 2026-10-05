import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n";
import { useCategories } from "@/hooks/use-categories";
import { Wallet, Package, ChevronRight, ChevronLeft, Warehouse, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InventoryRow {
  category_id: number;
  category: string;
  category_ar: string;
  product_count: number;
  in_stock_count: number;
  out_of_stock_count: number;
  total_units: number;
  total_selling_value: string;
  paid_up_capital: string;
  avg_price: string;
}

export default function CategoryReports() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const Arrow = isAr ? ChevronLeft : ChevronRight;
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: inventory, isLoading: invLoading } = useQuery<InventoryRow[]>({
    queryKey: ["/api/admin/category-inventory"],
    queryFn: async () => {
      const res = await fetch("/api/admin/category-inventory", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load inventory data");
      return res.json();
    },
  });

  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const isLoading = catLoading || invLoading;
  const invMap = new Map((inventory ?? []).map((r) => [r.category_id, r]));

  const rows = (categories ?? [])
    .map((c: any) => {
      const inv = invMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        nameAr: c.nameAr,
        image: c.image,
        capital: inv ? Number(inv.paid_up_capital) : 0,
        sellingValue: inv ? Number(inv.total_selling_value) : 0,
        productCount: inv ? inv.product_count : 0,
      };
    })
    .sort((a, b) => b.capital - a.capital);

  const totalCapital = rows.reduce((s, r) => s + r.capital, 0);

  return (
    <AdminLayout>
      <AdminPageHeader
        title={isAr ? "رأس مال الفئات" : "Category Manager"}
        description={
          isAr
            ? "اضغط على أي فئة لعرض رأس المال، الفئات الفرعية، ومبيعات الموقع ونقطة البيع بالتفصيل"
            : "Click any category to see its capital, subcategories, and full website + POS sales breakdown"
        }
        icon={Wallet}
        iconGradient="from-amber-500 to-orange-600"
        testId="text-category-reports-title"
        actions={
          <Link href="/admin/analytics" data-testid="link-back-to-reports">
            <Button variant="outline" size="sm" className="gap-1.5">
              <BackArrow className="w-4 h-4" />
              {isAr ? "تقرير المبيعات" : "Sales Report"}
            </Button>
          </Link>
        }
      />

      <div className="mb-6 bg-card border border-border rounded-xl p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
          <Warehouse className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {isAr ? "إجمالي رأس المال المدفوع (كل الفئات)" : "Total paid-up capital (all categories)"}
          </p>
          <p className="text-xl font-semibold mt-0.5">{fmt(totalCapital)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-24">
          {isAr ? "لا توجد فئات بعد" : "No categories yet"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/admin/reports/categories/${row.id}`}
              data-testid={`link-category-report-${row.id}`}
              className="group bg-card border border-border rounded-xl p-5 hover:border-amber-400 hover:shadow-md transition-all flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                  {row.image ? (
                    <img src={row.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{isAr ? row.nameAr || row.name : row.name}</h3>
                </div>
                <Arrow className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 transition-colors flex-shrink-0" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? "رأس المال" : "Capital"}</p>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">{fmt(row.capital)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? "عدد المنتجات" : "Products"}</p>
                  <p className="font-semibold">{row.productCount}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
