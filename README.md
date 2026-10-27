# BOTOZ — Footwear B2B Suite (Angular)

Production-ready Angular rewrite of the BOTOZ V15 prototype. **Phase 1** delivers the
foundation: authentication, a swappable data layer, routing with role-based navigation,
and the app shell. Feature pages (Products, Orders, etc.) are wired as routes and will be
filled in across later phases.

- **Angular:** 20.2 · standalone components · signals · SCSS · TypeScript strict
- **Data:** in-memory + `localStorage` mock today, swappable for a real REST API later

---

## Getting started

```bash
cd botoz-app
npm install          # first time only
npm start            # dev server at http://localhost:4200
npm run build        # production build -> dist/botoz-app
npm test             # unit tests (Karma/Jasmine)
```

### Demo logins

The landing page (`/`) links to **Sign in** (`/login`). All demo accounts use the
password **`botoz`**:

| Role         | Email                | Lands on   |
| ------------ | -------------------- | ---------- |
| Admin        | `admin@botoz.demo`   | Dashboard  |
| Backend User | `orders@botoz.demo`  | Dashboard  |
| Customer     | `sharma@example.com` | Dashboard  |

The login page also has one-click chips to fill each demo account.

> To reset all local data, clear the site's `localStorage` (keys are prefixed `botoz.`).

---

## Project structure

```
src/app/
  core/
    models/      Domain interfaces + enums (Brand, Product, Customer, Order, Staff, Auth)
    data/        DataService (abstract) + MockDataService + seed-data
    services/    AuthService (session), AppStateService (role-based nav)
    guards/      authGuard (require login), guestGuard (keep logged-in out of /login)
  features/
    landing/     Public marketing page
    auth/        Login (reactive form, validation, error handling)
    dashboard/   Daily order/dispatch summary (proves the data pipeline)
    placeholder/ Temporary stand-in for not-yet-built sections
  layout/
    shell/       Authenticated layout: sidebar + topbar around <router-outlet>
```

### Routing

- `/` — public landing
- `/login` — login (blocked when already authenticated)
- `/app/**` — authenticated shell (guarded); children: `dashboard`, `products`,
  `packaging`, `orders`, `customers`, `brands`, `catalogues`, plus customer views
  `home`, `basket`, `account`

Navigation items shown in the sidebar are derived from the signed-in role
(`AppStateService.navItems`).

---

## Swapping the mock for a real API

Every component and feature depends on the **abstract** `DataService`
(`core/data/data.service.ts`) — never on a concrete class. Going live is a two-step change
with **no component edits**:

1. Create `core/data/api-data.service.ts` that extends `DataService` and talks to your
   backend via `HttpClient`:

   ```ts
   @Injectable()
   export class ApiDataService extends DataService {
     private http = inject(HttpClient);
     private base = environment.apiUrl;

     getProducts(): Observable<Product[]> {
       return this.http.get<Product[]>(`${this.base}/products`);
     }
     // ...implement the rest of the abstract methods
   }
   ```

2. Change the single provider line in `src/app/app.config.ts`:

   ```ts
   // from:
   { provide: DataService, useClass: MockDataService },
   // to:
   { provide: DataService, useClass: ApiDataService },
   ```

`HttpClient` is already provided. Add an auth interceptor to attach the token from
`AuthService.token()` when your backend needs it.

---

## Conventions

- Standalone components with `ChangeDetectionStrategy.OnPush`.
- State via signals; derived values via `computed`.
- Async data via RxJS `Observable` from `DataService` (keeps the API swap seamless).
- All user-facing text escapes naturally through Angular bindings (no `innerHTML`).
- SCSS design tokens live in `src/styles.scss` (gold/dark theme, light-dark() aware).
```
