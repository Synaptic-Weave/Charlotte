import { UserRole } from './UserRole.js';

export class TenantAdmin extends UserRole {
  constructor(name: string, displayName: string, description: string) {
    super(name, displayName, description);
  }
}
