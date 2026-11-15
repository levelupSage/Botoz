import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Customer, Product } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { activeImageSrc, isOrderableFor, money, priceFor } from '../../core/utils/pricing.util';

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

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;

  readonly brandFilter = signal<string>('All');
  readonly catalogueType = signal<'standard' | 'customer'>('standard');
  readonly customerId = signal<number>(0);
  readonly includeCode = signal(true);
  readonly includeMrp = signal(true);
  readonly includeSizes = signal(true);
  readonly includePrice = signal(false);

  readonly brandOptions = computed(() => ['All', ...this.catalog.activeBrands().map((b) => b.name)]);
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
          (filter === 'All' || p.brand === filter) &&
          (this.catalogueType() !== 'customer' || isOrderableFor(p, this.selectedCustomer())),
      );
  });

  ngOnInit(): void {
    this.catalog.load();
  }

  imageSrc(product: Product): string | null {
    return activeImageSrc(product);
  }

  displayPrice(product: Product): string {
    const customer = this.selectedCustomer();
    return this.catalogueType() === 'customer'
      ? money(priceFor(product, customer))
      : money(product.mrp);
  }

  selectCustomer(value: string): void {
    this.customerId.set(Number(value));
  }

  print(): void {
    window.print();
  }
}
