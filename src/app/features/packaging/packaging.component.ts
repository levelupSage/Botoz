import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { Packing, PackingRow, Product, ProductSizeGroup } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { PackingGroupsService } from '../../core/services/packing-groups.service';
import { ToastService } from '../../core/services/toast.service';

interface EditableRow {
  size: number;
  pairs: number;
}

@Component({
  selector: 'app-packaging',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './packaging.component.html',
  styleUrl: './packaging.component.scss',
})
export class PackagingComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly packingGroups = inject(PackingGroupsService);
  private readonly toast = inject(ToastService);

  readonly productsLoading = this.catalog.productsLoading;
  readonly productsError = this.catalog.productsError;
  readonly groupsLoading = this.packingGroups.loading;
  readonly groupsError = this.packingGroups.error;
  readonly products = this.catalog.products;
  readonly selectedProductId = signal<number | null>(null);
  readonly productSearch = signal('');
  readonly saving = signal(false);
  readonly editingPackingId = signal<number | null>(null);
  readonly groupName = signal('');
  readonly groupSizes = signal('');
  readonly selectedGroupId = signal<number | null>(null);
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

  readonly savedGroups = computed<ProductSizeGroup[]>(() => {
    const groups = new Map<number, ProductSizeGroup>();
    for (const group of this.packingGroups.groups()) groups.set(group.id, group);
    for (const product of this.products()) {
      for (const group of this.productGroups(product)) groups.set(group.id, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly selectedGroup = computed(() =>
    this.savedGroups().find((group) => group.id === this.selectedGroupId()) ?? null,
  );
  readonly selectedGroupAssigned = computed(() => {
    const id = this.selectedGroupId();
    return id !== null && this.products().some((product) =>
      this.productGroups(product).some((group) => group.id === id),
    );
  });
  readonly assignedGroups = computed(() => this.productGroups(this.selectedProduct()));
  readonly selectedTemplate = computed(() => {
    const product = this.selectedProduct();
    const id = this.editingPackingId();
    if (!product || id === null) return null;
    const group = this.productGroups(product).find((item) => item.id === id);
    if (!group) return null;
    const packing = product.packings.find((item) => item.id === id);
    return packing ?? {
      id: group.id,
      name: group.name,
      active: group.active,
      rows: group.sizes.map((size) => ({ size, pairs: 0 })),
    };
  });
  readonly draftTotal = computed(() =>
    this.draftRows().reduce((total, row) => total + (Number(row.pairs) || 0), 0),
  );

  ngOnInit(): void {
    this.catalog.loadProducts();
    this.packingGroups.load();
  }

  retryProducts(): void {
    this.catalog.loadProducts(true);
  }

  retryGroups(): void {
    this.packingGroups.load(true);
  }

  selectProduct(value: string): void {
    const id = Number(value);
    this.selectedProductId.set(id > 0 ? id : null);
    const firstGroup = this.productGroups(this.catalog.productById(id))[0];
    this.editingPackingId.set(null);
    this.draftRows.set([]);
    if (firstGroup) this.selectAssignedGroup(firstGroup.id);
  }

  selectGroup(value: string): void {
    const id = Number(value);
    const group = this.savedGroups().find((item) => item.id === id);
    this.selectedGroupId.set(group?.id ?? null);
    this.groupName.set(group?.name ?? '');
    this.groupSizes.set(group?.sizes.join(', ') ?? '');
  }

  createGroup(): void {
    const name = this.groupName().trim();
    const sizes = this.groupSizes().split(',').map((value) => Number(value.trim()));
    if (!name || !sizes.length || sizes.some((size) => !Number.isInteger(size) || size <= 0) || new Set(sizes).size !== sizes.length) {
      this.toast.show('Enter a group name and unique positive sizes.');
      return;
    }
    const sortedSizes = sizes.sort((a, b) => a - b);
    const matchingGroup = this.savedGroups().find((group) =>
      group.name.toLowerCase() === name.toLowerCase() && group.sizes.join(',') === sortedSizes.join(','),
    );
    if (matchingGroup) {
      this.selectedGroupId.set(matchingGroup.id);
      this.toast.show('This size group is already saved.');
      return;
    }

    this.saving.set(true);
    this.packingGroups.create(name, sortedSizes).subscribe({
      next: (group) => {
        this.saving.set(false);
        this.selectedGroupId.set(group.id);
        this.toast.success('Size group created.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not create the size group.');
      },
    });
  }

  saveGroupChanges(): void {
    const id = this.selectedGroupId();
    const current = this.selectedGroup();
    const name = this.groupName().trim();
    const sizes = this.parseSizes();
    if (!id || !current || !name || !sizes) {
      this.toast.show('Enter a group name and unique positive sizes.');
      return;
    }
    if (current.name === name && current.sizes.join(',') === sizes.join(',')) {
      this.toast.show('There are no group changes to save.');
      return;
    }

    const affectedProducts = this.products().filter((product) =>
      this.productGroups(product).some((group) => group.id === id),
    );
    this.saving.set(true);
    this.packingGroups.update(id, name, sizes).subscribe({
      next: (savedGroup) => {
        const updates = affectedProducts.map((product) => {
          const groups = this.productGroups(product).map((group) => group.id === id ? savedGroup : group);
          const otherSizes = groups.filter((group) => group.id !== id).flatMap((group) => group.sizes);
          const nextSizes = [...new Set([...otherSizes, ...savedGroup.sizes])];
          const oldPacking = product.packings.find((packing) => packing.id === id);
          const nextPacking: Packing = {
            id,
            name,
            active: savedGroup.active,
            rows: savedGroup.sizes.map((size) => ({
              size,
              pairs: oldPacking?.rows.find((row) => row.size === size)?.pairs ?? 0,
            })),
          };
          return this.catalog.saveProduct({
            ...product,
            sizes: nextSizes,
            sizeGroups: groups,
            packings: product.packings.some((packing) => packing.id === id)
              ? product.packings.map((packing) => packing.id === id ? nextPacking : packing)
              : [...product.packings, nextPacking],
          });
        });
        (updates.length ? forkJoin(updates) : of([])).subscribe({
          next: () => {
            this.saving.set(false);
            this.selectGroup(String(id));
            if (this.selectedProduct()?.sizeGroups?.some((group) => group.id === id)) this.selectAssignedGroup(id);
            this.toast.success('Group changes saved. Matching carton quantities were kept.');
          },
          error: () => {
            this.saving.set(false);
            this.toast.error('Group was updated, but product packing could not be refreshed.');
          },
        });
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not update the shared size group.');
      },
    });
  }

  deleteGroup(): void {
    const id = this.selectedGroupId();
    if (!id || this.products().some((product) => this.productGroups(product).some((group) => group.id === id))) {
      this.toast.show('Only an unused packing group can be deleted.');
      return;
    }
    this.saving.set(true);
    this.packingGroups.delete(id).subscribe({
      next: () => {
        this.saving.set(false);
        this.selectGroup('0');
        this.toast.success('Packing group deleted.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not delete the packing group. It may still be assigned.');
      },
    });
  }

  assignGroup(): void {
    const product = this.selectedProduct();
    const group = this.selectedGroup();
    if (!product || !group) {
      this.toast.show('Choose a product and a saved size group first.');
      return;
    }
    const existingGroups = this.productGroups(product);
    if (existingGroups.some((item) => item.id === group.id)) {
      this.selectAssignedGroup(group.id);
      return;
    }

    const packing: Packing = {
      id: group.id,
      name: group.name,
      active: true,
      rows: group.sizes.map((size) => ({ size, pairs: 0 })),
    };
    const updated: Product = {
      ...product,
      sizes: [...new Set([...product.sizes, ...group.sizes])],
      packings: [...product.packings, packing],
      packingGroupIds: [...new Set([...(product.packingGroupIds ?? []), group.id])],
      enabledPackingGroupIds: [...new Set([...(product.enabledPackingGroupIds ?? []), group.id])],
      sizeGroups: [...existingGroups, group],
    };

    this.saving.set(true);
    this.catalog.saveProduct(updated).subscribe({
      next: (saved) => {
        this.saving.set(false);
        const previousIds = new Set(existingGroups.map((item) => item.id));
        const persisted = this.productGroups(saved).find((item) =>
          item.name === group.name && item.sizes.join(',') === group.sizes.join(',') &&
          (group.id > 0 ? item.id === group.id : !previousIds.has(item.id)),
        );
        if (persisted) this.selectedGroupId.set(persisted.id);
        if (persisted) this.selectAssignedGroup(persisted.id);
        this.toast.success('Size group assigned to product.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not assign the size group.');
      },
    });
  }

  selectAssignedGroup(id: number): void {
    const product = this.selectedProduct();
    const group = this.productGroups(product).find((item) => item.id === id);
    if (!product || !group) return;
    this.selectedGroupId.set(id);
    this.groupName.set(group.name);
    this.groupSizes.set(group.sizes.join(', '));
    this.editingPackingId.set(id);
    const packing = product.packings.find((item) => item.id === id);
    this.draftRows.set(group.sizes.map((size) => ({
      size,
      pairs: packing?.rows.find((row) => row.size === size)?.pairs ?? 0,
    })));
  }

  setDraftPairs(index: number, value: string): void {
    const pairs = Number(value);
    this.draftRows.update((rows) => rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, pairs: Number.isFinite(pairs) ? pairs : 0 } : row,
    ));
  }

  draftRowsText(): string {
    return this.draftRows().map((row) => `Size ${row.size}: ${row.pairs}`).join(' · ');
  }

  saveTemplate(): void {
    const product = this.selectedProduct();
    const groupId = this.editingPackingId();
    const group = this.productGroups(product).find((item) => item.id === groupId);
    const rows: PackingRow[] = this.draftRows().map((row) => ({ ...row }));
    if (!product || !group) return;
    if (rows.length !== group.sizes.length || rows.some((row) =>
      !group.sizes.includes(row.size) || !Number.isInteger(row.pairs) || row.pairs < 0,
    )) {
      this.toast.show('Enter a whole pair quantity (0 or higher) for every assigned size.');
      return;
    }
    if (rows.reduce((total, row) => total + row.pairs, 0) < 1) {
      this.toast.show('Total pairs per carton must be greater than zero.');
      return;
    }

    const packing: Packing = { id: group.id, name: group.name, rows, active: group.active };
    const updated: Product = {
      ...product,
      packings: product.packings.some((item) => item.id === group.id)
        ? product.packings.map((item) => item.id === group.id ? packing : item)
        : [...product.packings, packing],
    };
    this.saving.set(true);
    this.catalog.saveProduct(updated).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Carton pair quantities saved.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not save carton quantities.');
      },
    });
  }

  removeGroupFromProduct(): void {
    const product = this.selectedProduct();
    const groupId = this.editingPackingId();
    if (!product || groupId === null) return;
    const remainingGroups = this.productGroups(product).filter((group) => group.id !== groupId);
    const remainingSizes = [...new Set(remainingGroups.flatMap((group) => group.sizes))];
    const updated: Product = {
      ...product,
      sizes: remainingSizes,
      sizeGroups: remainingGroups,
      packingGroupIds: remainingGroups.map((group) => group.id),
      enabledPackingGroupIds: remainingGroups.filter((group) => group.active).map((group) => group.id),
      packings: product.packings.filter((packing) => packing.id !== groupId),
    };
    this.saving.set(true);
    this.catalog.saveProduct(updated).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingPackingId.set(null);
        this.draftRows.set([]);
        this.toast.success('Group removed from product. The shared group is still available.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not remove the group from this product.');
      },
    });
  }

  private productGroups(product: Product | null | undefined): ProductSizeGroup[] {
    if (!product) return [];
    const groups = new Map<number, ProductSizeGroup>();
    for (const group of product.sizeGroups ?? []) groups.set(group.id, group);
    for (const packing of product.packings ?? []) {
      if (!groups.has(packing.id)) {
        groups.set(packing.id, {
          id: packing.id,
          name: packing.name,
          active: packing.active !== false,
          sizes: packing.rows.map((row) => row.size),
        });
      }
    }
    const assignedIds = new Set([
      ...(product.packingGroupIds ?? []),
      ...groups.keys(),
    ]);
    const enabledIds = new Set(product.enabledPackingGroupIds ?? []);
    for (const group of this.packingGroups.groups()) {
      if (!assignedIds.has(group.id) || groups.has(group.id)) continue;
      groups.set(group.id, {
        ...group,
        active: enabledIds.size ? enabledIds.has(group.id) : group.active,
      });
    }
    return [...groups.values()];
  }

  private parseSizes(): number[] | null {
    const sizes = this.groupSizes().split(',').map((value) => Number(value.trim()));
    if (!sizes.length || sizes.some((size) => !Number.isInteger(size) || size <= 0) || new Set(sizes).size !== sizes.length) {
      return null;
    }
    return sizes.sort((a, b) => a - b);
  }
}
