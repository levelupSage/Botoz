import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  AuthUser,
  Brand,
  Customer,
  LoginCredentials,
  LoginResult,
  RegisterAccountRequest,
  RegistrationMenuOption,
  Order,
  OrderStatus,
  Product,
  Staff,
  UserRole,
} from '../models';
import { DataService } from './data.service';
import { cloneSeed, SEED } from './seed-data';

const LS_PREFIX = 'botoz.';
const KEYS = {
  brands: `${LS_PREFIX}brands`,
  products: `${LS_PREFIX}products`,
  customers: `${LS_PREFIX}customers`,
  staff: `${LS_PREFIX}staff`,
  orders: `${LS_PREFIX}orders`,
  nextOrderSeq: `${LS_PREFIX}nextOrderSeq`,
} as const;

/** Simulated network latency so the UI behaves like it will against a real API. */
const LATENCY_MS = 150;

/**
 * In-memory / localStorage implementation of {@link DataService}.
 *
 * Data is seeded from `seed-data.ts` on first run and persisted to
 * localStorage so changes survive a reload. Every method returns an
 * Observable (with a small simulated delay) to mirror the shape of a real
 * HTTP-backed service.
 */
@Injectable()
export class MockDataService extends DataService {
  readonly supportsOrderStatusUpdate = true;
  readonly supportsProductPriceOverrides = true;
  readonly supportsPhotoArchive = true;

  constructor() {
    super();
    this.seedIfEmpty();
  }

  // ---- Auth -----------------------------------------------------------
  login(credentials: LoginCredentials): Observable<LoginResult> {
    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    // Demo auth: any staff/customer email with password "botoz" logs in.
    // Replace entirely with a real token exchange in ApiDataService.
    if (password !== 'botoz') {
      return throwError(() => new Error('Invalid email or password.')).pipe(delay(LATENCY_MS));
    }

    const staff = this.read<Staff[]>(KEYS.staff, []).find(
      (s) => s.email.toLowerCase() === email && s.active,
    );
    if (staff) {
      return of(this.buildResult(staff.id, staff.name, staff.email, staff.role)).pipe(
        delay(LATENCY_MS),
      );
    }

    const customer = this.read<Customer[]>(KEYS.customers, []).find(
      (c) => c.email.toLowerCase() === email && c.active,
    );
    if (customer) {
      const result = this.buildResult(customer.id, customer.name, customer.email, 'Customer');
      result.user.customerId = customer.id;
      return of(result).pipe(delay(LATENCY_MS));
    }

    return throwError(() => new Error('Invalid email or password.')).pipe(delay(LATENCY_MS));
  }

  getRegistrationMenuOptions(): Observable<RegistrationMenuOption[]> {
    return of([]);
  }

  registerAccount(_request: RegisterAccountRequest): Observable<void> {
    return throwError(() => new Error('Account registration is available only when the API is enabled.'));
  }

  // ---- Reads ----------------------------------------------------------
  getBrands(): Observable<Brand[]> {
    return of(this.read<Brand[]>(KEYS.brands, [])).pipe(delay(LATENCY_MS));
  }

  getProducts(): Observable<Product[]> {
    return of(this.read<Product[]>(KEYS.products, [])).pipe(delay(LATENCY_MS));
  }

  getCustomers(): Observable<Customer[]> {
    return of(this.read<Customer[]>(KEYS.customers, [])).pipe(delay(LATENCY_MS));
  }

  getCustomer(id: number): Observable<Customer> {
    const customer = this.read<Customer[]>(KEYS.customers, []).find((item) => item.id === id);
    return customer
      ? of(customer).pipe(delay(LATENCY_MS))
      : throwError(() => new Error('Customer not found.')).pipe(delay(LATENCY_MS));
  }

  getStaff(): Observable<Staff[]> {
    return of(this.read<Staff[]>(KEYS.staff, [])).pipe(delay(LATENCY_MS));
  }

  getOrders(): Observable<Order[]> {
    return of(this.read<Order[]>(KEYS.orders, [])).pipe(delay(LATENCY_MS));
  }

  // ---- Writes ---------------------------------------------------------
  saveBrand(brand: Brand): Observable<Brand> {
    const brands = this.read<Brand[]>(KEYS.brands, []);
    const saved = this.upsert(brands, brand, (b) => b.id, (max) => max + 1);
    this.write(KEYS.brands, brands);
    return of(saved).pipe(delay(LATENCY_MS));
  }

