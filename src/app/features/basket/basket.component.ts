import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Customer, OrderItem } from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { BasketService } from '../../core/services/basket.service';
import { CatalogService } from '../../core/services/catalog.service';
import { OrderService } from '../../core/services/order.service';
import { ToastService } from '../../core/services/toast.service';

/**
 * Basket / order draft review. Customer sees "Your basket"; staff see
 * "Order draft". Confirming submits the order immediately. No monetary totals
 * are shown, matching the prototype's rule.
 */
@Component({
  selector: 'app-basket',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './basket.component.html',
  styleUrl: './basket.component.scss',
})
export class BasketComponent {
  private readonly basket = inject(BasketService);
  private readonly appState = inject(AppStateService);
  private readonly catalog = inject(CatalogService);
  private readonly orders = inject(OrderService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly items = this.basket.currentItems;
  readonly submitting = signal(false);
  readonly confirmedId = signal<string | null>(null);

  readonly isCustomer = computed(() => this.appState.role() === 'Customer');
  readonly heading = computed(() => (this.isCustomer() ? 'Your basket' : 'Order draft'));

  readonly activeCustomer = computed<Customer | null>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.catalog.customerById(id) ?? null) : null;
  });

  constructor() {
    this.catalog.load();
  }

  distribution(item: OrderItem): string {
    return item.rows.map((r) => `${r.size}: ${r.qty}`).join(' · ');
  }

  typeLabel(item: OrderItem): string {
    return item.mode === 'carton'
      ? `${item.cartons} carton(s) · ${item.packingName}`
      : 'Size-wise';
  }

  remove(index: number): void {
    this.basket.removeItem(index);
  }

  browse(): void {
    this.router.navigate(['/app', 'products']);
  }

  confirm(): void {
    const customer = this.activeCustomer();
    const items = this.items();
    if (!customer || !items.length) {
      this.toast.show('Add products first');
      return;
    }

    this.submitting.set(true);
    this.orders.submit(customer, items).subscribe({
      next: (order) => {
        this.submitting.set(false);
        this.confirmedId.set(order.id);
        this.toast.show('Order submitted');
      },
      error: () => {
        this.submitting.set(false);
        this.toast.show('Could not submit the order. Please try again.');
      },
    });
  }

  done(): void {
    this.confirmedId.set(null);
    this.router.navigate(['/app', 'orders']);
  }
}
