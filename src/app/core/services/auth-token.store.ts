import { Injectable, signal } from '@angular/core';

/** Keeps bearer tokens available to HTTP interceptors without an AuthService cycle. */
@Injectable({ providedIn: 'root' })
export class AuthTokenStore {
  private readonly storageKey = 'botoz.auth';
  readonly sessionExpired = signal(false);
  private access: string | null = null;
  private refresh: string | null = null;

  get accessToken(): string | null {
    return this.access;
  }

  get refreshToken(): string | null {
    return this.refresh;
  }

  setTokens(accessToken: string | null, refreshToken: string | null): void {
    this.access = accessToken;
    this.refresh = refreshToken;
    if (accessToken) this.sessionExpired.set(false);
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const session = JSON.parse(raw) as Record<string, unknown>;
      if (session['user']) {
        localStorage.setItem(
          this.storageKey,
          JSON.stringify({ ...session, token: accessToken, refreshToken }),
        );
      }
    } catch {
      // Token persistence is best-effort; session logic remains usable in memory.
    }
  }

  clear(): void {
    this.setTokens(null, null);
    this.sessionExpired.set(true);
  }
}
