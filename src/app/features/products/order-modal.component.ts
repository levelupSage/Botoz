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
import { Customer, OrderItem, OrderMode, Packing, Product } from '../../core/models';
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

  readonly selectedPackingId = signal<number | null>(null);
  readonly cartonCount = signal<number>(1);

  readonly packings = computed<Packing[]>(() =>
    (this.product().packings ?? []).filter((k) => k.active !== false),
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
      const seeded: Record<number, number> = {};
      for (const s of product.sizes ?? []) {
        seeded[s] = 0;
      }
      this.sizeQty.set(seeded);
    });
  }

  setMode(mode: OrderMode): void {
    this.mode.set(mode);
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

  cancel(): void {
    this.cancelled.emit();
  }

  add(): void {
    const product = this.product();
    const price = priceFor(product, this.customer());

    if (this.mode() === 'size') {
      const rows = product.sizes
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
      rows,
      total: rows.reduce((sum, r) => sum + r.qty, 0),
      priceSnapshot: price,
    };
    this.basket.addItem(item);
    this.added.emit();
  }
}
