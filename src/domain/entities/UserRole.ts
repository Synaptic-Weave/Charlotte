import { v4 as uuidv4 } from 'uuid';

export abstract class UserRole {
  readonly id: string;
  name: string;
  displayName: string;
  description: string;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(name: string, displayName: string, description: string) {
    this.id = uuidv4();
    this.name = name;
    this.displayName = displayName;
    this.description = description;
    const now = new Date();
    this.createdAt = now;
    this.updatedAt = now;
  }
}
