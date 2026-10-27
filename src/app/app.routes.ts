import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

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
    canActivate: [guestGuard],
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
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/products/products.component').then((m) => m.ProductsComponent),
      },
      {
        path: 'packaging',
        loadComponent: () =>
          import('./features/packaging/packaging.component').then((m) => m.PackagingComponent),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./features/customers/customers.component').then((m) => m.CustomersComponent),
      },
      {
        path: 'brands',
        loadComponent: () =>
          import('./features/brands/brands.component').then((m) => m.BrandsComponent),
      },
      {
        path: 'catalogues',
        loadComponent: () =>
          import('./features/catalogues/catalogues.component').then((m) => m.CataloguesComponent),
      },
      {
        path: 'order-history',
        loadComponent: () =>
          import('./features/order-history/order-history.component').then(
            (m) => m.OrderHistoryComponent,
          ),
      },
      // Customer-facing sections
      {
        path: 'home',
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'basket',
        loadComponent: () =>
          import('./features/basket/basket.component').then((m) => m.BasketComponent),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/account/account.component').then((m) => m.AccountComponent),
      },
    ],
  },

  // ---- Fallback -------------------------------------------------------
  { path: '**', redirectTo: '' },
];
