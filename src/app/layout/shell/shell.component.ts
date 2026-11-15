import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AppStateService } from '../../core/services/app-state.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

interface NavEntry {
  label: string;
  path: string;
  icon: string;
}

const ICONS: Record<string, string> = {
  Dashboard: '◫',
  Products: '▧',
  Packaging: '▤',
  Orders: '≡',
  Customers: '♙',
  Brands: '◇',
  Catalogues: '▣',
  Home: '⌂',
  Basket: '🧺',
  Account: '◎',
  'Order History': '◷',
  'User Accounts': '⊕',
};

/** Convert a nav label to its route slug (e.g. "Order History" -> "order-history"). */
function toSlug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

/** Authenticated app shell: fixed sidebar + topbar around the routed content. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly appState = inject(AppStateService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly user = this.auth.user;
  readonly role = this.appState.role;
  readonly toasts = this.toast.toasts;

  dismissToast(id: number): void {
    this.toast.dismiss(id);
  }

  readonly nav = computed<NavEntry[]>(() =>
    this.appState.navItems().map((label) => ({
      label,
      path: '/app/' + toSlug(label),
      icon: ICONS[label] ?? '•',
    })),
  );

  readonly initial = computed(() => {
    const r = this.role();
    return r === 'Customer' ? 'C' : r === 'Backend User' ? 'B' : 'A';
  });

  /** Current page label derived from the active route, for the topbar. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly pageLabel = computed(() => {
    const url = this.currentUrl().split('?')[0];
    const last = url.split('/').filter(Boolean).pop() ?? '';
    if (!last || last === 'app') {
      return 'Dashboard';
    }
    // Turn a slug ("order-history") into a title ("Order History").
    return last
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  });

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
