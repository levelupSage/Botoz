import { Observable } from 'rxjs';
import {
  Brand,
  Customer,
  LoginCredentials,
  LoginResult,
  Order,
  OrderStatus,
  Product,
  Staff,
} from '../models';

/**
 * Abstract data layer for the whole app.
 *
 * Components and feature services depend ONLY on this abstraction (via DI),
 * never on a concrete implementation. Today it is backed by
 * `MockDataService` (in-memory + localStorage). To go live, provide an
 * `ApiDataService` that talks to a REST backend — no component changes needed.
 *
 * Upsert convention: pass an entity with `id === 0` to create (a new id is
 * assigned and returned), or an existing id to update in place.
 *
 * See `app.config.ts` for the provider wiring.
 */
export abstract class DataService {
  // ---- Auth -----------------------------------------------------------
  abstract login(credentials: LoginCredentials): Observable<LoginResult>;

  // ---- Brands ---------------------------------------------------------
  abstract getBrands(): Observable<Brand[]>;
  abstract saveBrand(brand: Brand): Observable<Brand>;

  // ---- Products -------------------------------------------------------
  abstract getProducts(): Observable<Product[]>;
  abstract saveProduct(product: Product): Observable<Product>;

  // ---- Customers ------------------------------------------------------
  abstract getCustomers(): Observable<Customer[]>;
  abstract saveCustomer(customer: Customer): Observable<Customer>;

  // ---- Staff ----------------------------------------------------------
  abstract getStaff(): Observable<Staff[]>;

  // ---- Orders ---------------------------------------------------------
  abstract getOrders(): Observable<Order[]>;
  abstract createOrder(order: Order): Observable<Order>;
  abstract updateOrderStatus(orderId: string, status: OrderStatus): Observable<Order>;

  /** Reserve and return the next sequential order id (e.g. "BT-26042"). */
  abstract nextOrderId(): Observable<string>;
}
