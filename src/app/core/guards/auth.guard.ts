import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Blocks access to app routes unless the user is logged in. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  // Remember where the user was heading so we can return after login.
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

/** Keeps authenticated users out of the public login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/app']) : true;
};
