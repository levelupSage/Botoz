import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { BackendUserOption, OrderItem, PictureOrderCounts, PictureOrderRequest, Product } from '../../core/models';
import { AdminPhotoOrderService } from '../../core/services/admin-photo-order.service';
import { CatalogService } from '../../core/services/catalog.service';
import { AppStateService } from '../../core/services/app-state.service';
import { ToastService } from '../../core/services/toast.service';
import { activeImageSrc, isOrderableFor, money, priceFor } from '../../core/utils/pricing.util';

@Component({
  selector: 'app-photo-orders', imports: [], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './photo-orders.component.html', styleUrl: './photo-orders.component.scss',
})
export class PhotoOrdersComponent {
  private composerSession = 0;
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
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly reviewRequest = signal<PictureOrderRequest | null>(null);
  readonly detailRequest = signal<PictureOrderRequest | null>(null);
  readonly processedRequest = signal<PictureOrderRequest | null>(null);
  readonly assignRequest = signal<PictureOrderRequest | null>(null);
  readonly decisions = signal<Partial<Record<number, 'GREEN' | 'RED'>>>({});
  readonly photoDraftLines = signal<Partial<Record<number, OrderItem>>>({});
  readonly composerPhotoId = signal<number | null>(null);
  readonly composerSearch = signal('');
  readonly composerProduct = signal<Product | null>(null);
  readonly composerProductLoading = signal(false);
  readonly composerProductError = signal('');
  readonly composerMode = signal<'size' | 'carton'>('size');
  readonly composerSizeGroupId = signal<number | 'all'>('all');
  readonly composerAdminRate = signal(0);
  readonly composerQuantities = signal<Partial<Record<number, number>>>({});
  readonly composerPackingId = signal(0);
  readonly composerCartons = signal(1);
  readonly composerError = signal('');
  readonly reviewResult = signal<{ requestId: number; customer: string; orderIds: number[] } | null>(null);
  readonly reviewSubmitted = signal(false);
  readonly reviewDecisionCount = computed(() => this.reviewRequest()?.photos.filter((photo) => this.decisions()[photo.id] === 'RED' || (this.decisions()[photo.id] === 'GREEN' && !!this.photoDraftLines()[photo.id])).length ?? 0);
  readonly assignmentSubmitted = signal(false);
  readonly usersLoading = signal(false);
  readonly usersError = signal(false);
  readonly usersLoaded = signal(false);
  readonly pendingAssignees = signal<Partial<Record<number, number>>>({});
  readonly lineDrafts = signal<Record<number, { productId: number; size: number; qty: number }>>({});
  readonly backendUsers = signal<BackendUserOption[]>([]);
  readonly assigneeId = signal(0);
  readonly products = computed(() => this.catalog.products().filter((product) => product.active && !product.archived));
  readonly composerCustomer = computed(() => this.catalog.customerById(this.reviewRequest()?.customerId ?? 0) ?? null);
  readonly composerPhoto = computed(() => this.reviewRequest()?.photos.find((photo) => photo.id === this.composerPhotoId()) ?? null);
  readonly composerPhotoIndex = computed(() => (this.reviewRequest()?.photos.findIndex((photo) => photo.id === this.composerPhotoId()) ?? -1) + 1);
  readonly composerResults = computed(() => {
    const customer = this.composerCustomer();
    if (!customer) return [];
    const query = this.composerSearch().trim().toLowerCase();
    return this.products().filter((product) => isOrderableFor(product, customer) &&
      `${product.name} ${product.code} ${product.brand}`.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly composerSizes = computed(() => {
    const product = this.composerProduct();
    return product ? [...new Set([...(product.sizes ?? []), ...(product.sizeGroups ?? []).filter((group) => group.active).flatMap((group) => group.sizes)])].sort((a, b) => a - b) : [];
  });
  readonly composerSizeGroups = computed(() => (this.composerProduct()?.sizeGroups ?? []).filter((group) => group.active && group.sizes.length > 0));
  readonly composerVisibleSizes = computed(() => {
    const groupId = this.composerSizeGroupId();
    if (groupId === 'all') return this.composerSizes();
    const group = this.composerSizeGroups().find((item) => item.id === groupId);
    return group ? [...new Set(group.sizes)].sort((a, b) => a - b) : this.composerSizes();
  });
  readonly composerPackings = computed(() => (this.composerProduct()?.packings ?? []).filter((packing) => packing.active !== false && packing.rows.some((row) => row.pairs > 0)));
  readonly composerPacking = computed(() => this.composerPackings().find((packing) => packing.id === this.composerPackingId()) ?? null);
  readonly money = money;
  readonly priceFor = priceFor;
  readonly activeImageSrc = activeImageSrc;
  readonly canManage = computed(() => ['Admin', 'Super Admin'].includes(this.appState.role()));
  readonly newCount = computed(() => this.counts().incoming);
  readonly reviewedCount = computed(() => this.counts().pending);
  readonly doneCount = computed(() => this.counts().processed);

  constructor() { this.catalog.loadProducts(); this.catalog.loadCustomers(); this.refresh(); }

  readonly productsLoading = this.catalog.productsLoading;
  readonly productsError = this.catalog.productsError;
  readonly customersLoading = this.catalog.customersLoading;
  readonly customersError = this.catalog.customersError;

  startPhotoOrder(): void { this.router.navigate(['/app/products'], { queryParams: { photoOrder: '1' } }); }
  openOrders(): void { this.router.navigate(['/app/new-orders']); }
  retryComposerCustomers(): void { this.catalog.loadCustomers(true); }
  retryComposerProducts(): void { this.catalog.loadProducts(true); }
  openPreview(src: string): void { this.previewSrc.set(src); }
  closePreview(): void { this.previewSrc.set(null); }
  openDetails(request: PictureOrderRequest): void { this.detailRequest.set(request); }
  closeDetails(): void { this.detailRequest.set(null); }

  pendingForPhoto(request: PictureOrderRequest, photoId: number): PictureOrderRequest | undefined {
    return this.pending().find((pending) => pending.id === request.id && pending.photos.some((photo) => photo.id === photoId));
  }

  openPendingFromProcessed(request: PictureOrderRequest, photoId: number): void {
    const pending = this.pendingForPhoto(request, photoId);
    if (!pending) return;
    this.processedRequest.set(null);
    this.openDetails(pending);
  }

  refresh(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set('');
    const search = this.search();
    forkJoin({
      incoming: this.api.list('INCOMING', search), pending: this.api.list('PENDING', search),
      processed: this.api.list('PROCESSED', search), counts: this.api.counts(),
    }).subscribe({
      next: (result) => {
        this.incoming.set(result.incoming); this.pending.set(result.pending); this.processed.set(result.processed); this.counts.set(result.counts); this.loading.set(false);
        if (result.pending.length && this.canManage() && !this.usersLoaded() && !this.usersLoading()) this.loadBackendUsers();
      },
      error: (error: unknown) => { this.loading.set(false); this.loadError.set(error instanceof Error ? error.message : 'Could not load picture orders.'); },
    });
  }

  openReview(request: PictureOrderRequest): void {
    this.decisions.set({});
    this.photoDraftLines.set({});
    this.composerPhotoId.set(null);
    this.reviewSubmitted.set(false);
    this.lineDrafts.set({});
    this.reviewRequest.set(request);
  }

  setDecision(photoId: number, action: 'GREEN' | 'RED'): void {
    this.decisions.update((all) => ({ ...all, [photoId]: action }));
  }

  openPhotoComposer(photoId: number): void {
    this.composerSession++;
    this.composerPhotoId.set(photoId);
    this.composerSearch.set(''); this.composerProduct.set(null); this.composerError.set('');
    this.composerProductError.set(''); this.composerProductLoading.set(false);
  }

  closePhotoComposer(): void {
    if (this.saving()) return;
    this.composerSession++; this.composerPhotoId.set(null); this.composerProduct.set(null);
  }

  selectComposerProduct(product: Product): void {
    if (this.composerProductLoading()) return;
    this.composerProduct.set(null); this.composerProductError.set(''); this.composerError.set('');
    this.composerProductLoading.set(true);
    const photoId = this.composerPhotoId();
    const session = this.composerSession;
    this.catalog.getProduct(product.id).subscribe({
      next: (details) => {
        if (this.composerSession !== session || this.composerPhotoId() !== photoId) return;
        const previous = photoId == null ? undefined : this.photoDraftLines()[photoId];
        const sameProduct = previous?.productId === details.id;
        this.composerProduct.set(details); this.composerMode.set(sameProduct ? previous.mode : 'size');
        this.composerSizeGroupId.set('all'); this.composerAdminRate.set(sameProduct ? previous.adminRatePerPair ?? 0 : 0);
        this.composerQuantities.set(sameProduct && previous.mode === 'size' ? Object.fromEntries(previous.rows.map((row) => [row.size, row.qty])) : {});
        this.composerPackingId.set(sameProduct && previous.mode === 'carton' ? previous.packingGroupId ?? 0 : this.composerPackings()[0]?.id ?? 0);
        this.composerCartons.set(sameProduct && previous.mode === 'carton' ? previous.cartons ?? 1 : 1);
        this.composerProductLoading.set(false);
      },
      error: () => {
        if (this.composerSession !== session || this.composerPhotoId() !== photoId) return;
        this.composerProductLoading.set(false); this.composerProductError.set('Could not load product sizes and packing. Please select the product again.');
      },
    });
  }

  setComposerQuantity(size: number, value: string): void {
    this.composerQuantities.update((all) => ({ ...all, [size]: value.trim() ? Number(value) : 0 }));
  }

  saveComposerLine(): void {
    const product = this.composerProduct(); const photoId = this.composerPhotoId();
    if (!product || photoId == null || this.composerProductLoading()) return;
    const adminRate = this.composerAdminRate();
    if (!Number.isFinite(adminRate) || adminRate < 0) { this.composerError.set('Enter a valid non-negative admin rate.'); return; }
    let line: OrderItem;
    if (this.composerMode() === 'size') {
      const rows = this.composerVisibleSizes().map((size) => ({ size, qty: this.composerQuantities()[size] ?? 0 }));
      if (rows.some((row) => !Number.isSafeInteger(row.qty) || row.qty < 0 || row.qty > 2147483647) || !rows.some((row) => row.qty > 0)) {
        this.composerError.set('Enter valid whole quantities, with at least one pair.'); return;
      }
      const selected = rows.filter((row) => row.qty > 0);
      line = { productId: product.id, productName: product.name, code: product.code, brand: product.brand, mode: 'size', rows: selected, total: selected.reduce((sum, row) => sum + row.qty, 0), adminRatePerPair: adminRate };
    } else {
      const packing = this.composerPacking(); const cartons = this.composerCartons();
      if (!packing || !Number.isInteger(cartons) || cartons < 1 || cartons > 100000) {
        this.composerError.set('Choose a packing template and enter 1 to 100,000 whole cartons.'); return;
      }
      const rows = packing.rows.filter((row) => row.pairs > 0).map((row) => ({ size: row.size, qty: row.pairs * cartons }));
      if (rows.some((row) => !Number.isSafeInteger(row.qty) || row.qty > 2147483647)) { this.composerError.set('Carton quantities are too large.'); return; }
      line = { productId: product.id, productName: product.name, code: product.code, brand: product.brand, mode: 'carton', packingGroupId: packing.id, packingName: packing.name, cartons, rows, total: rows.reduce((sum, row) => sum + row.qty, 0), adminRatePerPair: adminRate };
    }
    this.photoDraftLines.update((all) => ({ ...all, [photoId]: line }));
    this.decisions.update((all) => ({ ...all, [photoId]: 'GREEN' }));
    this.composerError.set('');
    this.composerProduct.set(null);
  }

  removeComposerLine(): void {
    const photoId = this.composerPhotoId();
    if (photoId == null || this.saving()) return;
    this.photoDraftLines.update((all) => { const updated = { ...all }; delete updated[photoId]; return updated; });
    this.decisions.update((all) => { const updated = { ...all }; delete updated[photoId]; return updated; });
  }

  finishPhotoSelection(): void {
    const request = this.reviewRequest();
    const photoId = this.composerPhotoId();
    if (!request || photoId == null || this.decisions()[photoId] !== 'GREEN' || !this.photoDraftLines()[photoId] || this.composerProduct() || this.composerProductLoading() || this.saving()) return;
    if (this.reviewDecisionCount() === request.photos.length) this.submitReview();
    else this.closePhotoComposer();
  }

  setLineProduct(photoId: number, productId: number): void {
    const product = this.products().find((item) => item.id === productId);
    this.lineDrafts.update((all) => ({ ...all, [photoId]: { productId: product?.id ?? 0, size: 0, qty: 1 } }));
  }

  setLineValue(photoId: number, key: 'size' | 'qty', value: number): void {
    const current = this.lineDrafts()[photoId] ?? { productId: 0, size: 0, qty: 1 };
    this.lineDrafts.update((all) => ({ ...all, [photoId]: { ...current, [key]: value } }));
  }

  submitReview(): void {
    const request = this.reviewRequest();
    if (!request || this.saving()) return;
    this.reviewSubmitted.set(true);
    const lines = request.photos.map((photo) => ({ photo, action: this.decisions()[photo.id], line: this.photoDraftLines()[photo.id] }));
    if (lines.length > 12) { this.toast.error('A picture review can contain at most 12 photos.'); return; }
    if (!lines.length || lines.some((item) => !item.action)) {
      this.toast.error('Choose an action for every photo.'); return;
    }
    if (lines.some((item) => item.action === 'GREEN' && !item.line)) {
      this.toast.error('Choose a product, size and quantity for every green photo.'); return;
    }
    this.saving.set(true);
    this.api.review(request.id, lines.map((item) => ({ photoId: item.photo.id, action: item.action!, ...(item.action === 'GREEN' && item.line ? { line: item.line } : {}) }))).subscribe({
      next: (updated) => {
        this.saving.set(false); this.closePhotoComposer(); this.reviewRequest.set(null);
        const orderIds = [...new Set(updated.photos.map((photo) => photo.orderId).filter((id): id is number => !!id))];
        this.reviewResult.set({ requestId: request.id, customer: request.customerName, orderIds });
        this.refresh();
      },
      error: (error: unknown) => { this.saving.set(false); this.toast.error(error instanceof Error ? error.message : 'Could not review the picture order.'); },
    });
  }

  openAssignment(request: PictureOrderRequest): void {
    const selectedId = this.pendingAssignees()[request.id] ?? 0;
    if (!this.backendUsers().some((user) => user.id === selectedId)) {
      this.toast.error('Choose a Backend User for this picture order.');
      return;
    }
    this.assigneeId.set(selectedId); this.lineDrafts.set({}); this.assignRequest.set(request);
    this.assignmentSubmitted.set(false);
  }

  selectPendingAssignee(requestId: number, userId: number): void {
    this.pendingAssignees.update((selected) => ({ ...selected, [requestId]: userId }));
  }

  loadBackendUsers(): void {
    if (this.usersLoading()) return;
    this.usersError.set(false); this.usersLoading.set(true);
    this.api.backendUsers().subscribe({
      next: (users) => { this.backendUsers.set(users); this.usersLoaded.set(true); this.usersLoading.set(false); },
      error: () => { this.backendUsers.set([]); this.usersLoaded.set(false); this.usersLoading.set(false); this.usersError.set(true); },
    });
  }

  submitAssignment(): void {
    if (this.saving() || this.usersLoading()) return;
    this.assignmentSubmitted.set(true);
    const request = this.assignRequest();
    const lines = request?.photos.map((photo) => this.lineFor(photo.id)).filter((line): line is OrderItem => !!line) ?? [];
    if (!request || !request.photos.length || !this.backendUsers().some((user) => user.id === this.assigneeId()) || lines.length !== request.photos.length) { this.toast.error('Choose a Backend User, product, size and quantity for every photo.'); return; }
    this.saving.set(true);
    this.api.assign(request.id, this.assigneeId(), lines).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.assignRequest.set(null);
        this.pendingAssignees.update((selected) => {
          const remaining = { ...selected };
          delete remaining[request.id];
          return remaining;
        });
        const orderText = updated.orderNumber ? ` Regular order ${updated.orderNumber} created.` : '';
        this.toast.success(`Picture order #${request.id} released to the Backend User.${orderText}`);
        this.refresh();
      },
      error: (error: unknown) => { this.saving.set(false); this.toast.error(error instanceof Error ? error.message : 'Could not release the picture order.'); },
    });
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  photoStatusLabel(status: string): string {
    return status.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  reviewedPhotos(request: PictureOrderRequest): number {
    return request.photos.filter((photo) => photo.status !== 'INCOMING').length;
  }

  sizesForPhoto(photoId: number): number[] {
    const productId = this.lineDrafts()[photoId]?.productId;
    return this.products().find((product) => product.id === productId)?.sizes ?? [];
  }

  lineIsComplete(photoId: number): boolean {
    return this.lineFor(photoId) !== null;
  }

  private lineFor(photoId: number): OrderItem | null {
    const draft = this.lineDrafts()[photoId];
    const product = this.products().find((item) => item.id === draft?.productId);
    if (!draft || !product || !product.sizes.includes(draft.size) || !Number.isInteger(draft.qty) || draft.qty <= 0) return null;
    return { productId: product.id, productName: product.name, code: product.code, mode: 'size', total: draft.qty, rows: [{ size: draft.size, qty: draft.qty }], adminRatePerPair: 0 };
  }
}
