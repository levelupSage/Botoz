import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Brand } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';

interface BrandRow {
  brand: Brand;
  productCount: number;
}

/** Brands management: list with product counts, add, activate/deactivate. */
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

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
  });

  readonly rows = computed<BrandRow[]>(() => {
    const products = this.catalog.products();
    return this.catalog.brands().map((brand) => ({
      brand,
      productCount: products.filter((p) => p.brand === brand.name).length,
    }));
  });

  ngOnInit(): void {
    this.catalog.load();
  }

  add(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.getRawValue().name.trim();
    const exists = this.catalog
      .brands()
      .some((b) => b.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      this.toast.show('A brand with that name already exists.');
      return;
    }

    this.saving.set(true);
    this.catalog.saveBrand({ id: 0, name, active: true }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ name: '' });
        this.toast.show('Brand added');
      },
      error: () => {
        this.saving.set(false);
        this.toast.show('Could not add the brand.');
      },
    });
  }

  toggle(brand: Brand): void {
    this.catalog.saveBrand({ ...brand, active: !brand.active }).subscribe({
      next: (saved) => this.toast.show(saved.active ? 'Brand activated' : 'Brand deactivated'),
      error: () => this.toast.show('Could not update the brand.'),
    });
  }
}
