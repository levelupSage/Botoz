import { computed, inject, Injectable, signal, WritableSignal } from '@angular/core';
import { Observable, tap, timeout } from 'rxjs';
import { DataService } from '../data/data.service';
import { Brand } from '../models';

@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly data = inject(DataService);
  private readonly _brands = signal<Brand[]>([]);
  private readonly _loading = signal(false);
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly brands = this._brands.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly activeBrands = computed(() => this._brands().filter((brand) => brand.active));

  load(force = false): void {
    if (this._loading() || (this._loaded() && !force)) return;

    this._loading.set(true);
    this._error.set(null);
    this.data.getBrands().pipe(timeout({ first: 60_000 })).subscribe({
      next: (brands) => {
        this._brands.set(brands);
        this._loaded.set(true);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Could not load brands. Check the API connection and try again.');
        this._loading.set(false);
      },
    });
  }

  save(brand: Brand): Observable<Brand> {
    return this.data.saveBrand(brand).pipe(tap((saved) => this.merge(saved)));
  }

  delete(id: number): Observable<void> {
    return this.data.deleteBrand(id).pipe(
      tap(() => this._brands.update((brands) => brands.filter((brand) => brand.id !== id))),
    );
  }

  setSizeLock(brand: Brand, locked: boolean): Observable<Brand> {
    return this.data.setBrandSizeLock(brand, locked).pipe(tap((saved) => this.merge(saved)));
  }

  uploadLogo(brand: Brand, file: File): Observable<Brand> {
    return this.data.uploadBrandLogo(brand, file).pipe(tap((saved) => this.merge(saved)));
  }

  private merge(saved: Brand): void {
    this._brands.update((brands) => {
      const index = brands.findIndex((brand) => brand.id === saved.id);
      if (index < 0) return [...brands, saved];
      const updated = [...brands];
      updated[index] = saved;
      return updated;
    });
  }
}
