import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError, timeout } from 'rxjs';
import { DataService } from '../data/data.service';
import { Packing, Product, ProductSizeGroup } from '../models';

@Injectable({ providedIn: 'root' })
export class PackingGroupsService {
  private readonly data = inject(DataService);
  private readonly _groups = signal<ProductSizeGroup[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private loaded = false;
  private loadRequest: Observable<ProductSizeGroup[]> | null = null;

  readonly groups = this._groups.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  load(force = false): void {
    this.getGroups(force).subscribe({ error: () => undefined });
  }

  resolveProduct(product: Product): Observable<Product> {
    const groupIds = new Set([
      ...(product.packingGroupIds ?? []),
      ...(product.sizeGroups ?? []).map((group) => group.id),
      ...(product.packings ?? []).map((packing) => packing.id),
    ]);
    if (product.sizes.length || !groupIds.size) return of(product);

    return this.getGroups().pipe(map((groups) => {
      const enabledIds = new Set(product.enabledPackingGroupIds ?? []);
      const existingGroups = new Map((product.sizeGroups ?? []).map((group) => [group.id, group]));
      for (const group of groups) {
        if (!groupIds.has(group.id) || existingGroups.has(group.id)) continue;
        existingGroups.set(group.id, {
          ...group,
          active: enabledIds.size ? enabledIds.has(group.id) : group.active,
        });
      }

      const sizeGroups = [...existingGroups.values()];
      const sizes = [...new Set([
        ...product.sizes,
        ...sizeGroups.filter((group) => group.active).flatMap((group) => group.sizes),
      ])].sort((a, b) => a - b);
      const packingsById = new Map((product.packings ?? []).map((packing) => [packing.id, packing]));
      for (const group of sizeGroups) {
        if (packingsById.has(group.id)) continue;
        const packing: Packing = {
          id: group.id,
          name: group.name,
          active: group.active,
          rows: group.sizes.map((size) => ({ size, pairs: 0 })),
        };
        packingsById.set(group.id, packing);
      }
      return { ...product, sizes, sizeGroups, packings: [...packingsById.values()] };
    }));
  }

  private getGroups(force = false): Observable<ProductSizeGroup[]> {
    if (this.loaded && !force) return of(this._groups());
    if (this.loadRequest && !force) return this.loadRequest;

    this._loading.set(true);
    this._error.set(null);
    const request = this.data.getPackingGroups().pipe(
      timeout({ first: 60_000 }),
      tap((groups) => {
        this._groups.set(groups);
        this.loaded = true;
      }),
      catchError((error: unknown) => {
        this._error.set('Could not load packing groups. Check the API connection and try again.');
        return throwError(() => error);
      }),
      finalize(() => {
        this._loading.set(false);
        this.loadRequest = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.loadRequest = request;
    return request;
  }

  create(name: string, sizes: number[]): Observable<ProductSizeGroup> {
    return this.data.createPackingGroup(name, sizes).pipe(tap((saved) => this.upsert(saved)));
  }

  update(id: number, name: string, sizes: number[]): Observable<ProductSizeGroup> {
    return this.data.updatePackingGroup(id, name, sizes).pipe(tap((saved) => this.upsert(saved)));
  }

  delete(id: number): Observable<void> {
    return this.data.deletePackingGroup(id).pipe(
      tap(() => this._groups.update((groups) => groups.filter((group) => group.id !== id))),
    );
  }

  private upsert(saved: ProductSizeGroup): void {
    this._groups.update((groups) => {
      const current = groups.findIndex((group) => group.id === saved.id);
      if (current < 0) return [...groups, saved].sort((a, b) => a.name.localeCompare(b.name));
      const updated = [...groups];
      updated[current] = saved;
      return updated.sort((a, b) => a.name.localeCompare(b.name));
    });
  }
}
