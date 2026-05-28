import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';

export class TwilioPhoneNumber {
  readonly id: string;
  tenant: Tenant;
  phoneNumber: string;
  friendlyName: string;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    phoneNumber: string,
    friendlyName: string,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.phoneNumber = phoneNumber;
    this.friendlyName = friendlyName;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, phoneNumber: string, friendlyName: string): TwilioPhoneNumber {
    const now = new Date();
    return new TwilioPhoneNumber(
      uuidv4(),
      tenant,
      phoneNumber,
      friendlyName,
      now,
      now
    );
  }

  updateFriendlyName(friendlyName: string): void {
    this.friendlyName = friendlyName;
    this.updatedAt = new Date();
  }
}
