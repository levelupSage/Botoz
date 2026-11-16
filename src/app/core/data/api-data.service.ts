import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  EMPTY,
  Observable,
  catchError,
  concatMap,
  defer,
  expand,
  forkJoin,
  from,
  map,
  of,
  switchMap,
  tap,
  throwError,
  toArray,
} from 'rxjs';
import {
  AuthUser,
  Brand,
  Customer,
  LoginCredentials,
  LoginResult,
  RegisterAccountRequest,
  RegistrationMenuOption,
  Order,
  OrderItem,
  OrderStatus,
  Packing,
  Product,
  ProductImage,
  ProductSizeGroup,
  Staff,
  UserRole,
} from '../models';
import { DataService } from './data.service';
import { environment } from '../../../environments/environment';

type Json = Record<string, unknown>;

interface ApiPage<T> {
  items: T[];
  page: number;
  last: boolean;
}

interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

@Injectable()
export class ApiDataService extends DataService {
  readonly supportsOrderStatusUpdate = false;
  readonly supportsProductPriceOverrides = false;
  readonly supportsPhotoArchive = false;

  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
  private readonly brandByName = new Map<string, number>();
  private readonly brandById = new Map<number, string>();
  private readonly stationByName = new Map<string, number>();
  private readonly productPackingIds = new Map<number, Set<number>>();
  private readonly productSizes = new Map<number, Set<number>>();
  private readonly productGroupSizes = new Map<number, Map<number, Set<number>>>();
  private readonly productGroupNames = new Map<number, Map<number, string>>();

  // ---- Authentication ------------------------------------------------
  login(credentials: LoginCredentials): Observable<LoginResult> {
    return this.request<Json>(this.http
      .post<ApiEnvelope<Json>>(`${this.baseUrl}/api/auth/login`, {
        usernameOrEmail: credentials.email.trim(),
        password: credentials.password,
      }))
      .pipe(
        map((result) => {
          const rawUser = this.asJson(result['user'] ?? result['userDetails'] ?? result);
          const rawMenus = rawUser['menus'] ?? rawUser['allowedMenus'] ?? rawUser['allowedFeatures'];
          const menuNames = this.menuNames(rawMenus);
          // The API returns an empty list for accounts using role defaults.
          const menus = menuNames?.length ? menuNames : undefined;
          const role = this.mapRole(this.text(rawUser['role']) || this.text(rawUser['roleName']), menus ?? []);
          const user: AuthUser = {
            id: this.number(rawUser['id'] ?? rawUser['userId']),
            name: this.text(rawUser['fullName']) || this.text(rawUser['loginId']),
            email: this.text(rawUser['email']) || this.text(rawUser['loginId']),
            role,
            ...(menus !== undefined ? { menus } : {}),
            orderTabs: this.stringArray(rawUser['orderTabs'] ?? rawUser['allowedOrderTabs']),
            // The published UserDTO has no customerId; it currently assumes the ids align.
            ...(role === 'Customer'
              ? { customerId: this.number(rawUser['customerId']) || this.number(rawUser['id']) }
              : {}),
          };
          const token = this.text(result['accessToken']) || this.text(result['token']);
          if (!token) throw new Error('The API login response did not include an access token.');
          return {
            user,
            token,
            refreshToken: this.text(result['refreshToken']),
          };
        }),
      );
  }

  getRegistrationMenuOptions(): Observable<RegistrationMenuOption[]> {
    return this.request<unknown>(this.http.get(`${this.baseUrl}/api/auth/menu-options`)).pipe(
      map((value) => Array.isArray(value) ? value.map((item) => {
        const row = this.asJson(item);
        const tabs = Array.isArray(row['tabs']) ? row['tabs'] : [];
        return {
          id: this.number(row['id']),
          title: this.text(row['title']),
          routePath: this.text(row['routePath']),
          icon: this.text(row['icon']),
          displayOrder: this.number(row['displayOrder']),
          hasTab: row['hasTab'] === true,
          tabs: tabs.map((tab) => {
            const tabRow = this.asJson(tab);
            return {
              id: this.number(tabRow['id']),
              title: this.text(tabRow['title']),
              routePath: this.text(tabRow['routePath']),
              displayOrder: this.number(tabRow['displayOrder']),
            };
          }),
        };
      }).sort((a, b) => a.displayOrder - b.displayOrder) : []),
    );
  }

