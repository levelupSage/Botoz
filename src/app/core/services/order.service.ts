import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';
import { DataService } from '../data/data.service';
import { Customer, Order, OrderItem } from '../models';
import { AppStateService } from './app-state.service';
import { AuthService } from './auth.service';
import { BasketService } from './basket.service';

/**
 * Turns a customer's basket into a confirmed order and clears the basket.
 * Delegates persistence to the swappable {@link DataService}.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly data = inject(DataService);
  private readonly basket = inject(BasketService);
  private readonly appState = inject(AppStateService);
  private readonly auth = inject(AuthService);

  /**
   * Submit the current basket for the given customer as a confirmed order.
   * Returns the created order. Clears the basket on success.
   */
  submit(customer: Customer, items: OrderItem[]): Observable<Order> {
    const snapshot: OrderItem[] = JSON.parse(JSON.stringify(items));
    const createdBy = this.auth.user()?.role ?? 'Customer';

    return this.data.nextOrderId().pipe(
      switchMap((id) => {
        const order: Order = {
          id,
          customerId: customer.id,
          customer: customer.name,
          date: new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          status: 'Confirmed',
          createdBy,
          items: snapshot,
        };
        return this.data.createOrder(order);
      }),
      map((order) => {
        this.basket.clear(customer.id);
        if (this.appState.isStaff()) {
          this.appState.clearStaffOrderCustomer();
        }
        return order;
      }),
    );
  }
}
