import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Customer, PriceTier } from '../../core/models';
import { DataService } from '../../core/data/data.service';
import { AppStateService } from '../../core/services/app-state.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';
import { environment } from '../../../environments/environment';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Customers management: list/search, add/edit account (full profile matching
 * the prototype: Login ID, 4-digit password, station, price category, WhatsApp,
 * contact, shipping, reminder day, brand discounts, per-product overrides) and
 * "Create order" which sets the staff ordering context.
 */
@Component({
  selector: 'app-customers',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.scss',
})
export class CustomersComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly data = inject(DataService);
  private readonly appState = inject(AppStateService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;
  readonly customers = this.catalog.customers;
  readonly products = this.catalog.products;
  readonly brands = this.catalog.brands;

  readonly search = signal('');
  readonly categoryFilter = signal<'All' | PriceTier>('All');
  readonly editing = signal<Customer | null>(null);
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly loadingDetails = signal(false);
  readonly supportsProductPriceOverrides = this.data.supportsProductPriceOverrides;
  readonly mockMode = environment.useMockApi;

  readonly tiers: PriceTier[] = ['A', 'B', 'C'];
  readonly weekdays = WEEKDAYS;

  /** Known stations derived from existing customers, plus any added inline. */
  readonly stations = signal<string[]>([]);

  /** Auto-generated Customer ID shown (read-only) when adding. */
  readonly generatedId = signal<string>('');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    loginId: ['', [Validators.required]],
    loginPassword: [
      '',
      [
        Validators.required,
        Validators.pattern(environment.useMockApi
          ? /^\d{4}$/
          : /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,72}$/),
      ],
    ],
    station: ['', [Validators.required]],
    category: ['A' as PriceTier, [Validators.required]],
    whatsapp: ['', [Validators.required]],
    phone: [''],
    email: ['', [Validators.email]],
    contact: [''],
    address: [''],
    reminderDay: ['Tuesday'],
    active: [true],
  });

  /** Per-product override working copy (productId -> price|null). */
  readonly overrides = signal<Record<number, number | null>>({});
  /** Per-brand discount working copy (brand -> percent|null). */
  readonly discounts = signal<Record<string, number | null>>({});

  readonly filtered = computed<Customer[]>(() => {
    const term = this.search().trim().toLowerCase();
    const cat = this.categoryFilter();
    return this.customers().filter((c) => {
      if (cat !== 'All' && c.category !== cat) {
        return false;
      }
      return `${c.name} ${c.code} ${c.phone} ${c.email} ${c.loginId ?? ''}`
        .toLowerCase()
        .includes(term);
    });
  });

  ngOnInit(): void {
    this.catalog.load();
    this.refreshStations();
  }

  private refreshStations(): void {
    const set = new Set<string>();
    for (const c of this.customers()) {
      const s = (c.station ?? '').trim();
      if (s) {
        set.add(s);
      }
      // Fall back to the last address segment so there are sensible defaults.
      const area = c.address.split(',').map((p) => p.trim()).pop();
      if (area) {
        set.add(area);
      }
    }
    this.stations.set([...set].sort());
  }

  private nextCustomerId(): string {
    const maxId = this.customers().reduce((m, c) => Math.max(m, c.id), 0);
    return 'CUS-' + String(maxId + 1).padStart(4, '0');
  }

  priceRule(c: Customer): string {
    return Object.keys(c.overrides ?? {}).length ? 'Category price + override' : 'Category price';
  }

  categoryPillClass(cat: PriceTier): string {
    return cat === 'A' ? 'gold' : cat === 'C' ? 'gray' : 'blue';
  }

  openNew(): void {
    this.refreshStations();
    this.editing.set(null);
    this.generatedId.set(this.nextCustomerId());
    this.form.reset({
      name: '',
      loginId: '',
      loginPassword: '',
      station: this.stations()[0] ?? '',
      category: 'A',
      whatsapp: '',
      phone: '',
      email: '',
      contact: '',
      address: '',
      reminderDay: 'Tuesday',
      active: true,
    });
    this.overrides.set({});
    this.discounts.set({});
    this.modalOpen.set(true);
  }

  openEdit(customer: Customer): void {
    this.refreshStations();
    this.loadingDetails.set(true);
    this.data.getCustomer(customer.id).subscribe({
      next: (details) => {
        this.loadingDetails.set(false);
        this.populateEdit(details);
      },
      error: () => {
        this.loadingDetails.set(false);
        this.toast.error('Could not load customer details.');
      },
    });
  }

  private populateEdit(customer: Customer): void {
    this.editing.set(customer);
    this.generatedId.set(customer.customerId ?? 'CUS-' + String(customer.id).padStart(4, '0'));
    this.form.setValue({
      name: customer.name,
      loginId: customer.loginId ?? customer.code,
      loginPassword: customer.loginPassword ?? '',
      station: customer.station ?? (customer.address.split(',').map((p) => p.trim()).pop() ?? ''),
      category: customer.category,
      whatsapp: customer.whatsapp ?? customer.phone,
      phone: customer.phone,
      email: customer.email,
      contact: customer.contact ?? '',
      address: customer.address,
      reminderDay: customer.reminderDay ?? 'Tuesday',
      active: customer.active,
    });
    const ov: Record<number, number | null> = {};
    for (const [pid, price] of Object.entries(customer.overrides ?? {})) {
      ov[Number(pid)] = price;
    }
    this.overrides.set(ov);
    const disc: Record<string, number | null> = {};
    for (const [brand, pct] of Object.entries(customer.brandDiscounts ?? {})) {
      disc[brand] = pct;
    }
    this.discounts.set(disc);
    this.modalOpen.set(true);
  }

  close(): void {
    this.modalOpen.set(false);
  }

  addStation(): void {
    const name = window.prompt('New station name');
    if (name && name.trim()) {
      const s = name.trim();
      this.stations.update((list) => (list.includes(s) ? list : [...list, s].sort()));
      this.form.controls.station.setValue(s);
    }
  }

  fillPhoneFromWhatsapp(): void {
    const w = this.form.controls.whatsapp.value.trim();
    if (w && !this.form.controls.phone.value.trim()) {
      this.form.controls.phone.setValue(w);
    }
  }

  overrideValue(productId: number): number | null {
    return this.overrides()[productId] ?? null;
  }

  setOverride(productId: number, value: string): void {
    const n = value.trim() === '' ? null : Number(value);
    this.overrides.update((m) => ({ ...m, [productId]: Number.isFinite(n as number) ? n : null }));
  }

  discountValue(brand: string): number | null {
    return this.discounts()[brand] ?? null;
  }

  setDiscount(brand: string, value: string): void {
    const n = value.trim() === '' ? null : Number(value);
    this.discounts.update((m) => ({ ...m, [brand]: Number.isFinite(n as number) ? n : null }));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();

    const cleanOverrides: Record<number, number> = {};
    for (const [pid, price] of Object.entries(this.overrides())) {
      if (price != null && price > 0) {
        cleanOverrides[Number(pid)] = price;
      }
    }
    const cleanDiscounts: Record<string, number> = {};
    for (const [brand, pct] of Object.entries(this.discounts())) {
      if (pct != null && pct > 0) {
        cleanDiscounts[brand] = pct;
      }
    }

    const existing = this.editing();
    const customer: Customer = {
      id: existing?.id ?? 0,
      name: raw.name.trim(),
      code: raw.loginId.trim(),
      customerId: this.generatedId(),
      loginId: raw.loginId.trim(),
      loginPassword: raw.loginPassword,
      station: raw.station,
      stationId: existing?.stationId,
      phone: raw.phone.trim() || raw.whatsapp.trim(),
      whatsapp: raw.whatsapp.trim(),
      email: raw.email.trim(),
      category: raw.category,
      contact: raw.contact.trim(),
      address: raw.address.trim(),
      reminderDay: raw.reminderDay,
      active: raw.active,
      overrides: cleanOverrides,
      brandDiscounts: cleanDiscounts,
    };

    this.saving.set(true);
    this.catalog.saveCustomer(customer).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.refreshStations();
        this.toast.success(existing ? 'Customer updated successfully.' : 'Customer added successfully.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(err instanceof Error ? err.message : 'Could not save the customer.');
      },
    });
  }

  startOrder(customer: Customer): void {
    this.appState.setStaffOrderCustomer(customer.id);
    this.router.navigate(['/app', 'products']);
  }
}