  registerAccount(request: RegisterAccountRequest): Observable<void> {
    return this.request<unknown>(this.http.post(`${this.baseUrl}/api/auth/register`, request)).pipe(
      map(() => undefined),
    );
  }

  // ---- Brands ---------------------------------------------------------
  getBrands(): Observable<Brand[]> {
    return this.paged<Json>('/api/admin/brands', {}, ['brands']).pipe(
      map((rows) => rows.map((row) => this.toBrand(row))),
      tap((brands) => this.rememberBrands(brands)),
    );
  }

  saveBrand(brand: Brand): Observable<Brand> {
    if (!brand.id) {
      return this.request<Json>(this.http.post(`${this.baseUrl}/api/admin/brands`, { name: brand.name })).pipe(
        map((body) => {
          const saved = this.toBrand(body, brand);
          if (!saved.id) throw new Error('The API brand response did not include its ID.');
          return saved;
        }),
        tap((saved) => this.rememberBrands([saved])),
      );
    }

    const oldName = this.brandById.get(brand.id);
    const rename$: Observable<unknown> = oldName && oldName !== brand.name
      ? this.request<Json>(this.http.patch(`${this.baseUrl}/api/admin/brands/${brand.id}/name`, { name: brand.name }))
      : of(null);

    return rename$.pipe(
      switchMap(() =>
        this.request<Json>(
          this.http.patch(`${this.baseUrl}/api/admin/brands/${brand.id}/status`, { active: brand.active }),
        ).pipe(map((body) => this.toBrand(body, brand))),
      ),
      tap((saved) => this.rememberBrands([saved])),
    );
  }

  setBrandSizeLock(brand: Brand, locked: boolean): Observable<Brand> {
    return this.request<Json>(this.http.patch(
      `${this.baseUrl}/api/admin/brands/${brand.id}/size-lock`,
      { locked },
    )).pipe(map((body) => this.toBrand(body, { ...brand, sizeLocked: locked })));
  }

  uploadBrandLogo(brand: Brand, file: File): Observable<Brand> {
    const form = new FormData();
    form.append('file', file);
    return this.request<Json>(this.http.post(
      `${this.baseUrl}/api/admin/brands/${brand.id}/logo`,
      form,
    )).pipe(map((body) => this.toBrand(body, brand)));
  }

  // ---- Products -------------------------------------------------------
  getProducts(): Observable<Product[]> {
    return this.paged<Json>('/api/admin/products', { status: 'ALL' }).pipe(
      map((rows) => rows.map((row) => this.toProduct(row))),
    );
  }

  saveProduct(product: Product): Observable<Product> {
    return this.ensurePackingGroups(product).pipe(
      switchMap((packings) => {
        const body = this.productRequest(product, packings);
        const request = product.id
          ? this.http.put<ApiEnvelope<Json>>(`${this.baseUrl}/api/admin/products/${product.id}`, body)
          : this.http.post<ApiEnvelope<Json>>(`${this.baseUrl}/api/admin/products`, body);

        return this.request<Json>(request).pipe(
          map((saved) => this.toProduct(saved)),
          switchMap((saved) => {
          const cartonSaves = packings.filter((packing) => packing.rows.some((row) => row.pairs > 0)).map((packing) =>
              this.request<Json>(
                this.http.put(
                  `${this.baseUrl}/api/admin/products/${saved.id}/packing-groups/${packing.id}/carton-packing`,
                  { pairsPerCarton: Object.fromEntries(packing.rows.map((row) => [String(row.size), row.pairs])) },
                ),
              ),
            );
            return (cartonSaves.length ? forkJoin(cartonSaves) : of([])).pipe(
              switchMap(() => this.uploadNewPhotos(saved.id, product.images)),
              map((updated) => updated ? this.toProduct(updated) : saved),
            );
          }),
        );
      }),
    );
  }

