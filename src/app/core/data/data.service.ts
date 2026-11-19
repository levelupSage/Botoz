import { Observable } from 'rxjs';
import {
  Brand,
  Customer,
  LoginCredentials,
  LoginResult,
  RegisterAccountRequest,
  RegistrationMenuOption,
  Order,
  OrderStatus,
  Product,
  ProductSizeGroup,
  Staff,
  Station,
} from '../models';

/**
 * Abstract data layer for the whole app.
 *
 * Components and feature services depend ONLY on this abstraction (via DI),
 * never on a concrete implementation. The provider uses `ApiDataService`.
 *
 * Upsert convention: pass an entity with `id === 0` to create (a new id is
 * assigned and returned), or an existing id to update in place.
 *
 * See `app.config.ts` for the provider wiring.
 */
export abstract class DataService {
  abstract readonly supportsOrderStatusUpdate: boolean;
  abstract readonly supportsProductPriceOverrides: boolean;
  abstract readonly supportsPhotoArchive: boolean;

  // ---- Auth -----------------------------------------------------------
  abstract login(credentials: LoginCredentials): Observable<LoginResult>;
  abstract getRegistrationMenuOptions(): Observable<RegistrationMenuOption[]>;
  abstract registerAccount(request: RegisterAccountRequest): Observable<void>;

  // ---- Brands ---------------------------------------------------------
  abstract getBrands(): Observable<Brand[]>;
  abstract saveBrand(brand: Brand): Observable<Brand>;
  abstract deleteBrand(id: number): Observable<void>;
  abstract setBrandSizeLock(brand: Brand, locked: boolean): Observable<Brand>;
  abstract uploadBrandLogo(brand: Brand, file: File): Observable<Brand>;
  abstract deleteBrandLogo(brand: Brand): Observable<Brand>;

  // ---- Products -------------------------------------------------------
  abstract getProducts(): Observable<Product[]>;
  abstract getPackingGroups(): Observable<ProductSizeGroup[]>;
  abstract createPackingGroup(name: string, sizes: number[]): Observable<ProductSizeGroup>;
  abstract updatePackingGroup(id: number, name: string, sizes: number[]): Observable<ProductSizeGroup>;
  abstract deletePackingGroup(id: number): Observable<void>;
  abstract saveProduct(product: Product): Observable<Product>;
  abstract setProductActive(id: number, active: boolean): Observable<Product>;
  abstract setProductArchived(id: number, archived: boolean): Observable<Product>;
  abstract deleteProductPhoto(productId: number, photoId: number): Observable<Product>;

  // ---- Customers ------------------------------------------------------
  abstract getCustomers(): Observable<Customer[]>;
  abstract getCustomer(id: number): Observable<Customer>;
  abstract saveCustomer(customer: Customer): Observable<Customer>;
  abstract setCustomerActive(customer: Customer, active: boolean): Observable<Customer>;
  abstract deleteCustomer(id: number): Observable<void>;
  abstract getStations(): Observable<Station[]>;
  abstract createStation(name: string): Observable<Station>;

  // ---- Staff ----------------------------------------------------------
  abstract getStaff(): Observable<Staff[]>;
  abstract updateStaffAccount(staff: Staff, password: string): Observable<Staff>;

  // ---- Orders ---------------------------------------------------------
  abstract getOrders(): Observable<Order[]>;
  abstract createOrder(order: Order): Observable<Order>;
  abstract updateOrderStatus(orderId: string, status: OrderStatus): Observable<Order>;

  /** Reserve and return the next sequential order id (e.g. "BT-26042"). */
  abstract nextOrderId(): Observable<string>;
}
