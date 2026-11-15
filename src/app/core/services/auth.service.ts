import { computed, effect, Injectable, inject, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { DataService } from '../data/data.service';
import { AuthUser, LoginCredentials, UserRole } from '../models';
import { AuthTokenStore } from './auth-token.store';
import { environment } from '../../../environments/environment';

const STORAGE_KEY = 'botoz.auth';

interface PersistedAuth {
  user: AuthUser;
  token: string;
  refreshToken?: string;
}

/**
 * Owns the authenticated session. Backed by the swappable {@link DataService}
 * for the actual credential check, and persists the session to localStorage so
 * a page refresh keeps the user logged in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly data = inject(DataService);
  private readonly tokens = inject(AuthTokenStore);

  private readonly restored = this.restore();
  private readonly _user = signal<AuthUser | null>(this.restored?.user ?? null);

  constructor() {
    this.tokens.setTokens(this.restored?.token ?? null, this.restored?.refreshToken ?? null);
    effect(() => {
      if (this.tokens.sessionExpired()) {
        this._user.set(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    });
  }

  /** The current user, or null when logged out. */
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed<UserRole | null>(() => this._user()?.role ?? null);

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return this.data.login(credentials).pipe(
      tap((result) => {
        this.tokens.setTokens(result.token, result.refreshToken ?? null);
        this._user.set(result.user);
        this.persist({ user: result.user, token: result.token, refreshToken: result.refreshToken });
      }),
      map((result) => result.user),
    );
  }

  logout(): void {
    this.tokens.clear();
    this._user.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  token(): string | null {
    return this.tokens.accessToken;
  }

  private persist(value: PersistedAuth): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  private restore(): PersistedAuth | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as PersistedAuth;
      if (!environment.useMockApi && session.token.startsWith('mock.')) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }
}