  setProductArchived(id: number, archived: boolean): Observable<Product> {
    return this.request<Json>(
      this.http.patch(`${this.baseUrl}/api/admin/products/${id}/archive`, { archived }),
    ).pipe(map((body) => this.toProduct(body)));
  }

  setProductActive(id: number, active: boolean): Observable<Product> {
    return this.request<Json>(
      this.http.patch(`${this.baseUrl}/api/admin/products/${id}/status`, { active }),
    ).pipe(map((body) => this.toProduct(body)));
  }

  deleteProductPhoto(productId: number, photoId: number): Observable<Product> {
    return this.request<Json>(
      this.http.delete(`${this.baseUrl}/api/admin/products/${productId}/photos/${photoId}`),
    ).pipe(map((body) => this.toProduct(body)));
  }

  // ---- Customers ------------------------------------------------------
  getCustomers(): Observable<Customer[]> {
    return this.paged<Json>('/api/admin/customers', { status: 'ALL' }, ['customers']).pipe(
      switchMap((rows) =>
        this.request<Json>(this.http.get(`${this.baseUrl}/api/admin/customers/options`)).pipe(
          tap((options) => {
            const stations = Array.isArray(options['stations']) ? options['stations'] : [];
            for (const item of stations) {
              const station = this.asJson(item);
              this.stationByName.set(this.text(station['name']).toLowerCase(), this.number(station['id']));
            }
          }),
          map(() => rows.map((row) => this.toCustomer(row))),
        ),
      ),
    );
  }

  getCustomer(id: number): Observable<Customer> {
    return this.request<Json>(this.http.get(`${this.baseUrl}/api/admin/customers/${id}`)).pipe(
      map((body) => this.toCustomer(body)),
    );
  }

  saveCustomer(customer: Customer): Observable<Customer> {
    if (Object.keys(customer.overrides ?? {}).length) {
      return throwError(() => new Error('The API does not support per-product customer price overrides yet.'));
    }
    return this.resolveStationId(customer).pipe(
      switchMap((stationId) => {
        const body = this.customerRequest(customer, stationId);
        const url = customer.id
          ? `${this.baseUrl}/api/admin/customers/${customer.id}`
          : `${this.baseUrl}/api/admin/customers`;
        const request = customer.id ? this.http.put<ApiEnvelope<Json>>(url, body) : this.http.post<ApiEnvelope<Json>>(url, body);
        return this.request<Json>(request).pipe(
          map((result) => this.toCustomer(result)),
          switchMap((saved) => {
            if (saved.active === customer.active) return of(saved);
            return this.request<Json>(
              this.http.patch(`${this.baseUrl}/api/admin/customers/${saved.id}/status`, { active: customer.active }),
            ).pipe(map((result) => this.toCustomer(result, saved)));
          }),
        );
      }),
    );
  }

  // ---- Staff ----------------------------------------------------------
  getStaff(): Observable<Staff[]> {
    return this.paged<Json>('/api/admin/staff', {}, ['accounts']).pipe(
      map((rows) => rows.map((row) => ({
        id: this.number(row['id']),
        name: this.text(row['fullName']),
        loginId: this.text(row['loginId']),
        email: this.text(row['email']),
        role: this.mapRole(this.text(row['role'])),
        permissions: this.stringArray(row['allowedFeatures']),
        active: this.text(row['status']).toUpperCase() === 'ACTIVE',
      }))),
    );
  }

  updateStaffAccount(staff: Staff, password: string): Observable<Staff> {
    return this.request<Json>(this.http.put(
      `${this.baseUrl}/api/admin/staff/${staff.id}`,
      {
        fullName: staff.name,
        email: staff.email,
        loginId: staff.loginId,
        password,
        status: staff.active ? 'ACTIVE' : 'INACTIVE',
      },
    )).pipe(map((row) => {
      const result = this.asJson(row);
      return {
        id: this.number(result['id']) || staff.id,
        name: this.text(result['fullName']) || staff.name,
        loginId: this.text(result['loginId']) || staff.loginId,
        email: this.text(result['email']) || staff.email,
        role: this.mapRole(this.text(result['role']) || staff.role),
        permissions: this.stringArray(result['allowedFeatures']).length
          ? this.stringArray(result['allowedFeatures']) : staff.permissions,
        active: this.text(result['status'])
          ? this.text(result['status']).toUpperCase() === 'ACTIVE' : staff.active,
      };
    }));
  }

