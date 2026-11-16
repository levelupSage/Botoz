import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Brand } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

interface BrandRow {
  brand: Brand;
  productCount: number;
}

@Component({
  selector: 'app-brands',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brands.component.html',
  styleUrl: './brands.component.scss',
})
export class BrandsComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;
  readonly saving = signal(false);
  readonly addOpen = signal(false);
  readonly editingBrand = signal<Brand | null>(null);

  private readonly loadErrorToast = effect(() => {
    const message = this.error();
    if (message) this.toast.error(message);
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });

  readonly rows = computed<BrandRow[]>(() => {
    const products = this.catalog.products();
    return this.catalog.brands().map((brand) => ({
      brand,
      productCount: products.filter((product) => product.brand === brand.name).length,
    }));
  });

  ngOnInit(): void {
    this.catalog.load();
  }

  retry(): void {
    this.catalog.load(true);
  }

  toggleAdd(): void {
    if (this.addOpen()) {
      this.closeAdd();
      return;
    }
    this.editingBrand.set(null);
    this.form.reset({ name: '' });
    this.addOpen.update((isOpen) => !isOpen);
  }

  rename(brand: Brand): void {
    this.editingBrand.set(brand);
    this.form.reset({ name: brand.name });
    this.addOpen.set(true);
  }

  closeAdd(): void {
    if (this.saving()) return;
    this.addOpen.set(false);
    this.editingBrand.set(null);
    this.form.reset({ name: '' });
  }

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  add(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.getRawValue().name.trim();
    if (!name) {
      this.form.controls.name.setErrors({ required: true });
      return;
    }
    const editing = this.editingBrand();
    if (editing && editing.name === name) {
      this.closeAdd();
      return;
    }
    if (this.catalog.brands().some((brand) =>
      brand.id !== editing?.id && brand.name.toLowerCase() === name.toLowerCase(),
    )) {
      this.toast.error('A brand with that name already exists.');
      return;
    }

    this.saving.set(true);
    this.catalog.saveBrand(editing ? { ...editing, name } : { id: 0, name, active: true }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ name: '' });
        this.addOpen.set(false);
        this.editingBrand.set(null);
        this.toast.success(editing ? 'Brand renamed successfully.' : 'Brand added successfully.');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.apiFailure(error, editing ? 'Could not rename the brand.' : 'Could not add the brand.');
      },
    });
  }

  toggle(brand: Brand): void {
    this.catalog.saveBrand({ ...brand, active: !brand.active }).subscribe({
      next: (saved) => this.toast.success(saved.active ? 'Brand activated successfully.' : 'Brand deactivated successfully.'),
      error: (error: unknown) => this.apiFailure(error, 'Could not update the brand.'),
    });
  }

  toggleSizeLock(brand: Brand): void {
    const locked = !brand.sizeLocked;
    this.catalog.setBrandSizeLock(brand, locked).subscribe({
      next: () => this.toast.success(locked ? 'Brand size quantities locked.' : 'Brand size quantities unlocked.'),
      error: (error: unknown) => this.apiFailure(error, 'Could not change the brand size lock.'),
    });
  }

  uploadLogo(brand: Brand, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.toast.error('Choose a PNG, JPEG, or WebP logo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Logo must be 5 MB or smaller.');
      return;
    }
    this.catalog.uploadBrandLogo(brand, file).subscribe({
      next: () => this.toast.success('Brand logo uploaded successfully.'),
      error: (error: unknown) => this.apiFailure(error, 'Could not upload the brand logo.'),
    });
  }

  private apiFailure(error: unknown, fallback: string): void {
    const message = error instanceof Error ? error.message.trim() : '';
    this.toast.error(message && !message.startsWith('Http failure response') ? message : fallback);
  }
}
