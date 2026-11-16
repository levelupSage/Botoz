import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models';
import { AppStateService } from '../services/app-state.service';
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

/** Keeps authenticated users inside the sections assigned to their role. */
export const roleGuard: CanActivateFn = (route) => {
  const appState = inject(AppStateService);
  const router = inject(Router);
  const allowedRoles = route.data['roles'] as UserRole[] | undefined;
  const requiredMenu = route.data['menu'] as string | undefined;
  const role = appState.role();

  if ((!allowedRoles || allowedRoles.includes(role)) &&
      (!requiredMenu || appState.canAccessMenu(requiredMenu))) {
    return true;
  }

  const firstAvailableMenu = appState.navItems()[0];
  return firstAvailableMenu
    ? router.createUrlTree(['/app', firstAvailableMenu.toLowerCase().replace(/\s+/g, '-')])
    : router.createUrlTree(['/']);
};
