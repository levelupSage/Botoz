import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Packing, PackingRow, Product } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

interface EditableRow {
  size: number;
  pairs: number;
}

/**
 * Configure reusable carton templates. Templates can be edited or archived;
 * active templates are offered by size/carton ordering.
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
  readonly productSearch = signal('');
  readonly saving = signal(false);
  readonly editingPackingId = signal<number | 'new' | null>(null);

  // ---- New-template draft --------------------------------------------
  readonly draftName = signal('');
  readonly draftRows = signal<EditableRow[]>([]);

  readonly selectedProduct = computed<Product | null>(() => {
    const id = this.selectedProductId();
    return id ? (this.catalog.productById(id) ?? null) : null;
  });

  readonly filteredProducts = computed(() => {
    const query = this.productSearch().trim().toLowerCase();
    return this.products().filter((product) =>
      `${product.name} ${product.code} ${product.brand}`.toLowerCase().includes(query),
    );
  });

  readonly existingPackings = computed<Packing[]>(() =>
    (this.selectedProduct()?.packings ?? []).filter((packing) => packing.active !== false),
  );
  readonly archivedPackings = computed<Packing[]>(() =>
    (this.selectedProduct()?.packings ?? []).filter((packing) => packing.active === false),
  );
  readonly selectedTemplate = computed(() =>
    this.existingPackings().find((packing) => packing.id === this.editingPackingId()) ?? null,
  );

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
    const first = product?.packings.find((packing) => packing.active !== false);
    if (first) this.loadTemplate(String(first.id));
    else this.startNewTemplate();
  }

  loadTemplate(value: string): void {
    const packingId = Number(value);
    const packing = this.selectedProduct()?.packings.find(
      (item) => item.id === packingId && item.active !== false,
    );
    if (!packing) return;
    this.editingPackingId.set(packing.id);
    this.draftName.set(packing.name);
    this.draftRows.set(packing.rows.map((row) => ({ ...row })));
  }

  startNewTemplate(): void {
    this.editingPackingId.set('new');
    this.draftName.set('');
    this.draftRows.set((this.selectedProduct()?.sizes ?? []).slice(0, 4).map((size) => ({ size, pairs: 0 })));
  }

  addRow(): void {
    this.draftRows.update((rows) => [...rows, { size: 0, pairs: 0 }]);
  }

  removeRow(index: number): void {
    this.draftRows.update((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  setDraftSize(index: number, value: string): void {
    const size = Number(value);
    this.draftRows.update((rows) => rows.map((row, i) =>
      i === index ? { ...row, size: Number.isFinite(size) ? size : 0 } : row,
    ));
  }

  packingTotal(packing: Packing): number {
    return packing.rows.reduce((sum, r) => sum + r.pairs, 0);
  }

  draftRowsText(): string {
    return this.draftRows().map((row) => `Size ${row.size || '—'}: ${row.pairs}`).join(' · ');
  }

  rowsText(packing: Packing): string {
    return packing.rows.map((r) => `Size ${r.size}: ${r.pairs}`).join(' · ');
  }

  setDraftPairs(size: number, value: string): void {
    const pairs = Number(value);
    this.draftRows.update((rows) =>
      rows.map((r, index) => (index === size ? { ...r, pairs: Number.isFinite(pairs) ? pairs : 0 } : r)),
    );
  }

  saveTemplate(): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }
    const name = this.draftName().trim();
    const rows: PackingRow[] = this.draftRows().map((row) => ({ ...row }));

    if (!name) {
      this.toast.show('Give the packing template a name.');
      return;
    }
    if (
      !rows.length ||
      rows.some((row) => !Number.isFinite(row.size) || row.size <= 0 || !Number.isInteger(row.pairs) || row.pairs <= 0) ||
      new Set(rows.map((row) => row.size)).size !== rows.length
    ) {
      this.toast.show('Enter unique sizes and a positive whole pair count for every row.');
      return;
    }

    const current = product.packings ?? [];
    const editing = this.editingPackingId();
    const existing = editing === 'new' || editing === null
      ? undefined
      : current.find((packing) => packing.id === editing && packing.active !== false);
    const nextId = current.reduce((max, packing) => Math.max(max, packing.id), 0) + 1 || Date.now();
    const packing: Packing = { id: existing?.id ?? nextId, name, rows, active: true };
    const updated: Product = {
      ...product,
      packings: existing
        ? current.map((item) => item.id === existing.id ? packing : item)
        : [...current, packing],
    };

    this.saving.set(true);
    this.catalog.saveProduct(updated).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingPackingId.set(packing.id);
        this.draftName.set(packing.name);
        this.draftRows.set(packing.rows.map((row) => ({ ...row })));
        this.toast.success(existing ? 'Packing template updated successfully.' : 'Packing template saved successfully.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not save the template.');
      },
    });
  }

  archiveTemplate(packing: Packing): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }
    const updated: Product = {
      ...product,
      packings: (product.packings ?? []).map((item) =>
        item.id === packing.id ? { ...item, active: false } : item,
      ),
      enabledPackingGroupIds: (product.enabledPackingGroupIds ?? product.packings.filter((item) => item.active !== false).map((item) => item.id))
        .filter((id) => id !== packing.id),
    };
    this.saving.set(true);
    this.catalog.saveProduct(updated).subscribe({
      next: () => {
        this.saving.set(false);
        this.startNewTemplate();
        this.toast.success('Packing template archived successfully.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not archive the template.');
      },
    });
  }

  restoreTemplate(packing: Packing): void {
    const product = this.selectedProduct();
    if (!product) return;
    const updated: Product = {
      ...product,
      packings: (product.packings ?? []).map((item) =>
        item.id === packing.id ? { ...item, active: true } : item,
      ),
      enabledPackingGroupIds: [...new Set([...(product.enabledPackingGroupIds ?? []), packing.id])],
    };
    this.saving.set(true);
    this.catalog.saveProduct(updated).subscribe({
      next: () => {
        this.saving.set(false);
        this.loadTemplate(String(packing.id));
        this.toast.success('Packing template restored successfully.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not restore the template.');
      },
    });
  }
}
