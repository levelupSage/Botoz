import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Product } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { activeImageSrc, money } from '../../core/utils/pricing.util';

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
  readonly includePrice = signal<boolean>(true);

  readonly brandOptions = computed(() => ['All', ...this.catalog.activeBrands().map((b) => b.name)]);

  readonly items = computed<Product[]>(() => {
    const filter = this.brandFilter();
    return this.catalog
      .products()
      .filter((p) => p.active && (filter === 'All' || p.brand === filter));
  });

  readonly money = money;

  ngOnInit(): void {
    this.catalog.load();
  }

  imageSrc(product: Product): string | null {
    return activeImageSrc(product);
  }

  print(): void {
    window.print();
  }
}
