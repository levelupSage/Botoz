import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Customer, Product } from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';
import { activeImageSrc, hasActiveImage, isOrderableFor, money, priceFor } from '../../core/utils/pricing.util';
import { OrderModalComponent } from './order-modal.component';
import { ProductModalComponent } from './product-modal.component';

type StatusFilter = 'All' | 'Active' | 'Archived' | 'Deactivated';

/**
 * Products catalogue. Behaviour mirrors the prototype:
 * - Customers / staff-ordering see only orderable products and an "Order" button.
 * - Admins browsing see all products with pricing and management affordances.
 */
@Component({
  selector: 'app-products',
  imports: [OrderModalComponent, ProductModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly appState = inject(AppStateService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;
  readonly role = this.appState.role;

  readonly search = signal('');
  readonly brandFilter = signal<string>('All');
  /** Status tab: All / Active / Archived (staff catalogue view). */
  readonly statusFilter = signal<StatusFilter>('All');

  /** Product chosen to open the order modal, or null. */
  readonly orderProduct = signal<Product | null>(null);

  /** Product edit/add modal state. undefined = closed, null = add, Product = edit. */
  readonly editProduct = signal<Product | null | undefined>(undefined);

  readonly isCustomer = computed(() => this.role() === 'Customer');
  readonly isStaff = this.appState.isStaff;
  readonly isStaffOrdering = this.appState.isStaffOrdering;
  readonly canManage = computed(() => this.role() === 'Admin' || this.role() === 'Super Admin');

  readonly orderableCustomers = computed(() => this.catalog.activeCustomers());

  /** Customer-picker modal (opened by "＋ Create order"). */
  readonly pickerOpen = signal(false);
  readonly pickerSearch = signal('');

  readonly pickerResults = computed(() => {
    const term = this.pickerSearch().trim().toLowerCase();
    return this.orderableCustomers().filter((c) =>
      `${c.name} ${c.code} ${c.phone} ${c.loginId ?? ''}`.toLowerCase().includes(term),
    );
  });

  openPicker(): void {
    this.pickerSearch.set('');
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  chooseCustomer(id: number): void {
    this.appState.setStaffOrderCustomer(id);
    this.pickerOpen.set(false);
    const name = this.catalog.customerById(id)?.name ?? '';
    this.toast.show(`Choosing products for ${name}`);
  }

  startStaffOrder(customerId: string): void {
    const id = Number(customerId);
    if (id > 0) {
      this.appState.setStaffOrderCustomer(id);
    }
  }

  stopStaffOrder(): void {
    this.appState.clearStaffOrderCustomer();
  }

  /** The customer whose pricing applies to the current view. */
  readonly activeCustomer = computed<Customer | null>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.catalog.customerById(id) ?? null) : null;
  });

  /** True when prices/order buttons should be customer-scoped. */
  readonly orderingMode = computed(() => this.isCustomer() || this.isStaffOrdering());

  readonly brandOptions = computed(() => ['All', ...this.catalog.brands().map((b) => b.name)]);

  /** Counts shown on the status tabs. */
  readonly counts = computed(() => {
    const all = this.catalog.products();
    return {
      all: all.length,
      active: all.filter((p) => p.active && !p.archived).length,
      archived: all.filter((p) => p.archived).length,
      deactivated: all.filter((p) => !p.active && !p.archived).length,
    };
  });

  readonly filtered = computed<Product[]>(() => {
    const term = this.search().trim().toLowerCase();
    const brand = this.brandFilter();
    const status = this.statusFilter();
    const ordering = this.orderingMode();
    const customer = this.activeCustomer();

    return this.catalog.products().filter((p) => {
      // Ordering views only ever show orderable products.
      if (ordering) {
        if (!isOrderableFor(p, customer)) {
          return false;
        }
      } else {
        // Staff catalogue: apply the status tab.
        if (status === 'Active' && (!p.active || p.archived)) {
          return false;
        }
        if (status === 'Archived' && !p.archived) {
          return false;
        }
        if (status === 'Deactivated' && (p.active || p.archived)) {
          return false;
        }
      }
      if (brand !== 'All' && p.brand !== brand) {
        return false;
      }
      const haystack = `${p.name} ${p.code} ${p.brand}`.toLowerCase();
      return haystack.includes(term);
    });
  });

  readonly heading = computed(() => {
    if (this.isCustomer()) {
      return 'Shop products';
    }
    if (this.isStaffOrdering()) {
      return `Create order · ${this.activeCustomer()?.name ?? ''}`;
    }
    return 'Product catalogue';
  });

  ngOnInit(): void {
    this.catalog.load();
    const brand = this.route.snapshot.queryParamMap.get('brand');
    if (brand) {
      this.brandFilter.set(brand);
    }
  }

  priceLabel(product: Product): string {
    if (this.orderingMode()) {
      const price = priceFor(product, this.activeCustomer());
      return price ? money(price) : 'Not assigned';
    }
    const cp = product.categoryPrices;
    return `A ${money(cp.A)} · B ${money(cp.B)} · C ${money(cp.C)}`;
  }

  imageSrc(product: Product): string | null {
    return activeImageSrc(product);
  }

  statusLabel(product: Product): string {
    if (product.archived) return 'ARCHIVED';
    return product.active ? 'ACTIVE' : 'DEACTIVATED';
  }

  showOrderButton(): boolean {
    return this.orderingMode();
  }

  openOrder(product: Product): void {
    const customer = this.activeCustomer();
    if (!customer) {
      this.toast.show('No customer context — please sign in again or pick a customer.');
      return;
    }
    if (!isOrderableFor(product, customer)) {
      this.toast.show('Product unavailable or price not assigned for this customer');
      return;
    }
    this.orderProduct.set(product);
  }

  closeOrder(): void {
    this.orderProduct.set(null);
  }

  onAdded(): void {
    this.orderProduct.set(null);
    this.toast.show(this.isCustomer() ? 'Added to your basket' : 'Added to order draft');
  }

  money = money;

  goToBasket(): void {
    this.router.navigate(['/app', 'basket']);
  }

  // ---- Product management (Admin / Super Admin) -----------------------
  openAdd(): void {
    this.editProduct.set(null);
    this.toast.show('Opening add-product form…');
  }

  openEdit(product: Product): void {
    this.editProduct.set(product);
    this.toast.show('Opening editor…');
  }

  closeEdit(): void {
    this.editProduct.set(undefined);
  }

  onProductSaved(): void {
    this.editProduct.set(undefined);
  }

  toggleArchive(product: Product): void {
    this.dataArchive(product).subscribe({
      next: (saved) =>
        this.toast.show(saved.archived ? 'Product archived' : 'Product restored'),
      error: () => this.toast.show('Could not update the product.'),
    });
  }

  private dataArchive(product: Product) {
    return this.catalog.setProductArchived(product.id, !product.archived);
  }

  photoCount(product: Product): number {
    return (product.images ?? []).length;
  }

  hasPhoto(product: Product): boolean {
    return hasActiveImage(product);
  }
}
