import { computed, inject, Injectable, signal, WritableSignal } from '@angular/core';
import { forkJoin, Observable, tap } from 'rxjs';
import { DataService } from '../data/data.service';
import { Brand, Customer, Product } from '../models';

/**
 * Central reactive store for catalog data (brands, products, customers).
 * Loads once from the swappable {@link DataService} and exposes signals that
 * feature pages (Products, Orders, Basket) read from.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly data = inject(DataService);

  private readonly _brands = signal<Brand[]>([]);
  private readonly _products = signal<Product[]>([]);
  private readonly _customers = signal<Customer[]>([]);
  private readonly _loading = signal(false);
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly brands = this._brands.asReadonly();
  readonly products = this._products.asReadonly();
  readonly customers = this._customers.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly activeBrands = computed(() => this._brands().filter((b) => b.active));
  readonly activeCustomers = computed(() => this._customers().filter((c) => c.active));

  /** Loads catalog data once; call again with force=true to refresh. */
  load(force = false): void {
    if (this._loading() || (this._loaded() && !force)) {
      return;
    }
    this._loading.set(true);
    this._error.set(null);

    forkJoin({
      brands: this.data.getBrands(),
      products: this.data.getProducts(),
      customers: this.data.getCustomers(),
    }).subscribe({
      next: ({ brands, products, customers }) => {
        this._brands.set(brands);
        this._products.set(products);
        this._customers.set(customers);
        this._loaded.set(true);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Could not load catalog data.');
        this._loading.set(false);
      },
    });
  }

  productById(id: number): Product | undefined {
    return this._products().find((p) => p.id === id);
  }

  customerById(id: number): Customer | undefined {
    return this._customers().find((c) => c.id === id);
  }

  // ---- Writes (persist via DataService, then update local signals) -----
  saveBrand(brand: Brand): Observable<Brand> {
    return this.data.saveBrand(brand).pipe(tap((saved) => this.mergeInto(this._brands, saved)));
  }

  saveProduct(product: Product): Observable<Product> {
    return this.data
      .saveProduct(product)
      .pipe(tap((saved) => this.mergeInto(this._products, saved)));
  }

  setProductArchived(id: number, archived: boolean): Observable<Product> {
    return this.data.setProductArchived(id, archived).pipe(
      tap((saved) => this.mergeInto(this._products, saved)),
    );
  }

  saveCustomer(customer: Customer): Observable<Customer> {
    return this.data
      .saveCustomer(customer)
      .pipe(tap((saved) => this.mergeInto(this._customers, saved)));
  }

  /** Replace-or-append the saved entity into a signal-backed list by id. */
  private mergeInto<T extends { id: number }>(list: WritableSignal<T[]>, saved: T): void {
    list.update((items) => {
      const index = items.findIndex((i) => i.id === saved.id);
      if (index >= 0) {
        const copy = [...items];
        copy[index] = saved;
        return copy;
      }
      return [...items, saved];
    });
  }
}
