import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { BackendUserOption, OrderItem, PictureOrderCounts, PictureOrderRequest } from '../../core/models';
import { AdminPhotoOrderService } from '../../core/services/admin-photo-order.service';
import { CatalogService } from '../../core/services/catalog.service';
import { AppStateService } from '../../core/services/app-state.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-photo-orders', imports: [], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './photo-orders.component.html', styleUrl: './photo-orders.component.scss',
})
export class PhotoOrdersComponent {
  private readonly api = inject(AdminPhotoOrderService);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly appState = inject(AppStateService);
  private readonly toast = inject(ToastService);

  readonly incoming = signal<PictureOrderRequest[]>([]);
  readonly pending = signal<PictureOrderRequest[]>([]);
  readonly processed = signal<PictureOrderRequest[]>([]);
  readonly counts = signal<PictureOrderCounts>({ incoming: 0, pending: 0, processed: 0 });
  readonly search = signal('');
  readonly previewSrc = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly reviewRequest = signal<PictureOrderRequest | null>(null);
  readonly assignRequest = signal<PictureOrderRequest | null>(null);
  readonly decisions = signal<Record<number, 'GREEN' | 'RED'>>({});
  readonly lineDrafts = signal<Record<number, { productId: number; size: number; qty: number }>>({});
  readonly backendUsers = signal<BackendUserOption[]>([]);
  readonly assigneeId = signal(0);
  readonly products = computed(() => this.catalog.products().filter((product) => product.active && !product.archived));
  readonly canManage = computed(() => ['Admin', 'Super Admin'].includes(this.appState.role()));
  readonly newCount = computed(() => this.counts().incoming);
  readonly reviewedCount = computed(() => this.counts().pending);
  readonly doneCount = computed(() => this.counts().processed);

  constructor() { this.catalog.loadProducts(); this.refresh(); }

  startPhotoOrder(): void { this.router.navigate(['/app/products'], { queryParams: { photoOrder: '1' } }); }
  openPreview(src: string): void { this.previewSrc.set(src); }
  closePreview(): void { this.previewSrc.set(null); }

  refresh(): void {
    this.loading.set(true);
    const search = this.search();
    forkJoin({
      incoming: this.api.list('INCOMING', search), pending: this.api.list('PENDING', search),
      processed: this.api.list('PROCESSED', search), counts: this.api.counts(),
    }).subscribe({
      next: (result) => { this.incoming.set(result.incoming); this.pending.set(result.pending); this.processed.set(result.processed); this.counts.set(result.counts); this.loading.set(false); },
      error: (error: unknown) => { this.loading.set(false); this.toast.error(error instanceof Error ? error.message : 'Could not load picture orders.'); },
    });
  }

  openReview(request: PictureOrderRequest): void {
    this.decisions.set(Object.fromEntries(request.photos.map((photo) => [photo.id, 'RED'])));
    this.lineDrafts.set({});
    this.reviewRequest.set(request);
  }

  setDecision(photoId: number, action: 'GREEN' | 'RED'): void {
    this.decisions.update((all) => ({ ...all, [photoId]: action }));
  }

  setLineProduct(photoId: number, productId: number): void {
    const product = this.products().find((item) => item.id === productId);
    this.lineDrafts.update((all) => ({ ...all, [photoId]: { productId, size: product?.sizes[0] ?? 0, qty: 1 } }));
  }

  setLineValue(photoId: number, key: 'size' | 'qty', value: number): void {
    const current = this.lineDrafts()[photoId] ?? { productId: 0, size: 0, qty: 1 };
    this.lineDrafts.update((all) => ({ ...all, [photoId]: { ...current, [key]: value } }));
  }

  submitReview(): void {
    const request = this.reviewRequest();
    if (!request || this.saving()) return;
    const lines = request.photos.map((photo) => ({ photo, action: this.decisions()[photo.id], line: this.lineFor(photo.id) }));
    if (lines.some((item) => item.action === 'GREEN' && !item.line)) {
      this.toast.error('Choose a product, size and quantity for every green photo.'); return;
    }
    this.saving.set(true);
    this.api.review(request.id, lines.map((item) => ({ photoId: item.photo.id, action: item.action, ...(item.line ? { line: item.line } : {}) }))).subscribe({
      next: () => { this.saving.set(false); this.reviewRequest.set(null); this.toast.success(`Picture order #${request.id} reviewed.`); this.refresh(); },
      error: (error: unknown) => { this.saving.set(false); this.toast.error(error instanceof Error ? error.message : 'Could not review the picture order.'); },
    });
  }

  openAssignment(request: PictureOrderRequest): void {
    this.assigneeId.set(0); this.lineDrafts.set({}); this.assignRequest.set(request);
    this.api.backendUsers().subscribe({ next: (users) => this.backendUsers.set(users), error: () => this.toast.error('Could not load Backend Users.') });
  }

  submitAssignment(): void {
    const request = this.assignRequest();
    const lines = request?.photos.map((photo) => this.lineFor(photo.id)).filter((line): line is OrderItem => !!line) ?? [];
    if (!request || !this.assigneeId() || lines.length !== request.photos.length) { this.toast.error('Choose a Backend User, product, size and quantity for every photo.'); return; }
    this.saving.set(true);
    this.api.assign(request.id, this.assigneeId(), lines).subscribe({
      next: () => { this.saving.set(false); this.assignRequest.set(null); this.toast.success(`Picture order #${request.id} assigned.`); this.refresh(); },
      error: (error: unknown) => { this.saving.set(false); this.toast.error(error instanceof Error ? error.message : 'Could not assign the picture order.'); },
    });
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private lineFor(photoId: number): OrderItem | null {
    const draft = this.lineDrafts()[photoId];
    const product = this.products().find((item) => item.id === draft?.productId);
    if (!draft || !product || draft.size <= 0 || draft.qty <= 0) return null;
    return { productId: product.id, productName: product.name, code: product.code, mode: 'size', total: draft.qty, rows: [{ size: draft.size, qty: draft.qty }], adminRatePerPair: 0 };
  }
}
