import { computed, inject, Injectable, signal } from '@angular/core';
import { OrderItem } from '../models';
import { AppStateService } from './app-state.service';
import { DataService } from '../data/data.service';
import { Observable, of, tap } from 'rxjs';

/**
 * Holds in-progress order drafts (baskets), one per customer id.
 *
 * - Customer role: the basket belongs to the logged-in customer.
 * - Staff role: the basket belongs to the customer they are ordering for.
 *
 * Baskets are kept in memory for the session; they are not persisted because
 * a confirmed order is the durable record.
 */
@Injectable({ providedIn: 'root' })
export class BasketService {
  private readonly appState = inject(AppStateService);
  private readonly data = inject(DataService);

  /** customerId -> draft order lines */
  private readonly baskets = signal<Record<number, OrderItem[]>>({});
  /** Prevent a late server read from replacing a draft the user just changed. */
  private readonly dirtyCustomerIds = new Set<number>();

  /** The basket for the currently active customer context. */
  readonly currentItems = computed<OrderItem[]>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.baskets()[id] ?? []) : [];
  });

  readonly currentCount = computed(() => this.currentItems().length);
  readonly loading = signal(false);

  addItem(item: OrderItem): void {
    const id = this.appState.activeCustomerId();
    if (!id) {
      return;
    }
    this.baskets.update((all) => {
      const next = { ...all };
      next[id] = [...(next[id] ?? []), item];
      return next;
    });
    this.dirtyCustomerIds.add(id);
  }

  removeItem(index: number): void {
    const id = this.appState.activeCustomerId();
    if (!id) {
      return;
    }
    this.baskets.update((all) => {
      const current = all[id] ?? [];
      if (index < 0 || index >= current.length) {
        return all;
      }
      const next = { ...all };
      next[id] = current.filter((_, i) => i !== index);
      return next;
    });
    this.dirtyCustomerIds.add(id);
  }

  clear(customerId: number): void {
    this.baskets.update((all) => {
      if (!(customerId in all)) {
        return all;
      }
      const next = { ...all };
      next[customerId] = [];
      return next;
    });
    this.dirtyCustomerIds.delete(customerId);
  }

  /** Snapshot of every non-empty basket, for the staff "live baskets" view. */
  snapshotByCustomer(): Record<number, OrderItem[]> {
    return this.baskets();
  }

  /** Loads the durable basket for the current customer/order context. */
  loadCurrent(): Observable<OrderItem[]> {
    const customerId = this.appState.activeCustomerId();
    if (!customerId) return of([]);
    if (this.dirtyCustomerIds.has(customerId)) return of(this.currentItems());
    this.loading.set(true);
    // Staff use the admin customer endpoint; customers use their scoped endpoint.
    const apiCustomerId = this.appState.role() === 'Customer' ? undefined : customerId;
    return this.data.getBasket(apiCustomerId).pipe(tap({
      next: (items) => {
        this.baskets.update((all) => ({ ...all, [customerId]: items }));
        this.dirtyCustomerIds.delete(customerId);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    }));
  }

  /** Persists the current draft when the review dialog is closed or cancelled. */
  saveCurrent(): Observable<OrderItem[]> {
    const customerId = this.appState.activeCustomerId();
    if (!customerId) return of([]);
    const apiCustomerId = this.appState.role() === 'Customer' ? undefined : customerId;
    return this.data.saveBasket(this.currentItems(), apiCustomerId).pipe(tap((items) => {
      this.baskets.update((all) => ({ ...all, [customerId]: items }));
      this.dirtyCustomerIds.delete(customerId);
    }));
  }
}
