import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Packing, PackingRow, Product } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

interface EditableRow {
  size: number;
  pairs: number;
}

/**
 * Packaging: define carton templates for a product. Each template is a set of
 * size -> pairs rows; customers can then order whole cartons of that mix.
 */
@Component({
  selector: 'app-packaging',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './packaging.component.html',
  styleUrl: './packaging.component.scss',
})
export class PackagingComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;
  readonly products = this.catalog.products;

  readonly selectedProductId = signal<number | null>(null);
  readonly saving = signal(false);

  // ---- New-template draft --------------------------------------------
  readonly draftName = signal('');
  readonly draftRows = signal<EditableRow[]>([]);

  readonly selectedProduct = computed<Product | null>(() => {
    const id = this.selectedProductId();
    return id ? (this.catalog.productById(id) ?? null) : null;
  });

  readonly existingPackings = computed<Packing[]>(() => this.selectedProduct()?.packings ?? []);

  readonly draftTotal = computed(() =>
    this.draftRows().reduce((sum, r) => sum + (Number(r.pairs) || 0), 0),
  );

  ngOnInit(): void {
    this.catalog.load();
  }

  selectProduct(value: string): void {
    const id = Number(value);
    this.selectedProductId.set(id > 0 ? id : null);
    const product = this.catalog.productById(id);
    // Seed the draft rows from the product's sizes, 0 pairs each.
    this.draftRows.set((product?.sizes ?? []).map((size) => ({ size, pairs: 0 })));
    this.draftName.set('');
  }

  packingTotal(packing: Packing): number {
    return packing.rows.reduce((sum, r) => sum + r.pairs, 0);
  }

  rowsText(packing: Packing): string {
    return packing.rows.map((r) => `Size ${r.size}: ${r.pairs}`).join(' · ');
  }

  setDraftPairs(size: number, value: string): void {
    const pairs = Number(value);
    this.draftRows.update((rows) =>
      rows.map((r) => (r.size === size ? { ...r, pairs: Number.isFinite(pairs) ? pairs : 0 } : r)),
    );
  }

  saveTemplate(): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }
    const name = this.draftName().trim();
    const rows: PackingRow[] = this.draftRows()
      .filter((r) => r.pairs > 0 && Number.isInteger(r.pairs))
      .map((r) => ({ size: r.size, pairs: r.pairs }));

    if (!name) {
      this.toast.show('Give the packing template a name.');
      return;
    }
    if (!rows.length) {
      this.toast.show('Add pairs to at least one size.');
      return;
    }

    const nextId =
      (product.packings ?? []).reduce((max, k) => Math.max(max, k.id), 0) + 1 || Date.now();
    const packing: Packing = { id: nextId, name, rows, active: true };
    const updated: Product = {
      ...product,
      packings: [...(product.packings ?? []), packing],
    };

    this.saving.set(true);
    this.catalog.saveProduct(updated).subscribe({
      next: () => {
        this.saving.set(false);
        this.draftName.set('');
        this.draftRows.set(product.sizes.map((size) => ({ size, pairs: 0 })));
        this.toast.show('Packing template saved');
      },
      error: () => {
        this.saving.set(false);
        this.toast.show('Could not save the template.');
      },
    });
  }

  removeTemplate(packing: Packing): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }
    const updated: Product = {
      ...product,
      packings: (product.packings ?? []).filter((k) => k.id !== packing.id),
    };
    this.catalog.saveProduct(updated).subscribe({
      next: () => this.toast.show('Template removed'),
      error: () => this.toast.show('Could not remove the template.'),
    });
  }
}