  // ---- Orders ---------------------------------------------------------
  getOrders(): Observable<Order[]> {
    return this.paged<Json>('/api/admin/orders').pipe(map((rows) => rows.map((row) => this.toOrder(row))));
  }

  createOrder(order: Order): Observable<Order> {
    if (order.items.some((item) => item.mode === 'carton' && !item.packingGroupId)) {
      return throwError(() => new Error('Carton order is missing the API packing-group ID. Please reopen the product and add it again.'));
    }
    const request = {
      customerId: order.customerId,
      lines: order.items.map((item) => ({
        productId: item.productId,
        orderType: item.mode === 'carton' ? 'CARTON_WISE' : 'SIZE_WISE',
        ...(item.mode === 'carton'
          ? { packingGroupId: item.packingGroupId, numberOfCartons: item.cartons }
          : {}),
        quantities: Object.fromEntries(item.rows.map((row) => [String(row.size), row.qty])),
        // The current UI has customer display prices but no separate admin rate field.
        adminRatePerPair: 0,
      })),
    };
    return this.request<Json>(this.http.post(`${this.baseUrl}/api/admin/orders`, request)).pipe(
      map((body) => this.toOrder(body, order)),
    );
  }

  updateOrderStatus(_orderId: string, _status: OrderStatus): Observable<Order> {
    return throwError(() => new Error('The API spec does not provide an order status update endpoint.'));
  }

  /** Order IDs are generated by the API as part of POST /api/admin/orders. */
  nextOrderId(): Observable<string> {
    return of('');
  }

  // ---- API request helpers -------------------------------------------
  private request<T>(request: Observable<unknown>): Observable<T> {
    return request.pipe(
      map((response) => this.data<T>(response)),
      catchError((error: unknown) => throwError(() => this.apiError(error))),
    );
  }

  private data<T>(response: unknown): T {
    const record = this.asJson(response);
    if (record['success'] === false) {
      throw new Error(this.text(record['message']) || 'The API request failed.');
    }
    return (Object.prototype.hasOwnProperty.call(record, 'data') ? record['data'] : response) as T;
  }

  private paged<T>(path: string, filters: Record<string, string> = {}, nestedKeys: string[] = []): Observable<T[]> {
    const pageSize = 100;
    const loadPage = (page: number): Observable<ApiPage<T>> => {
      let params = new HttpParams().set('page', page).set('size', pageSize);
      for (const [key, value] of Object.entries(filters)) params = params.set(key, value);
      return this.request<unknown>(this.http.get(`${this.baseUrl}${path}`, { params })).pipe(
        map((payload) => {
          for (const key of nestedKeys) payload = this.asJson(payload)[key] ?? payload;
          if (Array.isArray(payload)) return { items: payload as T[], page, last: true };
          const result = this.asJson(payload);
          const items = Array.isArray(result['content']) ? result['content'] as T[] : [];
          const totalPages = this.number(result['totalPages']);
          const last = typeof result['last'] === 'boolean'
            ? result['last'] as boolean
            : totalPages > 0 ? page + 1 >= totalPages : items.length < pageSize;
          return { items, page, last };
        }),
      );
    };
    return loadPage(0).pipe(
      expand((result) => result.last ? EMPTY : loadPage(result.page + 1)),
      // Each page is bounded by the API's documented maximum of 100 records.
      switchMap((page) => of(page.items)),
      // Flatten pages after pagination has completed.
      toArray(),
      map((pages) => pages.flat()),
    );
  }

