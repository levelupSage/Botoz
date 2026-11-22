import { OrderItem } from './order.model';

export type PictureOrderStatus = 'INCOMING' | 'PENDING' | 'PROCESSED';
export type PicturePhotoStatus = 'GREEN' | 'RED' | 'PENDING' | 'PROCESSED' | 'INCOMING';

export interface PictureOrderPhoto { id: number; imageUrl: string; caption: string; status: PicturePhotoStatus; orderId?: number; createdAt?: string; }
export interface PictureOrderRequest { id: number; customerId: number; customerName: string; customerCode: string; customerLoginId?: string; status: PictureOrderStatus; createdAt: string; reviewedAt?: string; photos: PictureOrderPhoto[]; }
export interface PictureOrderCounts { incoming: number; pending: number; processed: number; }
export interface BackendUserOption { id: number; fullName: string; loginId: string; }
/** A green photo needs an order line; red photos need only their ID and action. */
export interface PictureOrderDecision { photoId: number; action: 'GREEN' | 'RED'; line?: OrderItem; }
