import { computed, inject, Injectable, signal, WritableSignal } from '@angular/core';
import { forkJoin, Observable, of, tap, timeout } from 'rxjs';
import { DataService } from '../data/data.service';
import { Customer, Product } from '../models';

/**
 * Reactive store for products and customers used throughout the workspace.
 * Loads once from the swappable {@link DataService} and exposes signals that
 * feature pages (Products, Orders, Basket) read from.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly data = inject(DataService);

  private readonly _products = signal<Product[]>([]);
  private readonly _customers = signal<Customer[]>([]);
  private readonly _loading = signal(false);
  private readonly _customersLoading = signal(false);
  private readonly _productsLoading = signal(false);
  private readonly _productsLoaded = signal(false);
  private readonly _customersLoaded = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _customersError = signal<string | null>(null);
  private readonly _productsError = signal<string | null>(null);

  readonly products = this._products.asReadonly();
  readonly customers = this._customers.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly customersLoading = this._customersLoading.asReadonly();
  readonly productsLoading = this._productsLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly customersError = this._customersError.asReadonly();
  readonly productsError = this._productsError.asReadonly();
  readonly activeCustomers = computed(() => this._customers().filter((c) => c.active));

  /** Loads products and customers once; force=true refreshes both. */
  load(force = false): void {
    const loadProducts = force || !this._productsLoaded();
    const loadCustomers = force || !this._customersLoaded();
    if (this._loading() || (!loadProducts && !loadCustomers)) return;
    this._loading.set(true);
    this._error.set(null);

    forkJoin({
      products: loadProducts ? this.data.getProducts() : of(this._products()),
      customers: loadCustomers ? this.data.getCustomers() : of(this._customers()),
    }).pipe(timeout({ first: 60_000 })).subscribe({
      next: ({ products, customers }) => {
        if (loadProducts) {
          this._products.set(products);
          this._productsLoaded.set(true);
        }
        if (loadCustomers) {
          this._customers.set(customers);
          this._customersLoaded.set(true);
        }
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Could not load catalog data. Check the API connection and try again.');
        this._loading.set(false);
      },
    });
  }

  /** Load only customers for features that do not need the product catalogue. */
  loadCustomers(force = false): void {
    if (this._customersLoading() || (this._customersLoaded() && !force)) return;
    this._customersLoading.set(true);
    this._customersError.set(null);
    this.data.getCustomers().pipe(timeout({ first: 60_000 })).subscribe({
      next: (customers) => {
        this._customers.set(customers);
        this._customersLoaded.set(true);
        this._customersLoading.set(false);
      },
      error: () => {
        this._customersError.set('Could not load customers. Check the API connection and try again.');
        this._customersLoading.set(false);
      },
    });
  }

  /** Load products without coupling their request state to customer data. */
  loadProducts(force = false): void {
    if (this._productsLoading() || (this._productsLoaded() && !force)) return;
    this._productsLoading.set(true);
    this._productsError.set(null);
    this.data.getProducts().pipe(timeout({ first: 60_000 })).subscribe({
      next: (products) => {
        this._products.set(products);
        this._productsLoaded.set(true);
        this._productsLoading.set(false);
      },
      error: () => {
        this._productsError.set('Could not load products. Check the API connection and try again.');
        this._productsLoading.set(false);
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

  setProductActive(id: number, active: boolean): Observable<Product> {
    return this.data.setProductActive(id, active).pipe(
      tap((saved) => this.mergeInto(this._products, saved)),
    );
  }

  getProduct(id: number): Observable<Product> {
    return this.data.getProduct(id).pipe(tap((product) => this.mergeInto(this._products, product)));
  }

  deleteProductPhoto(productId: number, photoId: number): Observable<void> {
    return this.data.deleteProductPhoto(productId, photoId).pipe(
      tap(() => this._products.update((products) => products.map((product) => product.id === productId
        ? { ...product, images: product.images.filter((image) => image.id !== photoId) }
        : product))),
    );
  }

  saveCustomer(customer: Customer): Observable<Customer> {
    return this.data
      .saveCustomer(customer)
      .pipe(tap((saved) => this.mergeInto(this._customers, saved)));
  }

  setCustomerActive(customer: Customer, active: boolean): Observable<Customer> {
    return this.data.setCustomerActive(customer, active).pipe(
      tap((saved) => this.mergeInto(this._customers, saved)),
    );
  }

  deleteCustomer(id: number): Observable<void> {
    return this.data.deleteCustomer(id).pipe(
      tap(() => this._customers.update((customers) => customers.filter((customer) => customer.id !== id))),
    );
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
