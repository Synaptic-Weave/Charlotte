import { v4 as uuidv4 } from 'uuid';

export class UserRole {
  readonly id: string;
  type!: string;
  readonly createdAt: Date;

  constructor() {
    this.id = uuidv4();
    this.createdAt = new Date();
  }
}
