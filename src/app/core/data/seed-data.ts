import { Brand, Customer, Order, Product, Staff } from '../models';

/**
 * Demo seed data ported from the BOTOZ V15 prototype.
 * Used by the MockDataService as the initial dataset. When a real API is
 * wired in, this file can be deleted or kept only for local development.
 */

const brands: Brand[] = [
  { id: 1, name: 'BOTOZ', active: true },
  { id: 2, name: 'AMBEY FOOTWEAR', active: true },
  { id: 3, name: 'Stridey', active: true },
];

const products: Product[] = [
  {
    id: 101,
    brand: 'BOTOZ',
    code: 'BT-101',
    name: 'Aero Lite Runner',
    category: 'Sports',
    mrp: 1499,
    categoryPrices: { A: 780, B: 830, C: 880 },
    active: true,
    images: [{ name: 'Sample product photo', active: true, src: '' }],
    sizes: [5, 6, 7, 8, 9, 10],
    packings: [
      {
        id: 1,
        name: '5×8 Regular',
        rows: [
          { size: 5, pairs: 1 },
          { size: 6, pairs: 2 },
          { size: 7, pairs: 2 },
          { size: 8, pairs: 2 },
          { size: 9, pairs: 1 },
        ],
      },
    ],
  },
  {
    id: 102,
    brand: 'BOTOZ',
    code: 'BT-102',
    name: 'Cloud Walk',
    category: 'Casual',
    mrp: 1299,
    categoryPrices: { A: 690, B: 740, C: 790 },
    active: true,
    images: [{ name: 'Sample product photo', active: true, src: '' }],
    sizes: [5, 6, 7, 8, 9],
    packings: [
      {
        id: 2,
        name: '6×9 Mix',
        rows: [
          { size: 6, pairs: 2 },
          { size: 7, pairs: 2 },
          { size: 8, pairs: 2 },
          { size: 9, pairs: 2 },
        ],
      },
    ],
  },
  {
    id: 103,
    brand: 'AMBEY FOOTWEAR',
    code: 'AF-220',
    name: 'Classic Comfort',
    category: 'Daily Wear',
    mrp: 899,
    categoryPrices: { A: 510, B: 550, C: 590 },
    active: true,
    images: [{ name: 'Sample product photo', active: true, src: '' }],
    sizes: [6, 7, 8, 9, 10],
    packings: [],
  },
  {
    id: 104,
    brand: 'Stridey',
    code: 'ST-012',
    name: 'Flex Motion',
    category: 'Sports',
    mrp: 1699,
    categoryPrices: { A: 910, B: 960, C: 1010 },
    active: true,
    images: [{ name: 'Sample product photo', active: true, src: '' }],
    sizes: [6, 7, 8, 9, 10],
    packings: [],
  },
  {
    id: 105,
    brand: 'BOTOZ',
    code: 'BT-105',
    name: 'Urban Slip-On',
    category: 'Casual',
    mrp: 999,
    categoryPrices: { A: 530, B: 570, C: 610 },
    active: false,
    images: [{ name: 'Sample product photo', active: true, src: '' }],
    sizes: [6, 7, 8, 9],
    packings: [],
  },
];

const customers: Customer[] = [
  {
    id: 1,
    name: 'Sharma Footwear',
    code: 'C-001',
    phone: '9876501234',
    email: 'sharma@example.com',
    category: 'A',
    address: 'Main Market, Sirsa',
    active: true,
    overrides: {},
  },
  {
    id: 2,
    name: 'City Shoes',
    code: 'C-002',
    phone: '9876505678',
    email: 'city@example.com',
    category: 'B',
    address: 'Bus Stand Road, Sirsa',
    active: true,
    overrides: {},
  },
  {
    id: 3,
    name: 'Mohan Traders',
    code: 'C-003',
    phone: '9876508821',
    email: 'mohan@example.com',
    category: 'C',
    address: 'Old Market, Haryana',
    active: true,
    overrides: {},
  },
];

const orders: Order[] = [
  {
    id: 'BT-26041',
    customerId: 1,
    customer: 'Sharma Footwear',
    date: '11 Oct 2026',
    status: 'Confirmed',
    createdBy: 'Customer',
    items: [
      {
        productId: 101,
        productName: 'Aero Lite Runner',
        code: 'BT-101',
        mode: 'carton',
        packingName: '5×8 Regular',
        cartons: 2,
        total: 16,
        rows: [
          { size: 5, qty: 2 },
          { size: 6, qty: 4 },
          { size: 7, qty: 4 },
          { size: 8, qty: 4 },
          { size: 9, qty: 2 },
        ],
      },
    ],
  },
  {
    id: 'BT-26040',
    customerId: 2,
    customer: 'City Shoes',
    date: '10 Oct 2026',
    status: 'Processing',
    createdBy: 'Admin',
    items: [
      {
        productId: 102,
        productName: 'Cloud Walk',
        code: 'BT-102',
        mode: 'size',
        total: 12,
        rows: [
          { size: 6, qty: 4 },
          { size: 7, qty: 4 },
          { size: 8, qty: 4 },
        ],
      },
    ],
  },
  {
    id: 'BT-26039',
    customerId: 3,
    customer: 'Mohan Traders',
    date: '10 Oct 2026',
    status: 'Dispatched',
    createdBy: 'Customer',
    items: [
      {
        productId: 103,
        productName: 'Classic Comfort',
        code: 'AF-220',
        mode: 'size',
        total: 6,
        rows: [
          { size: 6, qty: 2 },
          { size: 7, qty: 4 },
        ],
      },
    ],
  },
];

const staff: Staff[] = [
  {
    id: 1,
    name: 'Super Admin',
    loginId: 'botos.owner',
    email: 'owner@botoz.demo',
    role: 'Super Admin',
    permissions: ['all'],
    active: true,
  },
  {
    id: 2,
    name: 'Sales Admin',
    loginId: 'botos.admin',
    email: 'admin@botoz.demo',
    role: 'Admin',
    permissions: ['products', 'prices', 'orders', 'customers', 'catalogues', 'packaging'],
    active: true,
  },
  {
    id: 3,
    name: 'Order Entry',
    loginId: 'botos.backend',
    email: 'orders@botoz.demo',
    role: 'Backend User',
    permissions: ['orders'],
    active: true,
  },
];

/** The next order sequence number, matching the prototype. */
const nextOrderSeq = 26042;

export const SEED = {
  brands,
  products,
  customers,
  orders,
  staff,
  nextOrderSeq,
} as const;

/** Deep clone helper so callers never mutate the frozen seed. */
export function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
