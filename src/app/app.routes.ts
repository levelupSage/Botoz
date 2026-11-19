import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { CataloguesComponent } from './features/catalogues/catalogues.component';

export const routes: Routes = [
  // ---- Public ---------------------------------------------------------
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },

  // ---- Authenticated app shell ---------------------------------------
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./layout/shell/app-home-redirect.component').then((m) => m.AppHomeRedirectComponent),
      },
      {
        path: 'dashboard',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Backend User'], menu: 'Dashboard' },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'products',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Backend User', 'Customer'], menu: 'Products' },
        loadComponent: () =>
          import('./features/products/products.component').then((m) => m.ProductsComponent),
      },
      {
        path: 'packaging',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Backend User'], menu: 'Packaging' },
        loadComponent: () =>
          import('./features/packaging/packaging.component').then((m) => m.PackagingComponent),
      },
      {
        path: 'orders',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Backend User', 'Customer'], menu: 'Orders' },
        loadComponent: () =>
          import('./features/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'new-orders',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Backend User'], menu: 'New Orders' },
        loadComponent: () =>
          import('./features/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'photo-order',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin'], menu: 'Photo Order' },
        loadComponent: () =>
          import('./features/photo-orders/photo-orders.component').then((m) => m.PhotoOrdersComponent),
      },
      {
        path: 'customers',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Backend User'], menu: 'Customers' },
        loadComponent: () =>
          import('./features/customers/customers.component').then((m) => m.CustomersComponent),
      },
      {
        path: 'brands',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin'], menu: 'Brands' },
        loadComponent: () =>
          import('./features/brands/brands.component').then((m) => m.BrandsComponent),
      },
      {
        path: 'catalogues',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Backend User'], menu: 'Catalogues' },
        // Keep this route AOT-linked. It must never depend on the JIT compiler
        // in the production browser bundle.
        component: CataloguesComponent,
      },
      {
        path: 'order-history',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin'], menu: 'Order History' },
        loadComponent: () =>
          import('./features/order-history/order-history.component').then(
            (m) => m.OrderHistoryComponent,
          ),
      },
      {
        path: 'team',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin'], menu: 'Team' },
        loadComponent: () =>
          import('./features/team/team.component').then((m) => m.TeamComponent),
      },
      {
        path: 'settings',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin'], menu: 'Settings' },
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'user-accounts',
        canActivate: [roleGuard],
        data: { roles: ['Super Admin', 'Admin'], menu: 'Team' },
        loadComponent: () =>
          import('./features/auth/register.component').then((m) => m.RegisterComponent),
      },
      // Customer-facing sections
      {
        path: 'home',
        canActivate: [roleGuard],
        data: { roles: ['Customer'], menu: 'Home' },
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'basket',
        canActivate: [roleGuard],
        data: { roles: ['Customer', 'Super Admin', 'Admin', 'Backend User'], menu: 'Basket' },
        loadComponent: () =>
          import('./features/basket/basket.component').then((m) => m.BasketComponent),
      },
      {
        path: 'account',
        canActivate: [roleGuard],
        data: { roles: ['Customer'], menu: 'Account' },
        loadComponent: () =>
          import('./features/account/account.component').then((m) => m.AccountComponent),
      },
    ],
  },

  // ---- Fallback -------------------------------------------------------
  { path: '**', redirectTo: '' },
];
