import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  readonly year = new Date().getFullYear();

  readonly features = [
    {
      icon: '▧',
      title: 'Catalogue & pricing',
      text: 'Manage products, photos, MRP and A/B/C wholesale price tiers in one place.',
    },
    {
      icon: '≡',
      title: 'Size & carton ordering',
      text: 'Customers order size-wise or by configured carton packings — no guesswork.',
    },
    {
      icon: '◷',
      title: 'Order lifecycle',
      text: 'Track every order from confirmed through processing to dispatched.',
    },
    {
      icon: '♙',
      title: 'Customer accounts',
      text: 'Per-customer pricing, baskets and order history kept separate and clean.',
    },
  ];
}
