import { computed, Injectable, inject, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { DataService } from '../data/data.service';
import { AuthUser, LoginCredentials, UserRole } from '../models';

const STORAGE_KEY = 'botoz.auth';

interface PersistedAuth {
  user: AuthUser;
  token: string;
}

/**
 * Owns the authenticated session. Backed by the swappable {@link DataService}
 * for the actual credential check, and persists the session to localStorage so
 * a page refresh keeps the user logged in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly data = inject(DataService);

  private readonly restored = this.restore();
  private readonly _user = signal<AuthUser | null>(this.restored?.user ?? null);
  private _token: string | null = this.restored?.token ?? null;

  /** The current user, or null when logged out. */
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed<UserRole | null>(() => this._user()?.role ?? null);

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return this.data.login(credentials).pipe(
      tap((result) => {
        this._token = result.token;
        this._user.set(result.user);
        this.persist({ user: result.user, token: result.token });
      }),
      map((result) => result.user),
    );
  }

  logout(): void {
    this._token = null;
    this._user.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  token(): string | null {
    return this._token;
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
      return raw ? (JSON.parse(raw) as PersistedAuth) : null;
    } catch {
      return null;
    }
  }
}
