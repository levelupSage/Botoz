import { Customer, Product } from '../models';

/**
 * Business-rule helpers shared across Products, Ordering and Basket.
 * Ported verbatim (in behaviour) from the BOTOZ V15 prototype so pricing and
 * orderability stay consistent everywhere.
 */

/** Format a number as Indian rupees, or an em dash when empty. */
export function money(value: number | null | undefined): string {
  return value ? `₹${Number(value).toLocaleString('en-IN')}` : '—';
}

/** Does the product have at least one active image? */
export function hasActiveImage(product: Product): boolean {
  return (product.images ?? []).some((img) => img.active);
}

/** The first active image with a usable src, if any. */
export function activeImageSrc(product: Product): string | null {
  const img = (product.images ?? []).find((i) => i.active && i.src);
  return img?.src ?? null;
}

/**
 * The display price for a product for a given customer:
 * a per-customer override wins, else the product's A/B/C tier price.
 */
export function priceFor(product: Product, customer: Customer | null | undefined): number | undefined {
  if (!customer) {
    return undefined;
  }
  const override = customer.overrides?.[product.id];
  return override ?? product.categoryPrices?.[customer.category];
}

/**
 * Can this product be ordered by this customer right now?
 * Requires: product active + has an active image + has a price > 0 + active customer.
 */
export function isOrderableFor(
  product: Product | null | undefined,
  customer: Customer | null | undefined,
): boolean {
  if (!product || !customer || !customer.active || !product.active) {
    return false;
  }
  if (!hasActiveImage(product)) {
    return false;
  }
  return Number(priceFor(product, customer)) > 0;
}