  private ensurePackingGroups(product: Product): Observable<Packing[]> {
    const known = this.productPackingIds.get(product.id) ?? new Set<number>();
    const requestedSizes = new Set(product.sizes);
    const knownSizes = this.productSizes.get(product.id) ?? new Set<number>();
    if ([...knownSizes].some((size) => !requestedSizes.has(size))) {
      return throwError(() => new Error('This API shares size groups across products; removing an existing size needs a group management change.'));
    }
    const retainedGroupIds = new Set(product.packingGroupIds ?? known);
    const assignedSizes = new Set<number>();
    const groupSizes = this.productGroupSizes.get(product.id);
    const groupNames = this.productGroupNames.get(product.id);
    for (const groupId of retainedGroupIds) {
      for (const size of groupSizes?.get(groupId) ?? []) assignedSizes.add(size);
    }
    for (const packing of product.packings ?? []) {
      for (const row of packing.rows) assignedSizes.add(row.size);
    }
    const unassignedSizes = product.sizes.filter((size) => !assignedSizes.has(size));
    const requestedPackings: Packing[] = [
      ...(product.packings ?? []),
      ...(unassignedSizes.length ? [{
        id: 0,
        name: 'Size-wise sizes',
        active: true,
        rows: unassignedSizes.map((size) => ({ size, pairs: 0 })),
      }] : []),
    ];
    return from(requestedPackings).pipe(
      concatMap((packing) => {
        if (packing.id && known.has(packing.id)) {
          const oldSizes = [...(groupSizes?.get(packing.id) ?? [])].sort((a, b) => a - b);
          const newSizes = packing.rows.map((row) => row.size).sort((a, b) => a - b);
          const unchanged = groupNames?.get(packing.id) === packing.name &&
            oldSizes.length === newSizes.length &&
            oldSizes.every((size, index) => size === newSizes[index]);
          if (unchanged) return of(packing);

          // Packing groups are shared records, so edits must use their own API endpoint.
          return this.request<Json>(this.http.put(
            `${this.baseUrl}/api/admin/packing-groups/${packing.id}`,
            { name: packing.name, sizes: newSizes.map(String) },
          )).pipe(map(() => packing));
        }
        return this.request<Json>(
          this.http.post(`${this.baseUrl}/api/admin/packing-groups`, {
            name: packing.name,
            sizes: packing.rows.map((row) => String(row.size)),
          }),
        ).pipe(
          map((body) => {
            const id = this.number(body['id']);
            if (!id) throw new Error(`Could not create packing group "${packing.name}".`);
            return { ...packing, id };
          }),
        );
      }),
      toArray(),
    );
  }

  private productRequest(product: Product, packings: Packing[]): Json {
    const brandId = this.brandByName.get(product.brand.toLowerCase());
    if (!brandId) throw new Error(`Brand "${product.brand}" is missing from the API brand list.`);
    return {
      name: product.name,
      code: product.code,
      brandId,
      mrp: product.mrp,
      priceA: product.categoryPrices.A || undefined,
      priceB: product.categoryPrices.B || undefined,
      priceC: product.categoryPrices.C || undefined,
      active: product.active,
      packingGroupIds: [...new Set([...(product.packingGroupIds ?? []), ...packings.map((packing) => packing.id)])],
      enabledPackingGroupIds: [...new Set([
        ...(product.enabledPackingGroupIds ?? []),
        ...packings.filter((packing) => packing.active !== false).map((packing) => packing.id),
      ])],
    };
  }

  private uploadNewPhotos(productId: number, images: Product['images']): Observable<Json | null> {
    const uploads = (images ?? []).filter((image) => image.src.startsWith('data:image/'));
    if (!uploads.length) return of(null);
    const batches: Product['images'][] = [];
    for (let index = 0; index < uploads.length; index += 10) {
      batches.push(uploads.slice(index, index + 10));
    }

    return from(batches).pipe(
      concatMap((batch) => defer(() => from(Promise.all(batch.map(async (image) => {
        const blob = await (await fetch(image.src)).blob();
        return new File([blob], image.name || 'product-photo', { type: blob.type });
      })))).pipe(
        switchMap((files) => {
          const form = new FormData();
          for (const file of files) form.append('files', file, file.name);
          return this.request<Json>(
            this.http.post(`${this.baseUrl}/api/admin/products/${productId}/photos`, form),
          );
        }),
      )),
      toArray(),
      map((responses) => responses.at(-1) ?? null),
    );
  }

