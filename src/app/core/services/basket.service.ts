import { computed, inject, Injectable, signal } from '@angular/core';
import { OrderItem } from '../models';
import { AppStateService } from './app-state.service';

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

  /** customerId -> draft order lines */
  private readonly baskets = signal<Record<number, OrderItem[]>>({});

  /** The basket for the currently active customer context. */
  readonly currentItems = computed<OrderItem[]>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.baskets()[id] ?? []) : [];
  });

  readonly currentCount = computed(() => this.currentItems().length);

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
  }

  /** Snapshot of every non-empty basket, for the staff "live baskets" view. */
  snapshotByCustomer(): Record<number, OrderItem[]> {
    return this.baskets();
  }
}
