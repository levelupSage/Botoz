import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
}

/** Lightweight transient notifications rendered by the app shell. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, durationMs = 2500): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
