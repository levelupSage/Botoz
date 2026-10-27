import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { DataService } from '../../core/data/data.service';
import { Customer, Order, OrderItem, OrderStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

interface HistoryRow {
  order: Order;
  assignedTo: string;
  station: string;
}

interface MonthGroup {
  label: string; // e.g. "October 2026"
  year: number;
  month: number; // 0-11
  rows: HistoryRow[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Order History (Admin / Super Admin). A read-only, month-grouped archive of
 * orders. A year+month selector jumps to a specific month; the page shows the
 * selected ("current") month and the one before it, plus a free-text search.
 */
@Component({
  selector: 'app-order-history',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-history.component.html',
  styleUrl: './order-history.component.scss',
})
export class OrderHistoryComponent implements OnInit {
  private readonly data = inject(DataService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly selected = signal<Order | null>(null);

  private readonly orders = signal<Order[]>([]);

  readonly months = MONTHS;

  // Selector state — defaults to the current real month.
  private readonly now = new Date();
  readonly selYear = signal<number>(this.now.getFullYear());
  readonly selMonth = signal<number>(this.now.getMonth());
  // The month actually being viewed (applied via the button).
  readonly viewYear = signal<number>(this.now.getFullYear());
  readonly viewMonth = signal<number>(this.now.getMonth());

  /** Years available in the selector (a small window around now). */
  readonly years = computed<number[]>(() => {
    const y = this.now.getFullYear();
    return [y + 1, y, y - 1, y - 2];
  });

  private parseOrderDate(order: Order): { year: number; month: number } | null {
    const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(order.date);
    if (!m) {
      return null;
    }
    const month = new Date(`${m[2]} 1, ${m[3]}`).getMonth();
    if (Number.isNaN(month)) {
      return null;
    }
    return { year: Number(m[3]), month };
  }

  private customerStation(customerId: number): string {
    const c: Customer | undefined = this.catalog.customerById(customerId);
    if (!c) {
      return '';
    }
    // Derive a simple "station" label from the address (town/area), matching
    // the prototype's "(Station: X)" convention.
    const parts = c.address.split(',').map((p) => p.trim());
    return parts[parts.length - 1] || '';
  }

  private toRow(order: Order): HistoryRow {
    return {
      order,
      assignedTo: order.createdBy === 'Customer' ? 'Order Entry' : order.createdBy,
      station: this.customerStation(order.customerId),
    };
  }

  private groupFor(year: number, month: number, label: string): MonthGroup {
    const term = this.search().trim().toLowerCase();
    const rows = this.orders()
      .filter((o) => {
        const d = this.parseOrderDate(o);
        return d && d.year === year && d.month === month;
      })
      .filter((o) => {
        if (!term) {
          return true;
        }
        const items = (o.items ?? []).map((i) => `${i.productName ?? ''} ${i.code ?? ''}`).join(' ');
        return `${o.id} ${o.customer} ${o.date} ${items}`.toLowerCase().includes(term);
      })
      .map((o) => this.toRow(o));
    return { label, year, month, rows };
  }

  readonly currentGroup = computed<MonthGroup>(() => {
    const y = this.viewYear();
    const m = this.viewMonth();
    return this.groupFor(y, m, `${MONTHS[m]} ${y}`);
  });

  readonly previousGroup = computed<MonthGroup>(() => {
    let y = this.viewYear();
    let m = this.viewMonth() - 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    return this.groupFor(y, m, `${MONTHS[m]} ${y}`);
  });

  ngOnInit(): void {
    this.catalog.load();
    this.data.getOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load order history.');
        this.loading.set(false);
      },
    });
  }

  applySelection(): void {
    this.viewYear.set(this.selYear());
    this.viewMonth.set(this.selMonth());
    this.toast.show(`Showing ${MONTHS[this.selMonth()]} ${this.selYear()}`);
  }

  onYear(value: string): void {
    this.selYear.set(Number(value));
  }

  onMonth(value: string): void {
    this.selMonth.set(Number(value));
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
}
