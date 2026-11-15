import { PriceTier } from './enums';

export interface Customer {
  id: number;
  name: string;
  code: string;
  phone: string;
  email: string;
  /** Wholesale tier that selects the display price. */
  category: PriceTier;
  address: string;
  active: boolean;
  /** Per-product price overrides keyed by productId. */
  overrides: Record<number, number>;

  // ---- Extended account fields (match prototype) --------------------
  /** Human-facing unique id, e.g. "CUS-0004". */
  customerId?: string;
  /** Login identifier the customer signs in with. */
  loginId?: string;
  /** 4-digit login password (demo only; a real backend hashes this). */
  loginPassword?: string;
  /** WhatsApp number (primary contact). */
  whatsapp?: string;
  /** Station groups customers located at the same place. */
  station?: string;
  stationId?: number;
  /** Contact person name. */
  contact?: string;
  /** Weekday the weekly payment reminder is sent. */
  reminderDay?: string;
  /** Per-brand discount percentages keyed by brand name. */
  brandDiscounts?: Record<string, number>;
}
