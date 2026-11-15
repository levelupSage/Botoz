import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppStateService } from '../../core/services/app-state.service';

/** Resolves /app to the authenticated user's first role-specific section. */
@Component({
  selector: 'app-home-redirect',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHomeRedirectComponent implements OnInit {
  private readonly appState = inject(AppStateService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.appState.defaultRoute(), { replaceUrl: true });
  }
}
