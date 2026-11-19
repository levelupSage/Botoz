import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Customer, PriceTier, Station } from '../../core/models';
import { DataService } from '../../core/data/data.service';
import { AppStateService } from '../../core/services/app-state.service';
import { BrandService } from '../../core/services/brand.service';
import { BasketService } from '../../core/services/basket.service';
import { CatalogService } from '../../core/services/catalog.service';
import { CustomerOrderRightsService } from '../../core/services/customer-order-rights.service';
import { ToastService } from '../../core/services/toast.service';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const phoneNumberValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return { phoneFormat: true };
  if (value.length !== 10) return { phoneLength: true };
  return /^[6-9]/.test(value) ? null : { phoneStart: true };
};

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
  private readonly brandService = inject(BrandService);
  private readonly orderRightsService = inject(CustomerOrderRightsService);
  private readonly data = inject(DataService);
  private readonly appState = inject(AppStateService);
  private readonly basket = inject(BasketService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  @ViewChild('businessNameInput') private businessNameInput?: ElementRef<HTMLInputElement>;

  readonly loading = this.catalog.customersLoading;
  readonly error = this.catalog.customersError;
  readonly customers = this.catalog.customers;
  readonly products = this.catalog.products;
  readonly brands = this.brandService.brands;
  readonly brandsLoading = this.brandService.loading;
  readonly brandsError = this.brandService.error;

  readonly search = signal('');
  readonly categoryFilter = signal<'All' | PriceTier>('All');
  readonly statusFilter = signal<'All' | 'Active' | 'Inactive'>('All');
  readonly editing = signal<Customer | null>(null);
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly customerSaveError = signal('');
  readonly orderRights = signal(true);
  readonly loadingDetails = signal(false);
  readonly updatingStatusId = signal<number | null>(null);
  readonly deletingCustomerId = signal<number | null>(null);
  readonly stationAddOpen = signal(false);
  readonly stationDraft = signal('');
  readonly stationDraftError = signal('');
  readonly stationSaving = signal(false);
  private scrollToOverrides = false;
  readonly supportsProductPriceOverrides = this.data.supportsProductPriceOverrides;
  readonly canDeleteCustomers = computed(() => this.appState.role() === 'Super Admin');
  readonly customerCanOrder = this.appState.customerCanOrder;

  readonly tiers: PriceTier[] = ['A', 'B', 'C'];
  readonly weekdays = WEEKDAYS;

  /** Known stations derived from existing customers, plus any added inline. */
  readonly stations = signal<string[]>([]);
  private readonly stationIds = signal<Record<string, number>>({});

  /** Auto-generated Customer ID shown (read-only) when adding. */
  readonly generatedId = signal<string>('');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
    loginId: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(80)]],
    loginPassword: [
      '',
      [
        Validators.required,
        Validators.pattern(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,72}$/),
      ],
    ],
    station: ['', [Validators.required]],
    category: ['A' as PriceTier, [Validators.required]],
    whatsapp: ['', [Validators.required, Validators.maxLength(10), phoneNumberValidator]],
    phone: ['', [Validators.maxLength(10), phoneNumberValidator]],
    email: ['', [Validators.email]],
    contact: [''],
    address: [''],
    reminderDay: ['Tuesday'],
    active: [true],
  });
  private readonly chooseInitialDiscountBrand = effect(() => {
    const brands = this.brands();
    if (!this.selectedDiscountBrand() && brands.length) {
      this.selectedDiscountBrand.set(brands[0].name);
    }
  });

  /** Per-product override working copy (productId -> price|null). */
  readonly overrides = signal<Record<number, number | null>>({});
  /** Per-brand discount working copy (brand -> percent|null). */
  readonly discounts = signal<Record<string, number | null>>({});
  readonly selectedDiscountBrand = signal('');
  readonly discountDraft = signal('');
  readonly discountRows = computed(() => Object.entries(this.discounts())
    .filter((entry): entry is [string, number] => entry[1] != null)
    .map(([brand, percent]) => ({ brand, percent })));

  readonly filtered = computed<Customer[]>(() => {
    const term = this.search().trim().toLowerCase();
    const cat = this.categoryFilter();
    const status = this.statusFilter();
    return this.customers().filter((c) => {
      if (cat !== 'All' && c.category !== cat) {
        return false;
      }
      if ((status === 'Active' && !c.active) || (status === 'Inactive' && c.active)) return false;
      return `${c.name} ${c.code} ${c.phone} ${c.email} ${c.loginId ?? ''}`
        .toLowerCase()
        .includes(term);
    });
  });
  readonly activeCount = computed(() => this.customers().filter((customer) => customer.active).length);
  readonly inactiveCount = computed(() => this.customers().filter((customer) => !customer.active).length);

  ngOnInit(): void {
    this.catalog.loadCustomers();
    this.brandService.load();
    this.refreshStations();
    this.data.getStations().subscribe({
      next: (stations) => this.mergeStations(stations),
      error: () => this.toast.error('Could not load stations. You can still use stations already assigned to customers.'),
    });
  }

  private mergeStations(stations: Station[]): void {
    const ids = { ...this.stationIds() };
    const names = new Map(this.stations().map((name) => [name.toLowerCase(), name]));
    for (const station of stations) {
      if (!station.name.trim()) continue;
      const key = station.name.trim().toLowerCase();
      names.set(key, station.name.trim());
      if (station.id > 0) ids[key] = station.id;
    }
    this.stationIds.set(ids);
    this.stations.set([...names.values()].sort((a, b) => a.localeCompare(b)));
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
    this.mergeStations([...set].map((name) => ({ id: this.stationIds()[name.toLowerCase()] ?? 0, name })));
  }

  retryCatalog(): void {
    this.catalog.loadCustomers(true);
  }

  private nextCustomerId(): string {
    const maxId = this.customers().reduce((m, c) => Math.max(m, c.id), 0);
    return 'CUS-' + String(maxId + 1).padStart(4, '0');
  }

  priceRule(c: Customer): string {
    return Object.keys(c.overrides ?? {}).length ? 'Category price + override' : 'Category price';
  }

  openNew(): void {
    if (this.loadingDetails() || this.saving()) return;
    this.refreshStations();
    this.editing.set(null);
    this.orderRights.set(true);
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
    this.selectedDiscountBrand.set(this.brands()[0]?.name ?? '');
    this.discountDraft.set('');
    this.stationAddOpen.set(false);
    this.stationDraft.set('');
    this.scrollToOverrides = false;
    this.modalOpen.set(true);
    this.focusBusinessName();
  }

  openEdit(customer: Customer): void {
    if (this.loadingDetails() || this.saving()) return;
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
    this.orderRights.set(this.orderRightsService.canOrder(customer.id));
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
    this.selectedDiscountBrand.set(this.brands().find((brand) => !(brand.name in disc))?.name ?? this.brands()[0]?.name ?? '');
    this.discountDraft.set('');
    this.stationAddOpen.set(false);
    this.stationDraft.set('');
    this.modalOpen.set(true);
    this.focusBusinessName();
    if (this.scrollToOverrides) {
      this.scrollToOverrides = false;
      requestAnimationFrame(() =>
        document.getElementById('customer-price-overrides')?.scrollIntoView({ behavior: 'smooth' }),
      );
    }
  }

  close(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
  }

  private focusBusinessName(): void {
    requestAnimationFrame(() => this.businessNameInput?.nativeElement.focus());
  }

  addStation(): void {
    this.stationDraft.set('');
    this.stationDraftError.set('');
    this.stationAddOpen.set(true);
  }

  updateStationDraft(value: string): void {
    this.stationDraft.set(value);
    this.stationDraftError.set(this.stationNameError(value));
  }

  private stationNameError(value: string): string {
    const name = value.trim();
    if (!name) return 'Station name is required.';
    if (name.length > 100) return 'Station name must be 100 characters or fewer.';
    if (/[\u0000-\u001f\u007f]/.test(name)) return 'Station name contains invalid characters.';
    return '';
  }

  saveStation(): void {
    const name = this.stationDraft().trim();
    const validationError = this.stationNameError(name);
    this.stationDraftError.set(validationError);
    if (validationError || this.stationSaving()) return;
    const existing = this.stations().find((station) => station.toLowerCase() === name.toLowerCase());
    if (existing) {
      this.selectStation(existing);
      this.toast.info('That station already exists; it has been selected.');
      return;
    }
    this.stationSaving.set(true);
    this.data.createStation(name).subscribe({
      next: (station) => {
        this.stationSaving.set(false);
        this.mergeStations([station]);
        this.selectStation(station.name);
        this.toast.success('Station added successfully.');
      },
      error: (err: unknown) => {
        this.stationSaving.set(false);
        this.toast.error(err instanceof Error ? err.message : 'Could not add station.');
      },
    });
  }

  private selectStation(name: string): void {
    this.form.controls.station.setValue(name);
    this.form.controls.station.markAsTouched();
    this.stationAddOpen.set(false);
    this.stationDraft.set('');
    this.stationDraftError.set('');
  }

  cancelStationCreation(): void {
    this.stationAddOpen.set(false);
    this.stationDraft.set('');
    this.stationDraftError.set('');
  }

  retryBrands(): void {
    this.brandService.load(true);
  }

  toggleOrderRights(): void {
    this.orderRights.update((enabled) => !enabled);
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

  selectDiscountBrand(brand: string): void {
    this.selectedDiscountBrand.set(brand);
    const currentDiscount = this.discounts()[brand];
    this.discountDraft.set(currentDiscount == null ? '' : String(currentDiscount));
  }

  hasBrandDiscount(brand: string): boolean {
    return this.discounts()[brand] != null;
  }

  applyBrandDiscount(): void {
    const brand = this.selectedDiscountBrand();
    const value = Number(this.discountDraft());
    if (!brand || !this.discountDraft().trim() || !Number.isFinite(value) || value < 0.1 || value > 100) {
      this.toast.error('Choose a brand and enter a discount from 0.1% to 100%.');
      return;
    }
    this.discounts.update((current) => ({ ...current, [brand]: value }));
    this.selectedDiscountBrand.set(brand);
    this.discountDraft.set(String(value));
  }

  removeBrandDiscount(brand: string): void {
    this.discounts.update((current) => {
      const updated = { ...current };
      delete updated[brand];
      return updated;
    });
    if (this.selectedDiscountBrand() === brand) this.discountDraft.set('');
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.customerSaveError.set('');
    const raw = this.form.getRawValue();
    const loginId = raw.loginId.trim();
    const existing = this.editing();
    const duplicateLogin = this.customers().some((customer) =>
      customer.id !== existing?.id &&
      (customer.loginId ?? customer.code).trim().toLowerCase() === loginId.toLowerCase(),
    );
    if (duplicateLogin) {
      this.form.controls.loginId.setErrors({ ...this.form.controls.loginId.errors, duplicate: true });
      this.form.controls.loginId.markAsTouched();
      return;
    }

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

    const customer: Customer = {
      id: existing?.id ?? 0,
      name: raw.name.trim(),
      code: loginId,
      customerId: this.generatedId(),
      loginId,
      loginPassword: raw.loginPassword,
      station: raw.station,
      stationId: this.stationIds()[raw.station.toLowerCase()] ?? (existing?.station === raw.station ? existing.stationId : undefined),
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
      next: (saved) => {
        this.saving.set(false);
        this.orderRightsService.set(saved.id, this.orderRights());
        this.modalOpen.set(false);
        this.refreshStations();
        this.toast.success(existing ? 'Customer updated successfully.' : 'Customer added successfully.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const message = err instanceof Error ? err.message : 'Could not save the customer.';
        const userMessage = /conflict|already exists|duplicate/i.test(message)
          ? 'Login ID, email, or customer details already exist. Use a unique Login ID/email and check the customer details.'
          : message;
        this.customerSaveError.set(userMessage);
        this.toast.error(userMessage);
      },
    });
  }

  startOrder(customer: Customer): void {
    this.appState.setStaffOrderCustomer(customer.id);
    this.router.navigate(['/app', 'products']);
  }

  setCustomerStatus(customer: Customer, active: boolean): void {
    if (this.updatingStatusId() !== null) return;
    this.updatingStatusId.set(customer.id);
    this.catalog.setCustomerActive(customer, active).subscribe({
      next: () => {
        this.updatingStatusId.set(null);
        this.toast.success(active ? 'Customer activated.' : 'Customer deactivated.');
      },
      error: (error: unknown) => {
        this.updatingStatusId.set(null);
        this.toast.error(error instanceof Error ? error.message : 'Could not update customer status.');
      },
    });
  }

  deleteCustomer(customer: Customer): void {
    if (this.appState.role() !== 'Super Admin') {
      this.toast.error('Only Super Admin can permanently delete customers.');
      return;
    }
    if (this.customers().length <= 1) {
      this.toast.error('Keep at least one customer account.');
      return;
    }
    if (this.basket.snapshotByCustomer()[customer.id]?.length) {
      this.toast.error('Cannot delete: customer has an active basket. Deactivate it instead.');
      return;
    }
    if (!window.confirm(`Permanently delete ${customer.name} (${customer.code})? This cannot be undone.`)) {
      return;
    }

    this.deletingCustomerId.set(customer.id);
    this.data.getOrders().subscribe({
      next: (orders) => {
        if (orders.some((order) => order.customerId === customer.id)) {
          this.deletingCustomerId.set(null);
          this.toast.error('Cannot delete: customer has order history. Deactivate it instead.');
          return;
        }
        this.catalog.deleteCustomer(customer.id).subscribe({
          next: () => {
            this.deletingCustomerId.set(null);
            this.orderRightsService.remove(customer.id);
            this.refreshStations();
            this.toast.success('Customer deleted.');
          },
          error: (error: unknown) => {
            this.deletingCustomerId.set(null);
            this.toast.error(error instanceof Error ? error.message : 'Could not delete customer.');
          },
        });
      },
      error: () => {
        this.deletingCustomerId.set(null);
        this.toast.error('Could not verify customer order history; customer was not deleted.');
      },
    });
  }

  openPriceOverrides(customer: Customer): void {
    if (!this.supportsProductPriceOverrides) {
      this.toast.error('Per-product price overrides are not supported by the connected API yet.');
      return;
    }
    this.scrollToOverrides = true;
    this.openEdit(customer);
  }
}
