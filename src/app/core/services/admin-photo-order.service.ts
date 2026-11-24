import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DataService } from '../data/data.service';
import { BackendUserOption, OrderItem, PictureOrderCounts, PictureOrderDecision, PictureOrderRequest } from '../models';

/** API-backed picture-order operations. Images and audit state are durable. */
@Injectable({ providedIn: 'root' })
export class AdminPhotoOrderService {
  private readonly data = inject(DataService);

  create(customerId: number, files: File[], captions: string[]): Observable<PictureOrderRequest> {
    return this.data.createPictureOrder(customerId, files, captions);
  }

  list(status: 'INCOMING' | 'PENDING' | 'PROCESSED', search = ''): Observable<PictureOrderRequest[]> {
    return this.data.getPictureOrders(status, search);
  }

  counts(): Observable<PictureOrderCounts> { return this.data.getPictureOrderCounts(); }
  review(id: number, decisions: PictureOrderDecision[]): Observable<PictureOrderRequest> { return this.data.reviewPictureOrder(id, decisions); }
  backendUsers(): Observable<BackendUserOption[]> { return this.data.getPictureOrderBackendUsers(); }
  assign(id: number, backendUserId: number, lines: OrderItem[]): Observable<PictureOrderRequest> {
    return this.data.assignPictureOrder(id, backendUserId, lines);
  }
}
