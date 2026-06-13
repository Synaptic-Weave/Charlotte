import { UserRole } from './UserRole.js';

export class SuperAdmin extends UserRole {
  constructor(name: string, displayName: string, description: string) {
    super(name, displayName, description);
  }
}
