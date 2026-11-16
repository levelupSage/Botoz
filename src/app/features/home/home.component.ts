import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Brand, Customer, Product } from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProductShowcaseService } from '../../core/services/product-showcase.service';
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
  private readonly showcase = inject(ProductShowcaseService);

  readonly loading = this.catalog.loading;
  readonly banners = this.showcase.banners;
  readonly schemeMessage = this.showcase.message;

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

  /** Admin-picked fast sellers, falling back to the first available products. */
  readonly featured = computed<Product[]>(() => {
    const available = this.catalog.products().filter((product) => isOrderableFor(product, this.customer()));
    const ids = this.showcase.featuredProductIds();
    return ids.length
      ? ids.map((id) => available.find((product) => product.id === id)).filter((product): product is Product => !!product)
      : available.slice(0, 6);
  });

  ngOnInit(): void {
    this.catalog.load();
  }

  browseBrand(brand: Brand): void {
    this.router.navigate(['/app', 'products'], { queryParams: { brand: brand.name } });
  }

  browseAll(): void {
    this.router.navigate(['/app', 'products']);
  }

  imageSrc(product: Product): string | null {
    return product.images.find((image) => image.active && image.src)?.src ?? null;
  }
}
