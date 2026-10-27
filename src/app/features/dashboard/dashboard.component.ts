import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { DataService } from '../../core/data/data.service';
import { Order, Staff } from '../../core/models';

interface StatCard {
  label: string;
  value: number;
  foot: string;
  icon: string;
}

/**
 * Dashboard: daily order & dispatch summary. Proves the full data pipeline
 * (DataService -> component signals -> template) end to end.
 */
@Component({
  selector: 'app-dashboard',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly data = inject(DataService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly orders = signal<Order[]>([]);
  private readonly staff = signal<Staff[]>([]);

  readonly stats = computed<StatCard[]>(() => {
    const orders = this.orders();
    const todayKey = this.dayKey(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = this.dayKey(yesterday);

    const todayCount = orders.filter((o) => this.orderDayKey(o) === todayKey).length;
    const yesterdayCount = orders.filter((o) => this.orderDayKey(o) === yKey).length;
    const pendingCount = orders.filter(
      (o) => o.status === 'Pending' || o.status === 'Confirmed',
    ).length;
    const dispatchedCount = orders.filter((o) => o.status === 'Dispatched').length;
    const backendUsers = this.staff().filter(
      (s) => s.role === 'Backend User' && s.active,
    ).length;

    return [
      { label: 'Today orders', value: todayCount, foot: 'Orders placed today', icon: '≡' },
      {
        label: 'Yesterday orders',
        value: yesterdayCount,
        foot: 'Orders placed yesterday',
        icon: '◷',
      },
      {
        label: 'Open orders',
        value: pendingCount,
        foot: 'Awaiting fulfilment',
        icon: '…',
      },
      {
        label: 'Dispatched',
        value: dispatchedCount,
        foot: 'Orders dispatched',
        icon: '✓',
      },
      {
        label: 'Active backend users',
        value: backendUsers,
        foot: 'Currently active',
        icon: '♧',
      },
    ];
  });

  constructor() {
    forkJoin({
      orders: this.data.getOrders(),
      staff: this.data.getStaff(),
    }).subscribe({
      next: ({ orders, staff }) => {
        this.orders.set(orders);
        this.staff.set(staff);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load dashboard data.');
        this.loading.set(false);
      },
    });
  }

  private dayKey(d: Date): string {
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }

  /** Parse the prototype's "11 Oct 2026" date format into a day key. */
  private orderDayKey(order: Order): string {
    const match = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(order.date);
    if (!match) {
      return '';
    }
    const month = new Date(`${match[2]} 1, ${match[3]}`).getMonth();
    if (Number.isNaN(month)) {
      return '';
    }
    return this.dayKey(new Date(Number(match[3]), month, Number(match[1])));
  }
}
