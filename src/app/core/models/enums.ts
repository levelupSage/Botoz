/** Roles available in the BOTOZ B2B platform. */
export type UserRole = 'Super Admin' | 'Admin' | 'Backend User' | 'Customer';

/** Wholesale price tiers assigned per customer. */
export type PriceTier = 'A' | 'B' | 'C';

/** Lifecycle status of an order. */
export type OrderStatus = 'Pending' | 'Confirmed' | 'Processing' | 'Dispatched' | 'Delivered';

/** How an order line was placed. */
export type OrderMode = 'size' | 'carton';
