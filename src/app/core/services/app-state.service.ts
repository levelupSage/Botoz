import { computed, inject, Injectable, signal } from '@angular/core';
import { UserRole } from '../models';
import { AuthService } from './auth.service';

/**
 * UI-level session state derived from the authenticated user: which nav items
 * to show and which customer context is active for pricing/ordering.
 */
@Injectable({ providedIn: 'root' })
export class AppStateService {
  private readonly auth = inject(AuthService);

  readonly role = computed<UserRole>(() => this.auth.role() ?? 'Customer');
  readonly isStaff = computed(() => this.role() !== 'Customer');

  /**
   * Customer selected by a staff member when creating an order on someone's
   * behalf. 0 = no customer selected (staff is browsing the catalogue only).
   */
  private readonly _staffOrderCustomerId = signal<number>(0);
  readonly staffOrderCustomerId = this._staffOrderCustomerId.asReadonly();

  /**
   * The effective customer id for pricing/ordering:
   * - Customer role -> their own customerId
   * - Staff role    -> the customer they are ordering for (0 if none)
   */
  readonly activeCustomerId = computed<number>(() => {
    if (this.role() === 'Customer') {
      return this.auth.user()?.customerId ?? 0;
    }
    return this._staffOrderCustomerId();
  });

  /** True when staff has picked a customer to build an order for. */
  readonly isStaffOrdering = computed(() => this.isStaff() && this._staffOrderCustomerId() > 0);

  setStaffOrderCustomer(id: number): void {
    this._staffOrderCustomerId.set(id);
  }

  clearStaffOrderCustomer(): void {
    this._staffOrderCustomerId.set(0);
  }

  /** Navigation entries available to the current role. */
  readonly navItems = computed<string[]>(() => {
    switch (this.role()) {
      case 'Customer':
        return ['Home', 'Products', 'Basket', 'Orders', 'Account'];
      case 'Backend User':
        return ['Dashboard', 'Orders', 'Products', 'Packaging', 'Catalogues'];
      default:
        return [
          'Dashboard',
          'Products',
          'Packaging',
          'Orders',
          'Customers',
          'Brands',
          'Catalogues',
          'Order History',
        ];
    }
  });
}