  saveProduct(product: Product): Observable<Product> {
    const products = this.read<Product[]>(KEYS.products, []);
    const saved = this.upsert(products, product, (p) => p.id, (max) => max + 1);
    this.write(KEYS.products, products);
    return of(saved).pipe(delay(LATENCY_MS));
  }

  setProductArchived(id: number, archived: boolean): Observable<Product> {
    const products = this.read<Product[]>(KEYS.products, []);
    const product = products.find((item) => item.id === id);
    if (!product) return throwError(() => new Error('Product not found.')).pipe(delay(LATENCY_MS));
    product.archived = archived;
    this.write(KEYS.products, products);
    return of(product).pipe(delay(LATENCY_MS));
  }

  saveCustomer(customer: Customer): Observable<Customer> {
    const customers = this.read<Customer[]>(KEYS.customers, []);
    const saved = this.upsert(customers, customer, (c) => c.id, (max) => max + 1);
    this.write(KEYS.customers, customers);
    return of(saved).pipe(delay(LATENCY_MS));
  }

  createOrder(order: Order): Observable<Order> {
    const orders = this.read<Order[]>(KEYS.orders, []);
    const saved = order.id
      ? order
      : { ...order, id: `BT-${this.read<number>(KEYS.nextOrderSeq, SEED.nextOrderSeq)}` };
    if (!order.id) {
      this.write(KEYS.nextOrderSeq, this.read<number>(KEYS.nextOrderSeq, SEED.nextOrderSeq) + 1);
    }
    orders.unshift(saved);
    this.write(KEYS.orders, orders);
    return of(saved).pipe(delay(LATENCY_MS));
  }

  updateOrderStatus(orderId: string, status: OrderStatus): Observable<Order> {
    const orders = this.read<Order[]>(KEYS.orders, []);
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      return throwError(() => new Error('Order not found.')).pipe(delay(LATENCY_MS));
    }
    order.status = status;
    this.write(KEYS.orders, orders);
    return of(order).pipe(delay(LATENCY_MS));
  }

  nextOrderId(): Observable<string> {
    const seq = this.read<number>(KEYS.nextOrderSeq, SEED.nextOrderSeq);
    this.write(KEYS.nextOrderSeq, seq + 1);
    return of(`BT-${seq}`).pipe(delay(LATENCY_MS));
  }

  // ---- Internal helpers ----------------------------------------------
  /**
   * Insert or update an entity in `list` by numeric id. When `entity.id` is 0
   * (or missing) a new id is assigned as max(existing)+1 and the entity is
   * appended; otherwise the matching item is replaced in place.
   */
  private upsert<T extends { id: number }>(
    list: T[],
    entity: T,
    idOf: (item: T) => number,
    nextId: (maxId: number) => number,
  ): T {
    if (entity.id && entity.id > 0) {
      const index = list.findIndex((item) => idOf(item) === entity.id);
      if (index >= 0) {
        list[index] = entity;
      } else {
        list.push(entity);
      }
      return entity;
    }
    const maxId = list.reduce((max, item) => Math.max(max, idOf(item)), 0);
    const created = { ...entity, id: nextId(maxId) };
    list.push(created);
    return created;
  }

  private buildResult(
    id: number,
    name: string,
    email: string,
    role: UserRole,
  ): LoginResult {
    const user: AuthUser = { id, name, email, role };
    // A fake opaque token; a real backend returns a signed JWT or session id.
    const token = `mock.${btoa(`${id}:${role}:${Date.now()}`)}`;
    return { user, token };
  }

  private seedIfEmpty(): void {
    if (this.read(KEYS.brands, null) === null) {
      this.write(KEYS.brands, cloneSeed(SEED.brands));
    }
    if (this.read(KEYS.products, null) === null) {
      this.write(KEYS.products, cloneSeed(SEED.products));
    }
    if (this.read(KEYS.customers, null) === null) {
      this.write(KEYS.customers, cloneSeed(SEED.customers));
    }
    if (this.read(KEYS.staff, null) === null) {
      this.write(KEYS.staff, cloneSeed(SEED.staff));
    }
    if (this.read(KEYS.orders, null) === null) {
      this.write(KEYS.orders, cloneSeed(SEED.orders));
    }
    if (this.read(KEYS.nextOrderSeq, null) === null) {
      this.write(KEYS.nextOrderSeq, SEED.nextOrderSeq);
    }
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  private write<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full / unavailable — ignore in the mock layer.
    }
  }
}