  private resolveStationId(customer: Customer): Observable<number> {
    if (customer.stationId) return of(customer.stationId);
    const known = this.stationByName.get((customer.station ?? '').toLowerCase());
    if (known) return of(known);
    if (!customer.station?.trim()) return throwError(() => new Error('Choose a station before saving the customer.'));
    return this.request<Json>(this.http.post(`${this.baseUrl}/api/admin/stations`, { name: customer.station.trim() })).pipe(
      map((station) => {
        const id = this.number(station['id']);
        if (!id) throw new Error('The API did not return the created station ID.');
        this.stationByName.set(customer.station!.toLowerCase(), id);
        return id;
      }),
    );
  }

  private customerRequest(customer: Customer, stationId: number): Json {
    const password = customer.loginPassword?.trim();
    if (!password) throw new Error('Enter a password; the API requires it when saving a customer.');
    const brandDiscounts = Object.entries(customer.brandDiscounts ?? []).flatMap(([name, discountPercent]) => {
      const brandId = this.brandByName.get(name.toLowerCase());
      return brandId && discountPercent > 0 ? [{ brandId, discountPercent, lockSize: false }] : [];
    });
    return {
      businessName: customer.name,
      loginId: customer.loginId || customer.code,
      password,
      stationId,
      priceCategory: customer.category,
      whatsappNumber: customer.whatsapp || customer.phone,
      phoneNumber: customer.phone,
      email: customer.email,
      contactPerson: customer.contact,
      shippingAddress: customer.address,
      weeklyReminderDay: (customer.reminderDay || 'Tuesday').toUpperCase(),
      brandDiscounts,
    };
  }

  // ---- DTO mapping ----------------------------------------------------
  private toBrand(value: unknown, fallback?: Brand): Brand {
    const row = this.asJson(value);
    const id = this.number(row['id']) || fallback?.id || 0;
    const name = this.text(row['name']) || this.text(row['brandName']) || fallback?.name || '';
    const logoPath = this.text(row['logoUrl']) || this.text(row['logo']) || this.text(row['imageUrl']) || fallback?.logoUrl || '';
    return {
      id,
      name,
      active: typeof row['active'] === 'boolean' ? row['active'] : this.text(row['status']).toUpperCase() !== 'INACTIVE',
      ...(logoPath ? { logoUrl: this.absoluteUrl(logoPath) } : {}),
      ...(typeof row['sizeLocked'] === 'boolean' ? { sizeLocked: row['sizeLocked'] } :
        typeof row['lockSize'] === 'boolean' ? { sizeLocked: row['lockSize'] } :
          typeof fallback?.sizeLocked === 'boolean' ? { sizeLocked: fallback.sizeLocked } : {}),
    };
  }

