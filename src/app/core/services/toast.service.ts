import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

/** Lightweight transient notifications rendered by the app shell. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, durationMs = 3000, type: Toast['type'] = 'info'): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(message: string): void {
    this.show(message, 3000, 'success');
  }

  error(message: string): void {
    this.show(message, 4500, 'error');
  }

  info(message: string): void {
    this.show(message, 3000, 'info');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
