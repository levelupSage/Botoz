import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from '../../core/data/data.service';
import { BackendUserOption, Customer, Order, OrderItem, OrderStatus } from '../../core/models';
import { AdminPhotoOrderService } from '../../core/services/admin-photo-order.service';
import { AppStateService } from '../../core/services/app-state.service';
import { AuthService } from '../../core/services/auth.service';
import { BasketService } from '../../core/services/basket.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

interface LiveBasket {
  customer: Customer;
  items: OrderItem[];
}

type QueueTab = 'new' | 'not-billed' | 'dispatched' | 'pending' | 'basket';
type SizeDisposition = 'ready' | 'pending';

/**
 * Orders list + detail. Customers see only their own orders; staff see all.
 * Customer order history never displays any monetary total.
 */
@Component({
  selector: 'app-orders',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
})
export class OrdersComponent implements OnInit {
  private readonly data = inject(DataService);
  private readonly appState = inject(AppStateService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly basket = inject(BasketService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly photoOrders = inject(AdminPhotoOrderService);

  readonly loading = signal(true);
  readonly supportsOrderStatusUpdate = this.data.supportsOrderStatusUpdate;
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly categoryFilter = signal<'All' | 'A' | 'B' | 'C'>('All');
  readonly queueTab = signal<QueueTab>('new');
  readonly selected = signal<Order | null>(null);
  readonly statusDraft = signal<OrderStatus>('Confirmed');
  readonly savingStatus = signal(false);
  readonly statusError = signal<string | null>(null);
  readonly sizeDispositions = signal<Record<string, SizeDisposition>>({});

  private readonly orders = signal<Order[]>([]);
  readonly backendUsers = signal<BackendUserOption[]>([]);

  readonly isCustomer = computed(() => this.appState.role() === 'Customer');
  readonly canViewAdminRate = computed(() => ['Admin', 'Super Admin'].includes(this.appState.role()));

  isNewOrdersView(): boolean {
    return this.router.url.includes('/new-orders');
  }

  /** Staff-only: customers who currently have in-progress baskets. */
  readonly liveBaskets = computed<LiveBasket[]>(() => {
    if (this.isCustomer()) {
      return [];
    }
    const snapshot = this.basket.snapshotByCustomer();
    const result: LiveBasket[] = [];
    for (const [idStr, items] of Object.entries(snapshot)) {
      if (!items.length) {
        continue;
      }
      const customer = this.catalog.customerById(Number(idStr));
      if (customer) {
        result.push({ customer, items });
      }
    }
    return result;
  });

  readonly liveBasketTotal = computed(() =>
    this.liveBaskets().reduce((n, b) => n + b.items.length, 0),
  );

  readonly filtered = computed<Order[]>(() => {
    const term = this.search().trim().toLowerCase();
    const myCustomerId = this.auth.user()?.customerId;

    return this.orders().filter((o) => {
      if (this.isCustomer() && o.customerId !== myCustomerId) {
        return false;
      }
      if (!this.isCustomer() && this.isNewOrdersView() && o.status === 'Delivered') {
        return false;
      }
      if (!term) {
        return true;
      }
      const items = (o.items ?? [])
        .map((i) => `${i.productName ?? ''} ${i.code ?? ''}`)
        .join(' ');
      return `${o.id} ${o.customer} ${o.date} ${items}`.toLowerCase().includes(term);
    });
  });

  readonly queueOrders = computed<Order[]>(() => {
    const tab = this.queueTab();
    const term = this.search().trim().toLowerCase();
    const category = this.categoryFilter();
    return this.orders().filter((order) => {
      if (!this.inQueue(order, tab)) return false;
      const customer = this.catalog.customerById(order.customerId);
      if (category !== 'All' && customer?.category !== category) return false;
      if (!term) return true;
      const items = order.items.map((item) => `${item.productName} ${item.code}`).join(' ');
      return `${order.id} ${order.customer} ${order.date} ${items}`.toLowerCase().includes(term);
    });
  });

  queueCount(tab: QueueTab): number {
    if (tab === 'basket') return this.liveBasketTotal();
    return this.orders().filter((order) => this.inQueue(order, tab)).length;
  }

  selectQueue(tab: QueueTab): void {
    this.queueTab.set(tab);
  }

  customerMeta(order: Order): string {
    const customer = this.catalog.customerById(order.customerId);
    return customer ? `${customer.code} · Category ${customer.category}` : `Customer #${order.customerId}`;
  }

  customerLabel(order: Order): string {
    const station = this.catalog.customerById(order.customerId)?.station?.trim();
    return station ? `${order.customer} (Station: ${station.toUpperCase()})` : order.customer;
  }

  assignmentLabel(order: Order): string {
    if (order.assignedUserId) {
      const user = this.backendUsers().find((item) => item.id === order.assignedUserId);
      return user ? `${user.fullName} · ${user.loginId}` : `Backend User #${order.assignedUserId}`;
    }
    return order.createdBy && order.createdBy !== 'API' ? order.createdBy : 'Unassigned';
  }

  bookingLabel(order: Order): string {
    const value = order.bookingStatus?.trim();
    if (!value) return order.status;
    return value.toLowerCase().replace(/(^|[_\s-])\w/g, (letter) => letter.toUpperCase().replace(/[_-]/, ' '));
  }

  workLabel(order: Order): string {
    return `Work: ${order.workStatus ?? order.status}`;
  }

  workStatusLabel(order: Order): string {
    return order.workStatus ?? order.status;
  }

  productBrand(item: OrderItem): string {
    return item.brand || this.catalog.products().find((product) => product.id === item.productId)?.brand || '—';
  }

  productImage(item: OrderItem): string | null {
    const product = this.catalog.productById(item.productId);
    return product?.images.find((image) => image.active && !image.archived)?.src
      ?? product?.images.find((image) => !image.archived)?.src
      ?? null;
  }

  isSizeReady(order: Order, lineIndex: number, size: number): boolean {
    return this.sizeDispositions()[this.sizeDispositionKey(order, lineIndex, size)] === 'ready';
  }

  setSizeDisposition(order: Order, lineIndex: number, size: number, disposition: SizeDisposition): void {
    const key = this.sizeDispositionKey(order, lineIndex, size);
    this.sizeDispositions.update((current) => ({ ...current, [key]: disposition }));
  }

  readyPairs(order: Order, item: OrderItem, lineIndex: number): number {
    return item.rows.reduce(
      (total, row) => total + (this.isSizeReady(order, lineIndex, row.size) ? row.qty : 0),
      0,
    );
  }

  lineWorkStatus(order: Order, item: OrderItem, lineIndex: number): string {
    const ready = this.readyPairs(order, item, lineIndex);
    if (ready === 0) return 'Pending';
    if (ready < item.total) return 'In progress';
    return 'Ready';
  }

  lineWorkStatusClass(order: Order, item: OrderItem, lineIndex: number): string {
    return this.lineWorkStatus(order, item, lineIndex) === 'In progress' ? 'blue' : '';
  }

  private sizeDispositionKey(order: Order, lineIndex: number, size: number): string {
    return `${order.id}:${lineIndex}:${size}`;
  }

  private inQueue(order: Order, tab: QueueTab): boolean {
    if (tab === 'basket') return false;
    if (tab === 'new') return !['Processing', 'Dispatched', 'Delivered'].includes(order.status);
    if (tab === 'not-billed') return order.status === 'Processing';
    if (tab === 'dispatched') return ['Dispatched', 'Delivered'].includes(order.status);
    return order.status === 'Pending';
  }

  ngOnInit(): void {
    this.catalog.load();
    this.data.getOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load orders.');
        this.loading.set(false);
      },
    });
    this.photoOrders.backendUsers().subscribe({
      next: (users) => this.backendUsers.set(users),
      // The orders list must still work when the user list is unavailable.
      error: () => undefined,
    });
  }

  statusClass(status: OrderStatus): string {
    switch (status) {
      case 'Delivered':
        return 'gold';
      case 'Dispatched':
        return 'gold';
      case 'Processing':
        return 'blue';
      default:
        return '';
    }
  }

  distribution(item: OrderItem): string {
    return item.rows.map((r) => `${r.size}: ${r.qty}`).join(' · ');
  }

  typeLabel(item: OrderItem): string {
    return item.mode === 'carton'
      ? `${item.cartons} carton(s) · ${item.packingName}`
      : 'Size-wise';
  }

  open(order: Order): void {
    this.selected.set(order);
    this.sizeDispositions.set({});
    this.statusDraft.set(order.status);
    this.statusError.set(null);
  }

  close(): void {
    this.selected.set(null);
  }

  saveStatus(): void {
    const order = this.selected();
    if (!order || this.isCustomer() || !this.supportsOrderStatusUpdate || this.savingStatus()) {
      return;
    }

    this.statusError.set(null);
    this.savingStatus.set(true);
    this.data.updateOrderStatus(order.id, this.statusDraft()).subscribe({
      next: (updated) => {
        this.orders.update((orders) => orders.map((item) => item.id === updated.id ? updated : item));
        this.selected.set(updated);
        this.savingStatus.set(false);
        this.toast.success('Order status updated successfully.');
      },
      error: () => {
        this.savingStatus.set(false);
        this.statusError.set('Could not update the order status. Please try again.');
        this.toast.error('Could not update the order status. Please try again.');
      },
    });
  }

  newOrder(): void {
    if (this.isCustomer()) {
      this.router.navigate(['/app', 'products']);
      return;
    }
    this.router.navigate(['/app', 'products'], { queryParams: { createOrder: '1' } });
  }
}
