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
}

export interface Order {
  id: string;
  /** Numeric database id used by API detail routes. */
  apiId?: number;
  customerId: number;
  customer: string;
  date: string;
  status: OrderStatus;
  createdBy: string;
  items: OrderItem[];
}
