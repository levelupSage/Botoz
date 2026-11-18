import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  Customer,
  OrderItem,
  OrderMode,
  Packing,
  Product,
  ProductSizeGroup,
} from '../../core/models';
import { AppStateService } from '../../core/services/app-state.service';
import { BasketService } from '../../core/services/basket.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';
import { money, priceFor } from '../../core/utils/pricing.util';

/**
 * Modal for adding a product to the basket, either size-wise (enter pairs per
 * size) or carton-wise (pick a packing template × number of cartons).
 */
@Component({
  selector: 'app-order-modal',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-modal.component.html',
  styleUrl: './order-modal.component.scss',
})
export class OrderModalComponent {
  private readonly basket = inject(BasketService);
  private readonly appState = inject(AppStateService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);

  readonly product = input.required<Product>();
  readonly added = output<void>();
  readonly cancelled = output<void>();

  readonly mode = signal<OrderMode>('size');

  /** Size -> pairs entered by the user (size-wise mode). */
  readonly sizeQty = signal<Record<number, number>>({});
  readonly selectedSizeGroupId = signal<number | 'all'>('all');
  readonly adminRatePerPair = signal(0);

  readonly selectedPackingId = signal<number | null>(null);
  readonly cartonCount = signal<number>(1);

  readonly packings = computed<Packing[]>(() =>
    (this.product().packings ?? []).filter((packing) =>
      packing.active !== false && packing.rows.some((row) => row.pairs > 0),
    ),
  );
  readonly sizes = computed(() => [...new Set([
    ...(this.product().sizes ?? []),
    ...(this.product().sizeGroups ?? [])
      .filter((group) => group.active)
      .flatMap((group) => group.sizes),
  ])].sort((a, b) => a - b));
  readonly sizeGroups = computed<ProductSizeGroup[]>(() =>
    (this.product().sizeGroups ?? []).filter((group) => group.active && group.sizes.length > 0),
  );
  readonly visibleSizes = computed(() => {
    const groupId = this.selectedSizeGroupId();
    if (groupId === 'all') return this.sizes();
    const group = this.sizeGroups().find((item) => item.id === groupId);
    return group ? [...new Set(group.sizes)].sort((a, b) => a - b) : this.sizes();
  });
  readonly canAdd = computed(() =>
    this.mode() === 'size' ? this.sizes().length > 0 : this.packings().length > 0,
  );
  readonly canSetAdminRate = computed(() =>
    ['Admin', 'Super Admin'].includes(this.appState.role()),
  );

  private readonly customer = computed<Customer | null>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.catalog.customerById(id) ?? null) : null;
  });

  readonly priceText = computed(() => money(priceFor(this.product(), this.customer())));

  readonly selectedPacking = computed<Packing | null>(() => {
    const id = this.selectedPackingId();
    const packs = this.packings();
    if (id == null) {
      return packs[0] ?? null;
    }
    return packs.find((k) => k.id === id) ?? packs[0] ?? null;
  });

  readonly cartonPreview = computed(() => {
    const pack = this.selectedPacking();
    if (!pack) {
      return '';
    }
    return pack.rows.map((r) => `Size ${r.size}: ${r.pairs}`).join(' · ');
  });

  readonly addLabel = computed(() =>
    this.appState.role() === 'Customer' ? 'Add to basket' : 'Add to order',
  );

  /** Exposed for the template. */
  readonly money = money;

  constructor() {
    // Seed the size->qty map with 0 for every size of the chosen product so
    // the inputs render "0" and the record is always fully populated.
    effect(() => {
      const product = this.product();
      if (!product) {
        return;
      }
      this.selectedSizeGroupId.set('all');
      const seeded: Record<number, number> = {};
      for (const s of this.sizes()) {
        seeded[s] = 0;
      }
      this.sizeQty.set(seeded);
    });
  }

  setMode(mode: OrderMode): void {
    this.mode.set(mode);
  }

  setSizeGroup(groupId: number | 'all'): void {
    this.selectedSizeGroupId.set(groupId);
  }

  updateSize(size: number, value: string): void {
    const qty = Number(value);
    this.sizeQty.update((map) => ({ ...map, [size]: Number.isFinite(qty) ? qty : 0 }));
  }

  onPackingChange(value: string): void {
    this.selectedPackingId.set(Number(value));
  }

  onCartonChange(value: string): void {
    const n = Number(value);
    this.cartonCount.set(Number.isFinite(n) ? n : 1);
  }

  onAdminRateChange(value: string): void {
    const rate = Number(value);
    this.adminRatePerPair.set(Number.isFinite(rate) && rate >= 0 ? rate : 0);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  add(): void {
    const product = this.product();
    const price = priceFor(product, this.customer());
    const adminRatePerPair = this.canSetAdminRate() ? this.adminRatePerPair() : 0;

    if (this.mode() === 'size') {
      const rows = this.visibleSizes()
        .map((size) => ({ size, qty: this.sizeQty()[size] ?? 0 }))
        .filter((r) => r.qty > 0);

      if (!rows.length || rows.some((r) => !Number.isInteger(r.qty) || r.qty < 0)) {
        this.toast.show('Enter whole pair quantities for at least one size');
        return;
      }

      const item: OrderItem = {
        productId: product.id,
        productName: product.name,
        code: product.code,
        brand: product.brand,
        mode: 'size',
        rows,
        total: rows.reduce((sum, r) => sum + r.qty, 0),
        priceSnapshot: price,
        adminRatePerPair,
      };
      this.basket.addItem(item);
      this.added.emit();
      return;
    }

    // Carton mode
    const pack = this.selectedPacking();
    const n = this.cartonCount();
    if (!pack || !Number.isInteger(n) || n < 1) {
      this.toast.show('Choose a packing template and a valid carton count');
      return;
    }
    const rows = pack.rows.map((r) => ({ size: r.size, qty: r.pairs * n }));
    const item: OrderItem = {
      productId: product.id,
      productName: product.name,
      code: product.code,
      brand: product.brand,
      mode: 'carton',
      packingName: pack.name,
      cartons: n,
      packingGroupId: pack.id,
      rows,
      total: rows.reduce((sum, r) => sum + r.qty, 0),
      priceSnapshot: price,
      adminRatePerPair,
    };
    this.basket.addItem(item);
    this.added.emit();
  }
}
