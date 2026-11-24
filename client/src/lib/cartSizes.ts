/* Which sizes and colours of a product can still be bought — used by the cart and the checkout
   so a customer can pick or change a size without opening the product page. */

type AnyProduct = any;

export type SizeOption = { size: string; stock: number };

export function colourOptions(product: AnyProduct): { name: string; colorCode?: string; mainImage?: string }[] {
  return ((product?.colorVariants as any[]) || []).filter((v) => v && v.name);
}

export function sizeOptions(product: AnyProduct, color?: string | null): SizeOption[] {
  const variants = colourOptions(product) as any[];
  const variant = color ? variants.find((v) => v.name === color) : undefined;
  const inventory: Record<string, number> | undefined =
    variant?.sizeInventory && Object.keys(variant.sizeInventory).length > 0
      ? variant.sizeInventory
      : product?.sizeInventory && Object.keys(product.sizeInventory).length > 0
        ? product.sizeInventory
        : undefined;
  if (inventory) return Object.entries(inventory).map(([size, stock]) => ({ size, stock: Number(stock) || 0 }));
  const sizes: string[] = (variant?.sizes?.length ? variant.sizes : product?.sizes) || [];
  return sizes.map((size) => ({ size, stock: Number(product?.stockQuantity) || 0 }));
}

/** Stock of a colour as a whole: the sum of its sizes, or the product's own stock. */
export function colourStock(product: AnyProduct, color?: string | null): number {
  const sizes = sizeOptions(product, color);
  if (sizes.length) return sizes.reduce((n, s) => n + s.stock, 0);
  return Number(product?.stockQuantity) || 0;
}
