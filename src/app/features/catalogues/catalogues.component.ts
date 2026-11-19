import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Customer, Product } from '../../core/models';
import { BrandService } from '../../core/services/brand.service';
import { CatalogService } from '../../core/services/catalog.service';
import { activeImageSrc, hasActiveImage, money, priceFor } from '../../core/utils/pricing.util';

/**
 * Catalogues: pick a brand (or all), optionally show MRP, and print a
 * grid-style A4 catalogue of active products via the browser print dialog.
 */
@Component({
  selector: 'app-catalogues',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalogues.component.html',
  styleUrl: './catalogues.component.scss',
})
export class CataloguesComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly brandService = inject(BrandService);

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;

  readonly brandFilter = signal<string>('All');
  readonly catalogueType = signal<'standard' | 'customer'>('standard');
  readonly customerId = signal<number>(0);
  readonly includeCode = signal(true);
  readonly includeMrp = signal(true);
  readonly includeSizes = signal(true);
  readonly includePrice = signal(false);
  readonly previewGenerated = signal(false);

  readonly brandOptions = computed(() => ['All', ...this.brandService.activeBrands().map((b) => b.name)]);
  readonly customerOptions = this.catalog.activeCustomers;
  readonly selectedCustomer = computed<Customer | null>(
    () => this.catalog.customerById(this.customerId()) ?? null,
  );

  readonly items = computed<Product[]>(() => {
    const filter = this.brandFilter();
    return this.catalog
      .products()
      .filter(
        (p) =>
          p.active &&
          !p.archived &&
          hasActiveImage(p) &&
          (filter === 'All' || p.brand === filter),
      );
  });

  /** V15 lays out sixteen products on each printed A4 page. */
  readonly pages = computed(() => {
    const products = this.items();
    const pageCount = Math.max(1, Math.ceil(products.length / 16));
    return Array.from({ length: pageCount }, (_, index) => ({
      number: index + 1,
      products: products.slice(index * 16, (index + 1) * 16),
    }));
  });

  ngOnInit(): void {
    this.catalog.load();
    this.brandService.load();
  }

  imageSrc(product: Product): string | null {
    return activeImageSrc(product);
  }

  displayPrice(product: Product): string {
    const customer = this.selectedCustomer();
    return money(priceFor(product, customer));
  }

  displayMrp(product: Product): string {
    return money(product.mrp);
  }

  activeSizeGroups(product: Product): { name: string; sizes: number[] }[] {
    if (product.sizeGroups) {
      return product.sizeGroups
        .filter((group) => group.active)
        .map((group) => ({
          name: group.name,
          sizes: [...new Set(group.sizes)].sort((a, b) => a - b),
        }))
        .filter((group) => group.sizes.length > 0);
    }
    return (product.packings ?? [])
      .filter((packing) => packing.active !== false && packing.rows?.length)
      .map((packing) => ({
        name: packing.name,
        sizes: [...new Set(packing.rows.map((row) => row.size))].sort((a, b) => a - b),
      }));
  }

  selectCustomer(value: string): void {
    this.customerId.set(Number(value));
  }

  generatePreview(): void {
    this.previewGenerated.set(true);
  }

  print(): void {
    window.print();
  }
}
