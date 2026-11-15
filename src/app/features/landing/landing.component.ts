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
    { icon: '01', title: 'One clear catalogue', text: 'Keep product details, photos, sizes, and wholesale price tiers together.' },
    { icon: '02', title: 'Orders that add up', text: 'Build size-wise or carton orders with customer-specific prices.' },
    { icon: '03', title: 'A smoother workflow', text: 'Give teams one place to manage customers, orders, and dispatch progress.' },
  ];

  readonly steps = [
    { number: '01', title: 'Choose a customer', text: 'Use the right account and pricing tier.' },
    { number: '02', title: 'Build the order', text: 'Select products, sizes, and carton quantities.' },
    { number: '03', title: 'Track progress', text: 'Keep order updates visible to your team.' },
  ];
}
