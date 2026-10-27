import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { DataService } from './core/data/data.service';
import { MockDataService } from './core/data/mock-data.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptorsFromDi()),

    // ---- Swappable data layer -----------------------------------------
    // Today: in-memory + localStorage mock.
    // To go live, replace MockDataService with an ApiDataService (same
    // abstract contract) — no component or feature code needs to change.
    { provide: DataService, useClass: MockDataService },
  ],
};
