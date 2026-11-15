import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, map, Observable, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokenStore } from '../services/auth-token.store';

interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

let refreshRequest: Observable<string> | null = null;

/** Adds the bearer token and retries one unauthorized request after refresh. */
export const apiAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const tokens = inject(AuthTokenStore);
  const rawHttp = new HttpClient(inject(HttpBackend));
  const bypassAuth = request.url.includes('/api/auth/login') ||
    request.url.includes('/api/auth/refresh-token');
  const authorized = (token: string | null) =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(bypassAuth ? request : authorized(tokens.accessToken)).pipe(
    catchError((error: unknown) => {
      if (
        bypassAuth ||
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        !tokens.refreshToken
      ) {
        return throwError(() => error);
      }

      if (!refreshRequest) {
        refreshRequest = rawHttp
          .post<ApiEnvelope<RefreshedTokens>>(
            `${environment.apiBaseUrl}/api/auth/refresh-token`,
            { refreshToken: tokens.refreshToken },
          )
          .pipe(
            map((response) => {
              const result = response.data;
              if (response.success === false || !result?.accessToken) {
                throw new Error(response.message || 'Session refresh failed.');
              }
              return result;
            }),
            tap((result) => tokens.setTokens(result.accessToken, result.refreshToken)),
            map((result) => result.accessToken),
            finalize(() => (refreshRequest = null)),
            shareReplay({ bufferSize: 1, refCount: false }),
          );
      }

      return refreshRequest.pipe(
        catchError((refreshError: unknown) => {
          tokens.clear();
          return throwError(() => refreshError);
        }),
        switchMap((token) => next(authorized(token))),
      );
    }),
  );
};