  private toProduct(value: unknown): Product {
    const row = this.asJson(value);
    const id = this.number(row['id']);
    const brandId = this.number(row['brandId']);
    const brand = this.text(row['brandName']) || this.brandById.get(brandId) || '';
    if (brandId && brand) {
      this.brandById.set(brandId, brand);
      this.brandByName.set(brand.toLowerCase(), brandId);
    }
    const groupRows = Array.isArray(row['packingGroups']) ? row['packingGroups'] : [];
    const groupSizeMap = new Map<number, Set<number>>();
    const groupNameMap = new Map<number, string>();
    const sizeGroups: ProductSizeGroup[] = groupRows.map((item) => {
      const group = this.asJson(item);
      groupNameMap.set(this.number(group['id']), this.text(group['name']));
      const sizes = Array.isArray(group['sizes']) ? group['sizes'] : [];
      return {
        id: this.number(group['id']),
        name: this.text(group['name']),
        active: group['enabled'] !== false,
        sizes: sizes.map((sizeRow) => this.number(this.asJson(sizeRow)['size']))
          .filter((size) => Number.isFinite(size) && size > 0),
      };
    });
    const packings: Packing[] = groupRows.map((item) => {
      const group = this.asJson(item);
          const rows = Array.isArray(group['sizes']) ? group['sizes'] : [];
      return {
        id: this.number(group['id']),
        name: this.text(group['name']),
        active: group['enabled'] !== false,
        rows: rows.map((sizeRow) => {
          const r = this.asJson(sizeRow);
          return { size: Number(r['size']), pairs: this.number(r['pairsPerCarton']) };
        }).filter((r) => Number.isFinite(r.size) && r.size > 0),
      };
    }).filter((packing) => packing.rows.some((row) => row.pairs > 0));
    const sizeValues = new Set<number>();
    for (const item of groupRows) {
      const sizes = this.asJson(item)['sizes'];
      if (!Array.isArray(sizes)) continue;
      const groupId = this.number(this.asJson(item)['id']);
      const groupSet = new Set<number>();
      for (const sizeRow of sizes) {
        const parsed = Number(this.asJson(sizeRow)['size']);
        if (Number.isFinite(parsed) && parsed > 0) {
          sizeValues.add(parsed);
          groupSet.add(parsed);
        }
      }
      groupSizeMap.set(groupId, groupSet);
    }
    this.productPackingIds.set(id, new Set(groupRows.map((item) => this.number(this.asJson(item)['id']))));
    this.productSizes.set(id, sizeValues);
    this.productGroupSizes.set(id, groupSizeMap);
    this.productGroupNames.set(id, groupNameMap);
    const photos = Array.isArray(row['photos']) ? row['photos'] : [];
    const images: ProductImage[] = photos.map((photo) => {
      const p = this.asJson(photo);
      return {
        id: this.number(p['id']),
        name: `Photo ${this.number(p['id']) || ''}`.trim(),
        active: true,
        src: this.absoluteUrl(this.text(p['url'])),
      };
    });
    if (!images.length && this.text(row['coverPhotoUrl'])) {
      images.push({ name: 'Product photo', active: true, src: this.absoluteUrl(this.text(row['coverPhotoUrl'])) });
    }
    return {
      id,
      brand,
      code: this.text(row['code']),
      name: this.text(row['name']),
      category: '',
      mrp: this.number(row['mrp']),
      categoryPrices: { A: this.number(row['priceA']), B: this.number(row['priceB']), C: this.number(row['priceC']) },
      active: row['active'] !== false,
      archived: row['archived'] === true,
      images,
      sizes: [...sizeValues].sort((a, b) => a - b),
      packings,
      packingGroupIds: groupRows.map((item) => this.number(this.asJson(item)['id'])),
      enabledPackingGroupIds: groupRows
        .filter((item) => this.asJson(item)['enabled'] !== false)
        .map((item) => this.number(this.asJson(item)['id'])),
      sizeGroups,
    };
  }

  private toCustomer(value: unknown, fallback?: Customer): Customer {
    const row = this.asJson(value);
    const category = this.text(row['priceCategory'] ?? row['category']);
    const discounts = Array.isArray(row['brandDiscounts']) ? row['brandDiscounts'] : [];
    const brandDiscounts: Record<string, number> = {};
    for (const item of discounts) {
      const discount = this.asJson(item);
      const name = this.text(discount['brandName']) || this.brandById.get(this.number(discount['brandId']));
      if (name) brandDiscounts[name] = this.number(discount['discountPercent']);
    }
    const station = this.text(row['stationName']) || fallback?.station || '';
    const stationId = this.number(row['stationId']) || fallback?.stationId;
    if (stationId && station) this.stationByName.set(station.toLowerCase(), stationId);
    return {
      id: this.number(row['id']) || fallback?.id || 0,
      name: this.text(row['businessName']) || this.text(row['name']) || fallback?.name || '',
      code: this.text(row['customerCode']) || this.text(row['loginId']) || fallback?.code || '',
      customerId: this.text(row['customerCode']) || fallback?.customerId,
      loginId: this.text(row['loginId']) || fallback?.loginId,
      phone: this.text(row['phoneNumber']) || this.text(row['whatsappNumber']) || fallback?.phone || '',
      whatsapp: this.text(row['whatsappNumber']) || fallback?.whatsapp,
      email: this.text(row['email']) || fallback?.email || '',
      category: (['A', 'B', 'C'].includes(category) ? category : 'A') as Customer['category'],
      address: this.text(row['shippingAddress']) || fallback?.address || '',
      station,
      stationId,
      contact: this.text(row['contactPerson']) || fallback?.contact,
      reminderDay: this.text(row['weeklyReminderDay']) || fallback?.reminderDay,
      active: (this.text(row['status']).toUpperCase() || 'ACTIVE') === 'ACTIVE',
      overrides: {},
      brandDiscounts,
      loginPassword: '',
    };
  }

