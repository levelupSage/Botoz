import { UserRole } from './enums';

export interface Staff {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  permissions: string[];
  active: boolean;
}
