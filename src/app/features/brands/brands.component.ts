import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Brand } from '../../core/models';
import { BrandService } from '../../core/services/brand.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-brands',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brands.component.html',
  styleUrl: './brands.component.scss',
})
export class BrandsComponent implements OnInit {
  private readonly brandService = inject(BrandService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  @ViewChild('brandNameInput') private brandNameInput?: ElementRef<HTMLInputElement>;

  readonly loading = this.brandService.loading;
  readonly error = this.brandService.error;
  readonly saving = signal(false);
  readonly deletingLogoId = signal<number | null>(null);
  readonly addOpen = signal(false);
  readonly editingBrand = signal<Brand | null>(null);
  readonly brands = this.brandService.brands;

  private readonly loadErrorToast = effect(() => {
    const message = this.error();
    if (message) this.toast.error(message);
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
  });

  ngOnInit(): void {
    this.brandService.load();
  }

  retry(): void {
    this.brandService.load(true);
  }

  toggleAdd(): void {
    if (this.addOpen()) {
      this.closeAdd();
      return;
    }
    this.editingBrand.set(null);
    this.form.reset({ name: '' });
    this.addOpen.update((isOpen) => !isOpen);
    this.focusBrandName();
  }

  rename(brand: Brand): void {
    this.editingBrand.set(brand);
    this.form.reset({ name: brand.name });
    this.addOpen.set(true);
    this.focusBrandName();
  }

  closeAdd(): void {
    if (this.saving()) return;
    this.addOpen.set(false);
    this.editingBrand.set(null);
    this.form.reset({ name: '' });
  }

  onModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeAdd();
    }
  }

  private focusBrandName(): void {
    requestAnimationFrame(() => this.brandNameInput?.nativeElement.focus());
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
    const normalizedName = name.toLowerCase();
    if (this.brands().some((brand) =>
      brand.id !== editing?.id && brand.name.trim().toLowerCase() === normalizedName,
    )) {
      this.toast.error('A brand with that name already exists.');
      return;
    }

    this.saving.set(true);
    this.brandService.save(editing ? { ...editing, name } : { id: 0, name, active: true }).subscribe({
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
    this.brandService.save({ ...brand, active: !brand.active }).subscribe({
      next: (saved) => this.toast.success(
        saved.active ? 'Brand activated successfully.' : 'Brand deactivated successfully.',
      ),
      error: (error: unknown) => this.apiFailure(error, 'Could not update the brand.'),
    });
  }

  deleteLogo(brand: Brand): void {
    if (!window.confirm(`Remove the logo for "${brand.name}"?`)) return;

    this.deletingLogoId.set(brand.id);
    this.brandService.deleteLogo(brand).subscribe({
      next: () => {
        this.deletingLogoId.set(null);
        this.toast.success('Brand logo removed successfully.');
      },
      error: (error: unknown) => {
        this.deletingLogoId.set(null);
        this.apiFailure(error, 'Could not remove the brand logo.');
      },
    });
  }

  toggleSizeLock(brand: Brand): void {
    const locked = !brand.sizeLocked;
    this.brandService.setSizeLock(brand, locked).subscribe({
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
    this.brandService.uploadLogo(brand, file).subscribe({
      next: () => this.toast.success('Brand logo uploaded successfully.'),
      error: (error: unknown) => this.apiFailure(error, 'Could not upload the brand logo.'),
    });
  }

  private apiFailure(error: unknown, fallback: string): void {
    const message = error instanceof Error ? error.message.trim() : '';
    this.toast.error(message && !message.startsWith('Http failure response') ? message : fallback);
  }
}
