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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Product, ProductImage } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

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
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);

  /** Product to edit, or null to add a new one. */
  readonly product = input<Product | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  readonly saving = signal(false);
  readonly brands = this.catalog.brands;

  /** Newly added photos (data URLs) + existing ones, editable here. */
  readonly images = signal<ProductImage[]>([]);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    code: ['', [Validators.required]],
    brand: ['', [Validators.required]],
    mrp: [0, [Validators.required, Validators.min(1)]],
    sizes: [''], // comma-separated
    priceA: [0],
    priceB: [0],
    priceC: [0],
    active: [true],
  });

  readonly isEdit = computed(() => this.product() !== null);

  /** Guard so edits to the form don't get overwritten on later brand loads. */
  private hydrated = false;

  constructor() {
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
    const firstBrand = this.brands()[0]?.name ?? '';
    if (p) {
      this.form.setValue({
        name: p.name,
        code: p.code,
        brand: p.brand || firstBrand,
        mrp: p.mrp,
        sizes: (p.sizes ?? []).join(', '),
        priceA: p.categoryPrices.A ?? 0,
        priceB: p.categoryPrices.B ?? 0,
        priceC: p.categoryPrices.C ?? 0,
        active: p.active,
      });
      this.images.set((p.images ?? []).map((i) => ({ ...i })));
    } else {
      this.form.reset({
        name: '',
        code: '',
        brand: firstBrand,
        mrp: 0,
        sizes: '',
        priceA: 0,
        priceB: 0,
        priceC: 0,
        active: true,
      });
      this.images.set([]);
    }
  }

  toggleImage(index: number): void {
    this.images.update((list) =>
      list.map((img, i) => (i === index ? { ...img, active: !img.active } : img)),
    );
  }

  async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        continue;
      }
      try {
        const src = await this.readFile(file);
        this.images.update((list) => [...list, { name: file.name, active: true, src }]);
      } catch {
        /* ignore unreadable file */
      }
    }
    input.value = '';
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

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const sizes = raw.sizes
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    const categoryPrices: Product['categoryPrices'] = { A: 0, B: 0, C: 0 };
    if (raw.priceA > 0) categoryPrices.A = raw.priceA;
    if (raw.priceB > 0) categoryPrices.B = raw.priceB;
    if (raw.priceC > 0) categoryPrices.C = raw.priceC;

    const existing = this.product();
    let images = this.images();
    if (!images.length) {
      images = [{ name: 'Sample product photo', active: true, src: '' }];
    }

    const product: Product = {
      id: existing?.id ?? 0,
      name: raw.name.trim(),
      code: raw.code.trim(),
      brand: raw.brand,
      mrp: raw.mrp,
      category: existing?.category ?? '',
      categoryPrices,
      active: raw.active,
      images,
      sizes: sizes.length ? sizes : (existing?.sizes ?? []),
      packings: existing?.packings ?? [],
    };

    this.saving.set(true);
    this.catalog.saveProduct(product).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show(existing ? 'Product updated' : 'Product added');
        this.saved.emit();
      },
      error: () => {
        this.saving.set(false);
        this.toast.show('Could not save the product.');
      },
    });
  }
}
