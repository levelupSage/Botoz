import { computed, inject, Injectable, signal, WritableSignal } from '@angular/core';
import { forkJoin, Observable, tap, timeout } from 'rxjs';
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
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly products = this._products.asReadonly();
  readonly customers = this._customers.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly activeCustomers = computed(() => this._customers().filter((c) => c.active));

  /** Loads products and customers once; force=true refreshes both. */
  load(force = false): void {
    if (this._loading() || (this._loaded() && !force)) {
      return;
    }
    this._loading.set(true);
    this._error.set(null);

    forkJoin({
      products: this.data.getProducts(),
      customers: this.data.getCustomers(),
    }).pipe(timeout({ first: 60_000 })).subscribe({
      next: ({ products, customers }) => {
        this._products.set(products);
        this._customers.set(customers);
        this._loaded.set(true);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Could not load catalog data. Check the API connection and try again.');
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

  deleteProductPhoto(productId: number, photoId: number): Observable<Product> {
    return this.data.deleteProductPhoto(productId, photoId).pipe(
      tap((saved) => this.mergeInto(this._products, saved)),
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
