import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Packing, Product, ProductImage } from '../../core/models';
import { DataService } from '../../core/data/data.service';
import { BrandService } from '../../core/services/brand.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

const MAX_PRODUCT_IMAGES = 12;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PRODUCT_NAME = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/+-]{1,119}$/;
const PRODUCT_CODE = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,49}$/;
const MAX_PRICE = 10_000_000;

function categoryPricesWithinMrp(control: AbstractControl): ValidationErrors | null {
  const value = control.value as { mrp?: number; priceA?: number; priceB?: number; priceC?: number };
  const mrp = Number(value?.mrp);
  if (!Number.isFinite(mrp) || mrp < 1) return null;
  const exceedsMrp = [value?.priceA, value?.priceB, value?.priceC]
    .some((price) => Number(price) > mrp);
  return exceedsMrp ? { categoryPriceExceedsMrp: true } : null;
}

/**
 * Add / edit a product: name, code, brand, MRP, A/B/C display prices, sizes,
 * active toggle and photo uploads. Saves via the swappable data layer.
 */
@Component({
  selector: 'app-product-modal',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-modal.component.html',
  styleUrl: './product-modal.component.scss',
})
export class ProductModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly brandService = inject(BrandService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly data = inject(DataService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Product to edit, or null to add a new one. */
  readonly product = input<Product | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  readonly saving = signal(false);
  readonly brands = this.brandService.brands;
  readonly supportsPhotoArchive = this.data.supportsPhotoArchive;

  /** Newly added photos (data URLs) + existing ones, editable here. */
  readonly images = signal<ProductImage[]>([]);
  readonly packingGroups = signal<Packing[]>([]);
  readonly hasEnabledPackingGroups = computed(() => this.packingGroups().some((group) => group.active !== false));

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(PRODUCT_NAME)]],
    code: ['', [Validators.required, Validators.pattern(PRODUCT_CODE)]],
    brand: ['', [Validators.required]],
    mrp: [0, [Validators.required, Validators.min(1), Validators.max(MAX_PRICE), Validators.pattern(/^\d+$/)]],
    priceA: [0, [Validators.min(0), Validators.max(MAX_PRICE), Validators.pattern(/^\d+$/)]],
    priceB: [0, [Validators.min(0), Validators.max(MAX_PRICE), Validators.pattern(/^\d+$/)]],
    priceC: [0, [Validators.min(0), Validators.max(MAX_PRICE), Validators.pattern(/^\d+$/)]],
    active: [true],
  }, { validators: categoryPricesWithinMrp });

  readonly isEdit = computed(() => this.product() !== null);

  /** Guard so edits to the form don't get overwritten on later brand loads. */
  private hydrated = false;

  constructor() {
    this.brandService.load();
    // Hydrate the form once brands + the product input are available.
    effect(() => {
      const brandsReady = this.brands().length > 0;
      // Touch product() so the effect re-runs when it changes.
      this.product();
      if (!this.hydrated && brandsReady) {
        this.hydrate();
        this.hydrated = true;
      }
    });
  }

  private hydrate(): void {
    const p = this.product();
    if (p) {
      this.form.setValue({
        name: p.name,
        code: p.code,
        brand: p.brand || '',
        mrp: p.mrp,
        priceA: p.categoryPrices.A ?? 0,
        priceB: p.categoryPrices.B ?? 0,
        priceC: p.categoryPrices.C ?? 0,
        active: p.active,
      });
      this.images.set((p.images ?? []).map((i) => ({ ...i })));
      this.packingGroups.set((p.packings ?? []).map((packing) => ({ ...packing, rows: [...packing.rows] })));
    } else {
      this.form.reset({
        name: '',
        code: '',
        brand: '',
        mrp: 0,
        priceA: 0,
        priceB: 0,
        priceC: 0,
        active: true,
      });
      this.images.set([]);
      this.packingGroups.set([]);
    }
  }

  togglePackingGroup(id: number): void {
    this.packingGroups.update((groups) => groups.map((group) =>
      group.id === id ? { ...group, active: group.active === false } : group,
    ));
  }

  packingSummary(group: Packing): string {
    return group.rows.map((row) => `${row.size} (${row.pairs} pairs)`).join(', ');
  }

  toggleImage(index: number): void {
    this.images.update((list) =>
      list.map((img, i) => (i === index ? { ...img, active: !img.active } : img)),
    );
  }

  removeNewImage(index: number): void {
    this.images.update((list) => list.filter((_, currentIndex) => currentIndex !== index));
  }

  async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    let rejected = 0;
    for (const file of files) {
      if (this.images().length >= MAX_PRODUCT_IMAGES) {
        rejected++;
        continue;
      }
      if (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
        rejected++;
        continue;
      }
      try {
        const src = await this.readFile(file);
        this.images.update((list) => [...list, { name: file.name, active: true, src }]);
      } catch {
        rejected++;
      }
    }
    input.value = '';
    if (rejected) {
      this.toast.error(`Some photos were skipped. Use up to ${MAX_PRODUCT_IMAGES} JPG, PNG, or WebP images, maximum 8 MB each.`);
    }
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  normalizeCode(): void {
    const control = this.form.controls.code;
    control.setValue(control.value.trim().toUpperCase(), { emitEvent: false });
  }

  categoryPriceInvalid(tier: 'priceA' | 'priceB' | 'priceC'): boolean {
    const control = this.form.controls[tier];
    if (control.touched && control.invalid) return true;
    const mrp = Number(this.form.controls.mrp.value);
    return (control.touched || this.form.touched)
      && Number.isFinite(mrp)
      && mrp > 0
      && Number(control.value) > mrp;
  }

  save(): void {
    this.normalizeCode();
    this.form.controls.name.setValue(this.form.controls.name.value.trim(), { emitEvent: false });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      this.toast.error('Please correct the highlighted product details.');
      return;
    }
    if (!this.brands().length) {
      this.toast.error('Create a brand before adding a product.');
      return;
    }
    const raw = this.form.getRawValue();
    const existing = this.product();
    const duplicateCode = this.catalog.products().some((item) =>
      item.id !== existing?.id && item.code.trim().toLowerCase() === raw.code.trim().toLowerCase(),
    );
    if (duplicateCode) {
      this.toast.error('Product code already exists. Choose a unique code.');
      this.form.controls.code.setErrors({ duplicate: true });
      this.form.controls.code.markAsTouched();
      this.focusFirstInvalid();
      return;
    }
    const categoryPrices: Product['categoryPrices'] = { A: 0, B: 0, C: 0 };
    if (raw.priceA > 0) categoryPrices.A = raw.priceA;
    if (raw.priceB > 0) categoryPrices.B = raw.priceB;
    if (raw.priceC > 0) categoryPrices.C = raw.priceC;

    const images = this.images();

    const product: Product = {
      id: existing?.id ?? 0,
      name: raw.name.trim(),
      code: raw.code.trim(),
      brand: raw.brand,
      mrp: raw.mrp,
      category: existing?.category ?? '',
      categoryPrices,
      active: raw.active,
      archived: existing?.archived,
      images,
      sizes: [...new Set(this.packingGroups().flatMap((packing) => packing.rows.map((row) => row.size)))],
      packings: this.packingGroups(),
      packingGroupIds: existing?.packingGroupIds,
      enabledPackingGroupIds: this.packingGroups().filter((packing) => packing.active !== false).map((packing) => packing.id),
      sizeGroups: existing?.sizeGroups,
    };

    this.saving.set(true);
    this.catalog.saveProduct(product).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(existing ? 'Product updated successfully.' : 'Product added successfully.');
        this.saved.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.error(this.errorMessage(error, 'Could not save the product.'));
      },
    });
  }

  private focusFirstInvalid(): void {
    requestAnimationFrame(() => {
      const target = this.host.nativeElement.querySelector('[aria-invalid="true"]') as HTMLElement | null;
      target?.focus();
    });
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }
}
