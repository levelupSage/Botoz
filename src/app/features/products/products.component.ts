import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Customer, Product, ProductImage, PriceTier } from '../../core/models';
import { DataService } from '../../core/data/data.service';
import { AppStateService } from '../../core/services/app-state.service';
import { BrandService } from '../../core/services/brand.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';
import { AdminPhotoOrderService, AdminPhotoOrderLine } from '../../core/services/admin-photo-order.service';
import { ProductShowcaseService, ShowcaseBanner } from '../../core/services/product-showcase.service';
import { activeImageSrc, hasActiveImage, isOrderableFor, money, priceFor } from '../../core/utils/pricing.util';
import { OrderModalComponent } from './order-modal.component';
import { ProductModalComponent } from './product-modal.component';

type StatusFilter = 'All' | 'Active' | 'Archived' | 'Deactivated';
type ProductSort = 'Relevance' | 'A–Z' | 'MRP: low to high' | 'MRP: high to low';

interface PhotoDraft extends AdminPhotoOrderLine {}

/**
 * Products catalogue. Behaviour mirrors the prototype:
 * - Customers / staff-ordering see only orderable products and an "Order" button.
 * - Admins browsing see all products with pricing and management affordances.
 */
@Component({
  selector: 'app-products',
  imports: [OrderModalComponent, ProductModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly brandService = inject(BrandService);
  private readonly data = inject(DataService);
  private readonly appState = inject(AppStateService);
  private readonly toast = inject(ToastService);
  private readonly showcase = inject(ProductShowcaseService);
  private readonly photoOrders = inject(AdminPhotoOrderService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;
  readonly role = this.appState.role;

  readonly search = signal('');
  readonly brandFilter = signal<string>('All');
  readonly sizeFilter = signal('All');
  readonly minMrp = signal('');
  readonly maxMrp = signal('');
  readonly sort = signal<ProductSort>('Relevance');
  readonly draftBrandFilter = signal('All');
  readonly draftSizeFilter = signal('All');
  readonly draftMinMrp = signal('');
  readonly draftMaxMrp = signal('');
  readonly draftSort = signal<ProductSort>('Relevance');
  readonly advancedOpen = signal(false);
  readonly imageSearchPreview = signal('');
  readonly imageSearchMessage = signal('');
  readonly imageSearching = signal(false);
  /** Status tab: All / Active / Archived (staff catalogue view). */
  readonly statusFilter = signal<StatusFilter>('All');

  /** Product chosen to open the order modal, or null. */
  readonly orderProduct = signal<Product | null>(null);

  /** Product edit/add modal state. undefined = closed, null = add, Product = edit. */
  readonly editProduct = signal<Product | null | undefined>(undefined);

  readonly isCustomer = computed(() => this.role() === 'Customer');
  readonly customerCanOrder = this.appState.customerCanOrder;
  readonly isStaff = this.appState.isStaff;
  readonly isStaffOrdering = this.appState.isStaffOrdering;
  readonly canManage = computed(() => this.role() === 'Admin' || this.role() === 'Super Admin');
  readonly canManageProducts = computed(() => this.canManage() && this.appState.canAccessFeature('Products'));
  readonly canManagePrices = computed(() => this.canManage() && this.appState.canAccessFeature('Prices'));
  readonly canManagePhotos = computed(() => this.canManageProducts());
  readonly canTakePhotoOrder = computed(() => this.canManage() && this.appState.canAccessMenu('Photo Order'));
  readonly canCreateOrders = computed(() => this.isStaff() && this.appState.canAccessMenu('New Orders'));

  readonly orderableCustomers = computed(() => this.catalog.activeCustomers());

  /** Customer-picker modal (opened by "＋ Create order"). */
  readonly pickerOpen = signal(false);
  readonly pickerSearch = signal('');
  readonly featureableProducts = computed(() => this.catalog.products().filter((product) => product.active && !product.archived));
  readonly showcaseOpen = signal(false);
  readonly featuredIds = signal<number[]>([]);
  readonly schemeMessage = signal('');
  readonly showcaseBanners = signal<ShowcaseBanner[]>([]);
  readonly photoOrderOpen = signal(false);
  readonly photoCustomerId = signal(0);
  readonly photoDraft = signal<PhotoDraft[]>([]);
  readonly photoRequests = signal(this.photoOrders.list());
  readonly priceProduct = signal<Product | null>(null);
  readonly priceTiers: PriceTier[] = ['A', 'B', 'C'];
  readonly priceDraft = signal<Record<PriceTier, number>>({ A: 0, B: 0, C: 0 });
  readonly priceSaving = signal(false);
  readonly photoProduct = signal<Product | null>(null);
  readonly photoDraftImages = signal<ProductImage[]>([]);
  readonly photosSaving = signal(false);
  readonly supportsPhotoArchive = this.data.supportsPhotoArchive;

  readonly pickerResults = computed(() => {
    const term = this.pickerSearch().trim().toLowerCase();
    return this.orderableCustomers().filter((c) =>
      `${c.name} ${c.code} ${c.phone} ${c.loginId ?? ''}`.toLowerCase().includes(term),
    );
  });

  openPicker(): void {
    this.pickerSearch.set('');
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  chooseCustomer(id: number): void {
    this.appState.setStaffOrderCustomer(id);
    this.pickerOpen.set(false);
    const name = this.catalog.customerById(id)?.name ?? '';
    this.toast.show(`Choosing products for ${name}`);
  }

  startStaffOrder(customerId: string): void {
    const id = Number(customerId);
    if (id > 0) {
      this.appState.setStaffOrderCustomer(id);
    }
  }

  stopStaffOrder(): void {
    this.appState.clearStaffOrderCustomer();
  }

  /** The customer whose pricing applies to the current view. */
  readonly activeCustomer = computed<Customer | null>(() => {
    const id = this.appState.activeCustomerId();
    return id ? (this.catalog.customerById(id) ?? null) : null;
  });

  /** True when prices/order buttons should be customer-scoped. */
  readonly orderingMode = computed(() => this.isCustomer() || this.isStaffOrdering());

  readonly brandOptions = computed(() => ['All', ...this.brandService.brands().map((b) => b.name)]);
  readonly sizeOptions = computed(() => [
    'All',
    ...[...new Set(this.catalog.products().flatMap((product) => product.sizes ?? []))]
      .sort((a, b) => a - b)
      .map(String),
  ]);

  /** Counts shown on the status tabs. */
  readonly counts = computed(() => {
    const all = this.catalog.products();
    return {
      all: all.length,
      active: all.filter((p) => p.active && !p.archived).length,
      archived: all.filter((p) => p.archived).length,
      deactivated: all.filter((p) => !p.active && !p.archived).length,
    };
  });

  readonly filtered = computed<Product[]>(() => {
    const term = this.search().trim().toLowerCase();
    const brand = this.brandFilter();
    const status = this.statusFilter();
    const ordering = this.orderingMode();
    const customer = this.activeCustomer();
    const size = this.sizeFilter();
    const minimum = Number(this.minMrp());
    const maximum = Number(this.maxMrp());

    return this.catalog.products().filter((p) => {
      // Ordering views only ever show orderable products.
      if (ordering) {
        if (!isOrderableFor(p, customer)) {
          return false;
        }
      } else {
        // Staff catalogue: apply the status tab.
        if (status === 'Active' && (!p.active || p.archived)) {
          return false;
        }
        if (status === 'Archived' && !p.archived) {
          return false;
        }
        if (status === 'Deactivated' && (p.active || p.archived)) {
          return false;
        }
      }
      if (brand !== 'All' && p.brand !== brand) {
        return false;
      }
      if (size !== 'All' && !p.sizes.includes(Number(size))) return false;
      if (this.minMrp() !== '' && p.mrp < minimum) return false;
      if (this.maxMrp() !== '' && p.mrp > maximum) return false;
      const haystack = `${p.name} ${p.code} ${p.brand}`.toLowerCase();
      return haystack.includes(term);
    });
  });

  readonly results = computed(() => {
    const items = [...this.filtered()];
    switch (this.sort()) {
      case 'A–Z': return items.sort((a, b) => a.name.localeCompare(b.name));
      case 'MRP: low to high': return items.sort((a, b) => a.mrp - b.mrp);
      case 'MRP: high to low': return items.sort((a, b) => b.mrp - a.mrp);
      default: return items;
    }
  });

  readonly heading = computed(() => {
    if (this.isCustomer()) {
      return 'Shop products';
    }
    if (this.isStaffOrdering()) {
      return `Create order · ${this.activeCustomer()?.name ?? ''}`;
    }
    return 'Product catalogue';
  });

  ngOnInit(): void {
    this.catalog.load();
    this.brandService.load();
    const query = this.route.snapshot.queryParamMap;
    const startPhotoOrder = query.get('photoOrder') === '1';
    const startCreateOrder = query.get('createOrder') === '1';
    if (startPhotoOrder) {
      this.openPhotoOrder();
    } else if (startCreateOrder) {
      this.openPicker();
    }
    if (startPhotoOrder || startCreateOrder) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { photoOrder: null, createOrder: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    const brand = this.route.snapshot.queryParamMap.get('brand');
    if (brand) {
      this.brandFilter.set(brand);
      this.draftBrandFilter.set(brand);
    }
  }

  toggleAdvancedSearch(): void {
    this.advancedOpen.update((open) => !open);
  }

  retryCatalogLoad(): void {
    this.catalog.load(true);
    this.brandService.load(true);
  }

  applyAdvancedSearch(): void {
    this.brandFilter.set(this.draftBrandFilter());
    this.sizeFilter.set(this.draftSizeFilter());
    this.minMrp.set(this.draftMinMrp());
    this.maxMrp.set(this.draftMaxMrp());
    this.sort.set(this.draftSort());
  }

  openShowcase(): void {
    this.featuredIds.set([...this.showcase.featuredProductIds()]);
    this.schemeMessage.set(this.showcase.message());
    this.showcaseBanners.set(this.showcase.banners().map((banner) => ({ ...banner })));
    this.showcaseOpen.set(true);
  }

  closeShowcase(): void {
    this.showcaseOpen.set(false);
  }

  toggleFeatured(productId: number): void {
    this.featuredIds.update((ids) => ids.includes(productId)
      ? ids.filter((id) => id !== productId)
      : [...ids, productId]);
  }

  async addShowcaseBanners(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    let rejected = 0;
    for (const file of files) {
      if (this.showcaseBanners().length >= 8 || file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        rejected++;
        continue;
      }
      try {
        const src = await this.compressImage(file, 1500, 500, 0.77, true);
        this.showcaseBanners.update((banners) => [...banners, { name: file.name, src }]);
      } catch {
        rejected++;
      }
    }
    input.value = '';
    if (rejected) this.toast.show(`${rejected} banner photo(s) skipped; limit is 8, JPG/PNG/WebP, 8 MB each.`);
  }

  removeShowcaseBanner(index: number): void {
    this.showcaseBanners.update((banners) => banners.filter((_, i) => i !== index));
  }

  saveShowcase(): void {
    const saved = this.showcase.save({
      featuredProductIds: this.featuredIds(),
      message: this.schemeMessage(),
      banners: this.showcaseBanners(),
    });
    this.closeShowcase();
    this.toast.show(saved ? 'Featured products and scheme banners saved on this device.' : 'Settings updated, but browser storage is full. Remove a banner and try again.');
  }

  openPhotoOrder(): void {
    this.photoCustomerId.set(0);
    this.photoDraft.set([]);
    this.photoRequests.set(this.photoOrders.list());
    this.photoOrderOpen.set(true);
  }

  closePhotoOrder(): void {
    this.photoOrderOpen.set(false);
  }

  async addPhotoOrderFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    const invalidFiles = files.filter((file) => !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024);
    if (invalidFiles.length) {
      this.toast.error('Some files were skipped. Use images up to 8 MB each.');
    }
    if (files.length > 12 - this.photoDraft().length) {
      this.toast.error('A photo order can include up to 12 photos.');
    }
    for (const file of files) {
      if (this.photoDraft().length >= 12) break;
      if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) continue;
      try {
        const src = await this.compressImage(file, 1280, 1280, 0.76, false);
        this.photoDraft.update((items) => [...items, { name: file.name, caption: '', src }]);
      } catch {
        this.toast.error(`Could not read ${file.name}.`);
      }
    }
    input.value = '';
  }

  setPhotoCaption(index: number, caption: string): void {
    this.photoDraft.update((items) => items.map((item, i) => i === index ? { ...item, caption } : item));
  }

  removePhotoDraft(index: number): void {
    this.photoDraft.update((items) => items.filter((_, i) => i !== index));
  }

  submitPhotoOrder(): void {
    const customer = this.catalog.customerById(this.photoCustomerId());
    const photos = this.photoDraft();
    if (!customer?.active) {
      this.toast.error('Choose an active customer.');
      return;
    }
    if (!photos.length || photos.some((photo) => !photo.caption.trim())) {
      this.toast.error('Add at least one photo and enter a caption for each photo.');
      return;
    }
    const id = this.photoOrders.create(customer.id, customer.name, photos.map((photo) => ({ ...photo, caption: photo.caption.trim() })));
    if (!id) {
      this.toast.error('Could not save the photo order. Browser storage may be full.');
      return;
    }
    this.photoRequests.set(this.photoOrders.list());
    this.photoDraft.set([]);
    this.photoCustomerId.set(0);
    this.toast.success(`Photo order ${id} saved for ${customer.name}.`);
  }

  formatPhotoDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  private compressImage(file: File, maxWidth: number, maxHeight: number, quality: number, crop: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Invalid image'));
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = maxWidth;
          canvas.height = maxHeight;
          const context = canvas.getContext('2d');
          if (!context) return reject(new Error('Canvas unavailable'));
          context.fillStyle = '#fff';
          context.fillRect(0, 0, maxWidth, maxHeight);
          const ratio = crop
            ? Math.max(maxWidth / image.width, maxHeight / image.height)
            : Math.min(maxWidth / image.width, maxHeight / image.height, 1);
          const width = image.width * ratio;
          const height = image.height * ratio;
          context.drawImage(image, (maxWidth - width) / 2, (maxHeight - height) / 2, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  priceLabel(product: Product): string {
    if (this.orderingMode()) {
      const price = priceFor(product, this.activeCustomer());
      return price ? money(price) : 'Not assigned';
    }
    const cp = product.categoryPrices;
    return `A ${money(cp.A)} · B ${money(cp.B)} · C ${money(cp.C)}`;
  }

  imageSrc(product: Product): string | null {
    return activeImageSrc(product);
  }

  statusLabel(product: Product): string {
    if (product.archived) return 'ARCHIVED';
    return product.active ? 'ACTIVE' : 'DEACTIVATED';
  }

  showOrderButton(): boolean {
    return this.orderingMode() && (!this.isCustomer() || this.customerCanOrder());
  }

  openOrder(product: Product): void {
    if (this.isCustomer() && !this.customerCanOrder()) {
      this.toast.error('Ordering is disabled for this account. Contact your account manager.');
      return;
    }
    const customer = this.activeCustomer();
    if (!customer) {
      this.toast.show('No customer context — please sign in again or pick a customer.');
      return;
    }
    if (!isOrderableFor(product, customer)) {
      this.toast.show('Product unavailable or price not assigned for this customer');
      return;
    }
    this.orderProduct.set(product);
  }

  closeOrder(): void {
    this.orderProduct.set(null);
  }

  onAdded(): void {
    this.orderProduct.set(null);
    this.toast.show(this.isCustomer() ? 'Added to your basket' : 'Added to order draft');
  }

  money = money;

  goToBasket(): void {
    if (this.isCustomer() && !this.customerCanOrder()) {
      this.toast.error('Ordering is disabled for this account.');
      return;
    }
    this.router.navigate(['/app', 'basket']);
  }

  // ---- Product management (Admin / Super Admin) -----------------------
  openAdd(): void {
    this.editProduct.set(null);
    this.toast.show('Opening add-product form…');
  }

  openEdit(product: Product): void {
    this.editProduct.set(product);
    this.toast.show('Opening editor…');
  }

  openPriceManager(product: Product): void {
    this.priceProduct.set(product);
    this.priceDraft.set({ ...product.categoryPrices });
  }

  closePriceManager(): void {
    this.priceProduct.set(null);
  }

  setPrice(tier: PriceTier, value: string): void {
    const price = Number(value);
    this.priceDraft.update((prices) => ({ ...prices, [tier]: Number.isFinite(price) ? price : 0 }));
  }

  savePrices(): void {
    const product = this.priceProduct();
    if (!product) return;
    this.priceSaving.set(true);
    this.catalog.saveProduct({ ...product, categoryPrices: this.priceDraft() }).subscribe({
      next: () => {
        this.priceSaving.set(false);
        this.closePriceManager();
        this.toast.success('Category prices updated successfully.');
      },
      error: () => {
        this.priceSaving.set(false);
        this.toast.error('Could not update category prices.');
      },
    });
  }

  openPhotoManager(product: Product): void {
    this.photoProduct.set(product);
    this.photoDraftImages.set((product.images ?? []).map((image) => ({ ...image })));
  }

  closePhotoManager(): void {
    this.photoProduct.set(null);
  }

  togglePhoto(index: number): void {
    if (!this.supportsPhotoArchive) return;
    this.photoDraftImages.update((images) => images.map((image, i) =>
      i === index ? { ...image, active: !image.active } : image,
    ));
  }

  async addProductPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const src = await this.readImageFile(file);
        this.photoDraftImages.update((images) => [...images, { name: file.name, active: true, src }]);
      } catch {
        this.toast.error(`Could not read ${file.name}.`);
      }
    }
    input.value = '';
  }

  savePhotoChanges(): void {
    const product = this.photoProduct();
    if (!product) return;
    this.photosSaving.set(true);
    this.catalog.saveProduct({ ...product, images: this.photoDraftImages() }).subscribe({
      next: () => {
        this.photosSaving.set(false);
        this.closePhotoManager();
        this.toast.success('Product photos updated successfully.');
      },
      error: () => {
        this.photosSaving.set(false);
        this.toast.error('Could not save product photos.');
      },
    });
  }

  removeDraftPhoto(index: number): void {
    this.photoDraftImages.update((images) => images.filter((_, i) => i !== index));
  }

  closeEdit(): void {
    this.editProduct.set(undefined);
  }

  onProductSaved(): void {
    this.editProduct.set(undefined);
  }

  toggleArchive(product: Product): void {
    this.dataArchive(product).subscribe({
      next: (saved) =>
        this.toast.success(saved.archived ? 'Product archived successfully.' : 'Product restored successfully.'),
      error: () => this.toast.error('Could not update the product.'),
    });
  }

  toggleActive(product: Product): void {
    this.catalog.setProductActive(product.id, !product.active).subscribe({
      next: (saved) => this.toast.success(saved.active ? 'Product activated successfully.' : 'Product deactivated successfully.'),
      error: () => this.toast.error('Could not update product status.'),
    });
  }

  deleteProductPhoto(product: Product, photo: ProductImage): void {
    if (!photo.id || !window.confirm('Delete photo "' + photo.name + '" from ' + product.name + '? This cannot be undone.')) return;
    this.catalog.deleteProductPhoto(product.id, photo.id).subscribe({
      next: (saved) => {
        this.photoProduct.set(saved);
        this.photoDraftImages.set((saved.images ?? []).map((image) => ({ ...image })));
        this.toast.success('Product photo deleted successfully.');
      },
      error: () => this.toast.error('Could not delete the product photo.'),
    });
  }

  async searchByPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.imageSearching.set(true);
    this.imageSearchMessage.set('Comparing this photo with saved product photos…');
    try {
      const preview = await this.readImageFile(file);
      this.imageSearchPreview.set(preview);
      const target = await this.imageSignature(preview);
      let best: { product: Product; score: number } | null = null;
      for (const product of this.catalog.products()) {
        for (const image of (product.images ?? []).filter((item) => item.active && item.src)) {
          const signature = await this.imageSignature(image.src);
          const score = this.signatureSimilarity(target, signature);
          if (!best || score > best.score) best = { product, score };
        }
      }
      if (best && best.score >= 0.76) {
        this.search.set(best.product.name);
        this.brandFilter.set('All');
        this.draftBrandFilter.set('All');
        this.statusFilter.set('All');
        this.sizeFilter.set('All');
        this.draftSizeFilter.set('All');
        this.minMrp.set('');
        this.draftMinMrp.set('');
        this.maxMrp.set('');
        this.draftMaxMrp.set('');
        this.imageSearchMessage.set(`Closest visual match: ${best.product.name} · ${best.product.code}. Check the result before editing.`);
      } else {
        this.search.set('');
        this.brandFilter.set('All');
        this.draftBrandFilter.set('All');
        this.statusFilter.set('All');
        this.sizeFilter.set('All');
        this.draftSizeFilter.set('All');
        this.minMrp.set('');
        this.draftMinMrp.set('');
        this.maxMrp.set('');
        this.draftMaxMrp.set('');
        this.imageSearchMessage.set(best
          ? 'No reliable visual match. Compare the products shown below.'
          : 'No saved product photos are available for visual matching yet.');
      }
    } catch {
      this.search.set('');
      this.brandFilter.set('All');
      this.draftBrandFilter.set('All');
      this.statusFilter.set('All');
      this.sizeFilter.set('All');
      this.draftSizeFilter.set('All');
      this.minMrp.set('');
      this.draftMinMrp.set('');
      this.maxMrp.set('');
      this.draftMaxMrp.set('');
      this.imageSearchMessage.set('Photo selected. Visual matching was unavailable; compare the catalogue manually.');
    } finally {
      this.imageSearching.set(false);
      input.value = '';
    }
  }

  resetAdvancedSearch(): void {
    this.brandFilter.set('All');
    this.draftBrandFilter.set('All');
    this.sizeFilter.set('All');
    this.draftSizeFilter.set('All');
    this.minMrp.set('');
    this.draftMinMrp.set('');
    this.maxMrp.set('');
    this.draftMaxMrp.set('');
    this.sort.set('Relevance');
    this.draftSort.set('Relevance');
    this.search.set('');
    this.statusFilter.set('All');
    this.imageSearchPreview.set('');
    this.imageSearchMessage.set('');
  }

  private readImageFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private imageSignature(src: string): Promise<Uint8ClampedArray | null> {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 8;
          canvas.height = 8;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) return resolve(null);
          context.drawImage(image, 0, 0, 8, 8);
          resolve(context.getImageData(0, 0, 8, 8).data);
        } catch {
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  private signatureSimilarity(a: Uint8ClampedArray | null, b: Uint8ClampedArray | null): number {
    if (!a || !b || a.length !== b.length) return 0;
    let difference = 0;
    for (let i = 0; i < a.length; i += 4) {
      difference += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return 1 - difference / (a.length / 4 * 3 * 255);
  }

  private dataArchive(product: Product) {
    return this.catalog.setProductArchived(product.id, !product.archived);
  }

  photoCount(product: Product): number {
    return (product.images ?? []).length;
  }

  hasPhoto(product: Product): boolean {
    return hasActiveImage(product);
  }
}
