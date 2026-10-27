import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from '../../core/data/data.service';
import { Customer, Order } from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';

/** Read-only account page for the signed-in customer: profile + recent orders. */
@Component({
  selector: 'app-account',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly appState = inject(AppStateService);
  private readonly auth = inject(AuthService);
  private readonly data = inject(DataService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly recentOrders = signal<Order[]>([]);

  readonly customer = computed<Customer | null>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.catalog.customerById(id) ?? null) : null;
  });

  ngOnInit(): void {
    this.catalog.load();
    const myId = this.auth.user()?.customerId;
    this.data.getOrders().subscribe((orders) => {
      this.recentOrders.set(orders.filter((o) => o.customerId === myId).slice(0, 5));
    });
  }

  viewOrders(): void {
    this.router.navigate(['/app', 'orders']);
  }
}
