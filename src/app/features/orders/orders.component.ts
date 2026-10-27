import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from '../../core/data/data.service';
import { Customer, Order, OrderItem, OrderStatus } from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { AuthService } from '../../core/services/auth.service';
import { BasketService } from '../../core/services/basket.service';
import { CatalogService } from '../../core/services/catalog.service';

interface LiveBasket {
  customer: Customer;
  items: OrderItem[];
}

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

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly selected = signal<Order | null>(null);

  private readonly orders = signal<Order[]>([]);

  readonly isCustomer = computed(() => this.appState.role() === 'Customer');

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
      if (!term) {
        return true;
      }
      const items = (o.items ?? [])
        .map((i) => `${i.productName ?? ''} ${i.code ?? ''}`)
        .join(' ');
      return `${o.id} ${o.customer} ${o.date} ${items}`.toLowerCase().includes(term);
    });
  });

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
  }

  statusClass(status: OrderStatus): string {
    switch (status) {
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
  }

  close(): void {
    this.selected.set(null);
  }

  newOrder(): void {
    this.router.navigate(['/app', this.isCustomer() ? 'products' : 'customers']);
  }
}
