import { UserRole } from './enums';

/** The authenticated user as seen by the UI. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  /** Set when the logged-in user is a Customer. */
  customerId?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  user: AuthUser;
  token: string;
}
