import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BasketReviewModalComponent } from './basket-review-modal.component';

/**
 * The basket route is deliberately modal-only so the sidebar and product
 * catalogue both keep the prototype's review-basket dialog behaviour.
 */
@Component({
  selector: 'app-basket',
  imports: [BasketReviewModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './basket.component.html',
  styleUrl: './basket.component.scss',
})
export class BasketComponent {
  private readonly router = inject(Router);

  returnToProducts(): void {
    this.router.navigate(['/app', 'products']);
  }
}
