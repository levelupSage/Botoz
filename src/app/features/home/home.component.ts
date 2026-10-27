import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Brand, Customer, Product } from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { CatalogService } from '../../core/services/catalog.service';
import { isOrderableFor } from '../../core/utils/pricing.util';

/** Customer landing: welcome, brand tiles, and a few featured products. */
@Component({
  selector: 'app-home',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly appState = inject(AppStateService);
  private readonly router = inject(Router);

  readonly loading = this.catalog.loading;

  readonly customer = computed<Customer | null>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.catalog.customerById(id) ?? null) : null;
  });

  readonly brandTiles = computed(() =>
    this.catalog.activeBrands().map((brand) => ({
      brand,
      available: this.catalog
        .products()
        .filter((p) => p.brand === brand.name && isOrderableFor(p, this.customer())).length,
    })),
  );

  /** First few orderable products, used as "featured". */
  readonly featured = computed<Product[]>(() =>
    this.catalog
      .products()
      .filter((p) => isOrderableFor(p, this.customer()))
      .slice(0, 6),
  );

  ngOnInit(): void {
    this.catalog.load();
  }

  browseBrand(brand: Brand): void {
    this.router.navigate(['/app', 'products'], { queryParams: { brand: brand.name } });
  }

  browseAll(): void {
    this.router.navigate(['/app', 'products']);
  }
}
