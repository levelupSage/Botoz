import { Injectable } from '@angular/core';

export interface AdminPhotoOrderLine {
  name: string;
  caption: string;
  src: string;
}

export interface AdminPhotoOrderRequest {
  id: string;
  customerId: number;
  customerName: string;
  createdAt: string;
  status: 'New' | 'Reviewed' | 'Done';
  items: AdminPhotoOrderLine[];
}

const STORAGE_KEY = 'botoz.admin-photo-orders.v1';

/** Browser-local photo request store for the prototype's admin photo-order flow. */
@Injectable({ providedIn: 'root' })
export class AdminPhotoOrderService {
  create(customerId: number, customerName: string, items: AdminPhotoOrderLine[]): string | null {
    try {
      const requests = this.read();
      const nextNumber = requests.reduce((max, request) => {
        const match = request.id.match(/(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
      const id = `PR-${String(nextNumber).padStart(5, '0')}`;
      const request: AdminPhotoOrderRequest = {
        id,
        customerId,
        customerName,
        createdAt: new Date().toISOString(),
        status: 'New',
        items,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([request, ...requests]));
      return id;
    } catch {
      return null;
    }
  }

  list(): AdminPhotoOrderRequest[] {
    return this.read();
  }

  setStatus(id: string, status: AdminPhotoOrderRequest['status']): boolean {
    const requests = this.read();
    const request = requests.find((item) => item.id === id);
    if (!request) return false;
    request.status = status;
    return this.write(requests);
  }

  remove(id: string): boolean {
    return this.write(this.read().filter((item) => item.id !== id));
  }

  private write(requests: AdminPhotoOrderRequest[]): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
      return true;
    } catch {
      return false;
    }
  }

  private read(): AdminPhotoOrderRequest[] {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      if (!Array.isArray(value)) return [];
      return value.map((item) => {
        const request = item as Record<string, unknown>;
        const previousStatus = request['status'];
        return {
          ...request,
          status: previousStatus === 'Converted' ? 'Done'
            : previousStatus === 'Reviewed' || previousStatus === 'Done' ? previousStatus : 'New',
        } as unknown as AdminPhotoOrderRequest;
      });
    } catch {
      return [];
    }
  }
}
