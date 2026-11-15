# BOTOZ — Footwear B2B Suite

Angular 20 implementation of the BOTOZ V15 prototype. The app now uses the BOTOZ REST API by default (`https://botoz.onrender.com`) through an API adapter; the local mock remains available for UI development.

## Run locally

```bash
npm install
npm start
```

Sign in with an account provisioned by the API. The API must allow browser requests from `http://localhost:4200` (CORS). For local mock data, set `useMockApi: true` in `src/environments/environment.ts`; the demo password is `botoz`.

## API integration currently wired

- Login, bearer authorization, and one-time access-token refresh/retry
- Paged brand, product, customer, staff, and order reads
- Brand create/rename/activate
- Product create/update, packing-group assignment and carton quantities, photo upload, and archive/restore
- Customer detail read and create/update, station lookup/create, brand discounts, and active status
- Order create and API-generated order IDs
- Response mapping from API DTOs into the existing Angular domain models

`ApiDataService` implements the `DataService` contract. API URL and mock selection live in `src/environments/environment.ts`. `MockDataService` remains selectable there.

## Known API gaps and assumptions

- The OpenAPI spec has no order-status update operation. The status editor is hidden in API mode; the feature remains available in mock mode.
- Per-product customer price overrides and photo archive/restore are not in the API contract, so those controls are hidden in API mode. Product photo upload is supported.
- Customer edit requests require a password every time according to the published request schema. The form follows that requirement.
- `UserDTO` does not expose a customer ID. Customer login currently assumes the authenticated user ID equals the customer ID; confirm this with the backend.
- The API request requires `adminRatePerPair`, but the UI has no such field. Order creation currently sends `0`; confirm the intended business rule before relying on that rate.
- Product sizes are represented through shared packing groups in the API. Adding sizes creates a size-only group; removing a size already in a shared group is blocked to avoid changing other products.
- The spec does not define the brand response DTO. Brand mapping assumes the usual `id`, `name`, and `active` fields.
- Customer-facing basket persistence, customer-specific API access rules, brand size locks, staff editing, and the dynamic menu options are not fully connected yet.

The API's `/api/admin/...` routes must authorize the intended roles server-side. Angular route guards are only a user-interface convenience, not an authorization boundary.

## Project structure

```text
src/app/
  core/data/          DataService, API adapter, local mock, seed data
  core/interceptors/  Bearer token + refresh handling
  core/models/        UI domain types and enums
  core/services/      Session, catalog, basket, order, app state, toast
  core/guards/        Authentication and role-aware route guards
  features/           Standalone pages by business area
  layout/shell/       Authenticated navigation and routed content
```
