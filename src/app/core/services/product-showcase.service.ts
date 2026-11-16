import { computed, Injectable, signal } from '@angular/core';

export interface ShowcaseBanner {
  name: string;
  src: string;
}

export interface ProductShowcase {
  featuredProductIds: number[];
  message: string;
  banners: ShowcaseBanner[];
}

const STORAGE_KEY = 'botoz.product-showcase.v1';
const EMPTY_SHOWCASE: ProductShowcase = { featuredProductIds: [], message: '', banners: [] };

/** Local prototype settings for featured products and customer scheme banners. */
@Injectable({ providedIn: 'root' })
export class ProductShowcaseService {
  private readonly state = signal(this.read());

  readonly featuredProductIds = computed(() => this.state().featuredProductIds);
  readonly message = computed(() => this.state().message);
  readonly banners = computed(() => this.state().banners);

  save(value: ProductShowcase): boolean {
    const snapshot = {
      featuredProductIds: [...new Set(value.featuredProductIds)],
      message: value.message.trim(),
      banners: value.banners.slice(0, 8).map((banner) => ({ ...banner })),
    };
    this.state.set(snapshot);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  private read(): ProductShowcase {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ProductShowcase> | null;
      if (!value) return EMPTY_SHOWCASE;
      return {
        featuredProductIds: Array.isArray(value.featuredProductIds) ? value.featuredProductIds : [],
        message: typeof value.message === 'string' ? value.message : '',
        banners: Array.isArray(value.banners) ? value.banners.slice(0, 8) : [],
      };
    } catch {
      return EMPTY_SHOWCASE;
    }
  }
}
