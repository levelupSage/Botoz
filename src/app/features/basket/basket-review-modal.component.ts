import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Customer, OrderItem } from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { BasketService } from '../../core/services/basket.service';
import { CatalogService } from '../../core/services/catalog.service';
import { OrderService } from '../../core/services/order.service';
import { ToastService } from '../../core/services/toast.service';

/** Prototype-style review and submission dialog for the active order draft. */
@Component({
  selector: 'app-basket-review-modal',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './basket-review-modal.component.html',
  styleUrl: './basket-review-modal.component.scss',
})
export class BasketReviewModalComponent {
  private readonly basket = inject(BasketService);
  private readonly appState = inject(AppStateService);
  private readonly catalog = inject(CatalogService);
  private readonly orders = inject(OrderService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly closed = output<void>();
  readonly addMore = output<void>();
  readonly items = this.basket.currentItems;
  readonly submitting = signal(false);
  readonly confirmedId = signal<string | null>(null);
  readonly isCustomer = computed(() => this.appState.role() === 'Customer');
  readonly customer = computed<Customer | null>(() => {
    const id = this.appState.activeCustomerId();
    return id ? this.catalog.customerById(id) ?? null : null;
  });

  constructor() {
    this.catalog.load();
    this.basket.loadCurrent().subscribe({ error: () => this.toast.error('Could not load the saved basket.') });
  }

  distribution(item: OrderItem): string {
    return item.rows.map((row) => `${row.size}: ${row.qty}`).join(' · ');
  }

  typeLabel(item: OrderItem): string {
    return item.mode === 'carton' ? `${item.cartons} carton(s) · ${item.packingName}` : 'Size-wise';
  }

  remove(index: number): void {
    if (!this.submitting()) this.basket.removeItem(index);
  }

  close(): void {
    if (this.submitting()) return;
    this.persistThen(() => this.closed.emit());
  }

  continueShopping(): void {
    if (this.submitting()) return;
    this.persistThen(() => this.addMore.emit());
  }

  confirm(): void {
    if (this.isCustomer() && !this.appState.customerCanOrder()) {
      this.toast.error('Ordering is disabled for this account. Contact your account manager.');
      return;
    }
    const customer = this.customer();
    const items = this.items();
    if (!customer || !items.length || this.submitting()) {
      if (!items.length) this.toast.show('Add products first');
      return;
    }

    this.submitting.set(true);
    this.orders.submit(customer, items).subscribe({
      next: (order) => {
        this.submitting.set(false);
        this.confirmedId.set(order.id);
        this.toast.success('Order submitted successfully.');
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const message = error instanceof Error ? error.message : 'Could not submit the order. Please try again.';
        this.toast.error(message);
      },
    });
  }

  done(): void {
    this.closed.emit();
    this.router.navigate(['/app', this.isCustomer() ? 'orders' : 'new-orders']);
  }

  private persistThen(next: () => void): void {
    this.submitting.set(true);
    this.basket.saveCurrent().subscribe({
      next: () => { this.submitting.set(false); next(); },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.toast.error(error instanceof Error ? error.message : 'Could not save the basket.');
      },
    });
  }
}
