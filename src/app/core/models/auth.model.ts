import { UserRole } from './enums';

/** The authenticated user as seen by the UI. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  /** Set when the logged-in user is a Customer. */
  customerId?: number;
  /** API-provided menu labels, when the account has a configured menu. */
  menus?: string[];
  orderTabs?: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  user: AuthUser;
  token: string;
  refreshToken?: string;
}

export type RegisterableAccountRole = 'SUPER_ADMIN' | 'ADMIN' | 'BACKEND_USER' | 'USER';

export interface RegistrationMenuTab {
  id: number;
  title: string;
  routePath: string;
  displayOrder: number;
}

export interface RegistrationMenuOption {
  id: number;
  title: string;
  routePath: string;
  icon: string;
  displayOrder: number;
  hasTab: boolean;
  tabs: RegistrationMenuTab[];
}

export interface RegisterAccountRequest {
  loginId: string;
  email: string;
  password: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  role: RegisterableAccountRole;
  menus: number[];
  orderTabs: number[];
}
