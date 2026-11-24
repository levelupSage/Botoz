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

  private readonly menuAliases: Record<string, string[]> = {
    Dashboard: ['dashboard'],
    Products: ['products', 'product', 'prices'],
    Packaging: ['packaging'],
    'New Orders': ['neworders', 'orders'],
    'Photo Order': ['photoorder', 'photosorder', 'pictureorders'],
    Customers: ['customers', 'customer'],
    Brands: ['brands', 'brand'],
    Catalogues: ['catalogues', 'catalogue'],
    'Order History': ['orderhistory', 'orderhistry', 'orders'],
    Team: ['team', 'staff', 'useraccounts'],
    Settings: ['settings'],
    Home: ['home'],
    Basket: ['basket', 'orders'],
    Orders: ['orders'],
    Account: ['account'],
  };

  readonly role = computed<UserRole>(() => this.auth.role() ?? 'Customer');
  readonly isStaff = computed(() => this.role() !== 'Customer');
  // The backend owns account authorization. Customer-specific order rights will
  // be added here only when its API exposes an authoritative field/endpoint.
  readonly customerCanOrder = computed(() =>
    this.role() !== 'Customer' || this.auth.isAuthenticated(),
  );

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

  canAccessMenu(menu: string): boolean {
    const role = this.role();
    if (role === 'Customer' && !this.customerCanOrder() && ['Basket', 'Orders'].includes(menu)) {
      return false;
    }
    if (role === 'Super Admin' || role === 'Customer') return true;

    const allowedMenus = this.auth.user()?.menus;
    if (allowedMenus === undefined) return true;
    if (this.hasUnmappedMenuIds(allowedMenus)) {
      // Some API responses return menu IDs. The API still enforces these grants;
      // until IDs are paired with their labels, avoid hiding the entire workspace.
      return true;
    }

    const aliases = this.menuAliases[menu] ?? [menu];
    const normalizedAllowed = allowedMenus
      .map((item) => this.normalizeMenu(item))
      .filter(Boolean);
    return aliases.some((alias) => normalizedAllowed.some((allowed) =>
      allowed === alias || allowed.includes(alias) || alias.includes(allowed),
    ));
  }

  /** Checks a permission by its exact API menu name (for combined screens). */
  canAccessFeature(feature: string): boolean {
    const role = this.role();
    if (role === 'Super Admin' || role === 'Customer') return true;

    const allowedMenus = this.auth.user()?.menus;
    if (allowedMenus === undefined) return true;
    if (this.hasUnmappedMenuIds(allowedMenus)) return true;

    const target = this.normalizeMenu(feature);
    return allowedMenus.some((menu) => this.normalizeMenu(menu) === target);
  }

  private normalizeMenu(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private hasUnmappedMenuIds(menus: string[]): boolean {
    return menus.length > 0 && menus.every((menu) => /^\d+$/.test(menu.trim()));
  }

  /** Navigation entries available to the current role. */
  private readonly roleNavItems = computed<string[]>(() => {
    switch (this.role()) {
      case 'Customer':
        return ['Home', 'Products', 'Basket', 'Orders', 'Account'];
      case 'Backend User':
        return ['Dashboard', 'New Orders', 'Products', 'Packaging', 'Customers', 'Catalogues'];
      case 'Admin':
      case 'Super Admin':
        return [
          'Dashboard',
          'Products',
          'Packaging',
          'New Orders',
          'Photo Order',
          'Customers',
          'Brands',
          'Catalogues',
          'Order History',
          'Team',
          'Settings',
        ];
      default:
        return [];
    }
  });

  readonly navItems = computed(() => this.roleNavItems().filter((item) => this.canAccessMenu(item)));

  /** First valid section to open after login for each role. */
  readonly defaultRoute = computed(() => {
    if (this.role() === 'Customer') return '/app/home';
    const firstMenu = this.navItems()[0];
    return firstMenu ? `/app/${firstMenu.toLowerCase().replace(/\s+/g, '-')}` : '/';
  });
}