  private toOrder(value: unknown, fallback?: Order): Order {
    const row = this.asJson(value);
    const customer = this.asJson(row['customer']);
    const lines = Array.isArray(row['lines']) ? row['lines'] : [];
    const items: OrderItem[] = lines.map((item) => {
      const line = this.asJson(item);
      const carton = this.text(line['orderType']).toUpperCase() === 'CARTON_WISE';
      const sizes = Array.isArray(line['sizes']) ? line['sizes'] : [];
      const rows = sizes.map((size) => {
        const s = this.asJson(size);
        return { size: Number(s['size']), qty: this.number(s['quantityPairs']) };
      }).filter((s) => Number.isFinite(s.size));
      return {
        productId: this.number(line['productId']),
        productName: this.text(line['productName']),
        code: this.text(line['productCode']),
        mode: carton ? 'carton' : 'size',
        total: this.number(line['quantityPairs']),
        rows,
        ...(carton ? {
          cartons: this.number(line['numberOfCartons']),
          packingName: this.text(line['packingGroupName']),
          packingGroupId: this.number(line['packingGroupId']),
        } : {}),
        priceSnapshot: this.number(line['customerUnitPrice']),
      };
    });
    const rawStatus = (this.text(row['workStatus']) || this.text(row['status'])).toUpperCase();
    return {
      id: this.text(row['orderNumber']) || fallback?.id || String(this.number(row['id'])),
      apiId: this.number(row['id']) || fallback?.apiId,
      customerId: this.number(customer['id']) || fallback?.customerId || 0,
      customer: this.text(customer['name']) || this.text(customer['businessName']) || fallback?.customer || '',
      date: this.formatDate(this.text(row['createdAt'])) || fallback?.date || '',
      status: this.orderStatus(rawStatus),
      createdBy: fallback?.createdBy || 'API',
      items: items.length ? items : fallback?.items || [],
    };
  }

  // ---- Small conversion helpers --------------------------------------
  private rememberBrands(brands: Brand[]): void {
    for (const brand of brands) {
      this.brandById.set(brand.id, brand.name);
      this.brandByName.set(brand.name.toLowerCase(), brand.id);
    }
  }

  private apiError(error: unknown): Error {
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error ? error : new Error('The API request failed.');
    }
    const body = this.asJson(error.error);
    return new Error(this.text(body['message']) || this.text(body['error']) || error.message);
  }

  private asJson(value: unknown): Json {
    return value && typeof value === 'object' ? value as Json : {};
  }

  private text(value: unknown): string {
    return value == null ? '' : String(value);
  }

  private number(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }

  private menuNames(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.map((item) => {
      if (typeof item !== 'object' || item === null) return String(item);
      const row = this.asJson(item);
      return this.text(row['title']) || this.text(row['name']) || this.text(row['label']) || this.text(row['routePath']);
    }).filter(Boolean);
  }

  private mapRole(value: string, menus: string[] = []): UserRole {
    switch (value.toUpperCase().replace(/[ -]/g, '_')) {
      case 'SUPER_ADMIN': return 'Super Admin';
      case 'ADMIN': return 'Admin';
      case 'BACKEND_USER': return 'Backend User';
      case 'USER': {
        const menuNames = menus.join(' ').toLowerCase();
        return /home|basket|account|my orders/.test(menuNames) ? 'Customer' : 'Backend User';
      }
      case 'CUSTOMER': return 'Customer';
      default: throw new Error(`Unsupported API role: ${value || '(empty)'}`);
    }
  }

  private orderStatus(value: string): OrderStatus {
    if (value.includes('DELIVER')) return 'Delivered';
    if (value.includes('DISPATCH')) return 'Dispatched';
    if (value.includes('PROCESS')) return 'Processing';
    if (value.includes('CONFIRM') || value.includes('SUBMIT') || value.includes('RECEIVED')) return 'Confirmed';
    return 'Pending';
  }

  private formatDate(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  private absoluteUrl(path: string): string {
    if (!path || /^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
    return new URL(path, `${this.baseUrl}/`).toString();
  }
}
