import { OrderMode, OrderStatus } from './enums';

export interface OrderRow {
  size: number;
  qty: number;
}

export interface OrderItem {
  productId: number;
  productName: string;
  code: string;
  brand?: string;
  mode: OrderMode;
  total: number;
  rows: OrderRow[];
  cartons?: number;
  packingName?: string;
  packingGroupId?: number;
  /** Snapshot of the per-customer price at the time of ordering. */
  priceSnapshot?: number;
  /** Internal staff-only rate saved per pair with this order line. */
  adminRatePerPair?: number;
}

export interface Order {
  id: string;
  /** Numeric database id used by API detail routes. */
  apiId?: number;
  customerId: number;
  customer: string;
  date: string;
  status: OrderStatus;
  /** The API booking state, shown separately from fulfilment work state. */
  bookingStatus?: string;
  /** The API fulfilment state, when returned. */
  workStatus?: OrderStatus;
  /** API id of the Backend User assigned to this order, when assigned. */
  assignedUserId?: number;
  createdBy: string;
  items: OrderItem[];
}
