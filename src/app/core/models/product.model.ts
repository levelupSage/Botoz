import { PriceTier } from './enums';

export interface ProductImage {
  name: string;
  active: boolean;
  archived?: boolean;
  src: string;
}

export interface PackingRow {
  size: number;
  pairs: number;
}

export interface Packing {
  id: number;
  name: string;
  rows: PackingRow[];
  active?: boolean;
}

export interface Product {
  id: number;
  brand: string;
  code: string;
  name: string;
  category: string;
  mrp: number;
  /** Display price per wholesale tier (A/B/C). */
  categoryPrices: Record<PriceTier, number>;
  active: boolean;
  /** True when the product is archived and unavailable for ordering. */
  archived?: boolean;
  images: ProductImage[];
  sizes: number[];
  packings: Packing[];
  /** All API-assigned groups, including groups used only to define sizes. */
  packingGroupIds?: number[];
  enabledPackingGroupIds?: number[];
}
