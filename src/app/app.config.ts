import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { DataService } from './core/data/data.service';
import { ApiDataService } from './core/data/api-data.service';
import { MockDataService } from './core/data/mock-data.service';
import { apiAuthInterceptor } from './core/interceptors/api-auth.interceptor';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([apiAuthInterceptor])),

    // ---- Swappable data layer -----------------------------------------
    {
      provide: DataService,
      useClass: environment.useMockApi ? MockDataService : ApiDataService,
    },
  ],
};
