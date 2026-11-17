import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'botoz_customer_order_rights_v1';

@Injectable({ providedIn: 'root' })
export class CustomerOrderRightsService {
  private readonly _rights = signal<Record<number, boolean>>(this.readStoredRights());

  canOrder(customerId: number): boolean {
    return this._rights()[customerId] !== false;
  }

  set(customerId: number, enabled: boolean): void {
    this._rights.update((rights) => ({ ...rights, [customerId]: enabled }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._rights()));
    } catch {
      // Keep the current session working when browser storage is unavailable.
    }
  }

  remove(customerId: number): void {
    this._rights.update((rights) => {
      const updated = { ...rights };
      delete updated[customerId];
      return updated;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._rights()));
    } catch {
      // Keep the current session working when browser storage is unavailable.
    }
  }

  private readStoredRights(): Record<number, boolean> {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.fromEntries(
        Object.entries(value).flatMap(([id, enabled]) =>
          /^\d+$/.test(id) && typeof enabled === 'boolean' ? [[Number(id), enabled]] : [],
        ),
      );
    } catch {
      return {};
    }
  }
}
