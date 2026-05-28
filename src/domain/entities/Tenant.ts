import { v4 as uuidv4 } from 'uuid';

export class Tenant {
  readonly id: string;
  name: string;
  destinationNumber: string;
  destinationVerified: boolean;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    name: string,
    destinationNumber: string,
    destinationVerified: boolean,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.name = name;
    this.destinationNumber = destinationNumber;
    this.destinationVerified = destinationVerified;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(name: string, destinationNumber: string): Tenant {
    const now = new Date();
    return new Tenant(
      uuidv4(),
      name,
      destinationNumber,
      false,
      now,
      now
    );
  }

  updateDestination(number: string, verified: boolean): void {
    this.destinationNumber = number;
    this.destinationVerified = verified;
    this.updatedAt = new Date();
  }

  updateName(name: string): void {
    this.name = name;
    this.updatedAt = new Date();
  }
}
