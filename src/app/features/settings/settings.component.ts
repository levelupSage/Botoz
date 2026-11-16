import { ChangeDetectionStrategy, Component } from '@angular/core';

interface Rule {
  title: string;
  description: string;
}

@Component({
  selector: 'app-settings',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly orderingRules: Rule[] = [
    { title: 'Immediate order confirmation', description: 'Confirm after a successful transactional save; no admin approval queue.' },
    { title: 'No inventory management', description: 'This app does not track stock, deduct inventory, or block orders by stock availability.' },
    { title: 'Order types', description: 'Support size-wise quantities and product-specific carton templates.' },
    { title: 'Immutable history', description: 'Keep product, price, sizes, carton packing, and quantity snapshots on each order line.' },
    { title: 'Order status', description: 'Confirmed → Processing → Dispatched → Delivered.' },
    { title: 'Customer price visibility', description: 'Show assigned prices on products; keep monetary totals out of basket and order history.' },
  ];

  readonly securityRules: Rule[] = [
    { title: 'Server-side access control', description: 'The backend must validate every action; hiding a client button is not authorization.' },
    { title: 'Transactional order save', description: 'Use unique order IDs and idempotency to prevent duplicate submissions.' },
    { title: 'Customer privacy', description: 'Customers may access only their own profile, assigned prices, and orders.' },
    { title: 'Audit trail', description: 'Record staff actions, price edits, category changes, and archive/restore events.' },
    { title: 'Photo lifecycle', description: 'Archive individual photos, hide products with no active photos, and retain order snapshots.' },
    { title: 'PDF privacy', description: 'Standard catalogues never include customer-specific prices; label customer catalogues clearly.' },
  ];

  readonly architecture = [
    { title: 'Customer app', description: 'Mobile-friendly web or Flutter client.' },
    { title: 'Admin panel', description: 'Web tools for product and order operations.' },
    { title: 'Backend API', description: 'Authentication, permissions, and shared realtime data.' },
    { title: 'Database & photos', description: 'Central SQL database and object storage.' },
  ];
}
