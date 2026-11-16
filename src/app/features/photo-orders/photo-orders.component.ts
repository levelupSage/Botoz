import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminPhotoOrderRequest, AdminPhotoOrderService } from '../../core/services/admin-photo-order.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-photo-orders',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './photo-orders.component.html',
  styleUrl: './photo-orders.component.scss',
})
export class PhotoOrdersComponent {
  private readonly store = inject(AdminPhotoOrderService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly requests = signal(this.store.list());
  readonly newCount = computed(() => this.requests().filter((item) => item.status === 'New').length);
  readonly reviewedCount = computed(() => this.requests().filter((item) => item.status === 'Reviewed').length);
  readonly doneCount = computed(() => this.requests().filter((item) => item.status === 'Done').length);

  startPhotoOrder(): void {
    this.router.navigate(['/app/products'], { queryParams: { photoOrder: '1' } });
  }

  changeStatus(request: AdminPhotoOrderRequest, status: AdminPhotoOrderRequest['status']): void {
    if (!this.store.setStatus(request.id, status)) {
      this.toast.error('Could not save the photo order status. Browser storage may be full.');
      return;
    }
    this.refresh();
    this.toast.success(`${request.id} marked ${status.toLowerCase()}.`);
  }

  remove(request: AdminPhotoOrderRequest): void {
    if (!window.confirm(`Delete photo order ${request.id} for ${request.customerName}?`)) return;
    if (!this.store.remove(request.id)) {
      this.toast.error('Could not delete the photo order.');
      return;
    }
    this.refresh();
    this.toast.success(`Photo order ${request.id} deleted.`);
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  private refresh(): void {
    this.requests.set(this.store.list());
  }
}
