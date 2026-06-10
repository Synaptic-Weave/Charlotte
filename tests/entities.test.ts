import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { User } from '../src/domain/entities/User.js';
import { Organization } from '../src/domain/entities/Organization.js';
import { Customer } from '../src/domain/entities/Customer.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { CustomerSchema } from '../src/domain/schemas/Customer.schema.js';

describe('Domain Entities and Companion Schemas', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    // Initialize ORM without connecting to database to discover metadata
    orm = await MikroORM.init({
      ...config,
      entities: [TenantSchema, UserSchema, OrganizationSchema, CustomerSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, CustomerSchema],
      connect: false,
    });
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
  });

  it('should cleanly load and discover entities and schemas', () => {
    const metadata = orm.getMetadata();
    
    expect(metadata.has('Tenant')).toBe(true);
    expect(metadata.has('User')).toBe(true);
    expect(metadata.has('Organization')).toBe(true);
    expect(metadata.has('Customer')).toBe(true);

    const tenantMeta = metadata.get('Tenant');
    expect(tenantMeta.tableName).toBe('tenants');
    expect(tenantMeta.properties.destinationNumber).toBeDefined();
    expect(tenantMeta.properties.destinationVerified).toBeDefined();

    const userMeta = metadata.get('User');
    expect(userMeta.tableName).toBe('users');
    expect(userMeta.properties.tenant).toBeDefined();
    expect(userMeta.properties.tenant.kind).toBe('m:1');
    expect(userMeta.properties.tenant.entity()).toBe('Tenant');

    const orgMeta = metadata.get('Organization');
    expect(orgMeta.tableName).toBe('organizations');
    expect(orgMeta.properties.tenant).toBeDefined();
    expect(orgMeta.properties.tenant.kind).toBe('m:1');
    expect(orgMeta.properties.tenant.entity()).toBe('Tenant');
  });

  it('should instantiate Tenant via static factory method', () => {
    const tenant = Tenant.create('Acme Corp', '+15551234567');
    expect(tenant).toBeInstanceOf(Tenant);
    expect(tenant.id).toBeDefined();
    expect(tenant.name).toBe('Acme Corp');
    expect(tenant.destinationNumber).toBe('+15551234567');
    expect(tenant.destinationVerified).toBe(false);
    expect(tenant.createdAt).toBeInstanceOf(Date);
    expect(tenant.updatedAt).toBeInstanceOf(Date);
  });

  it('should instantiate User via static factory method', () => {
    const tenant = Tenant.create('Acme Corp', '+15551234567');
    const user = User.create(tenant, 'test@example.com', 'hashed_pwd', 'admin');
    expect(user).toBeInstanceOf(User);
    expect(user.id).toBeDefined();
    expect(user.tenant).toBe(tenant);
    expect(user.email).toBe('test@example.com');
    expect(user.passwordHash).toBe('hashed_pwd');
    expect(user.role).toBe('admin');
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('should instantiate Organization via static factory method', () => {
    const tenant = Tenant.create('Acme Corp', '+15551234567');
    const org = Organization.create(tenant, 'Engineering Dept');
    expect(org).toBeInstanceOf(Organization);
    expect(org.id).toBeDefined();
    expect(org.tenant).toBe(tenant);
    expect(org.name).toBe('Engineering Dept');
    expect(org.createdAt).toBeInstanceOf(Date);
    expect(org.updatedAt).toBeInstanceOf(Date);
  });

  it('should instantiate Customer via static factory method', () => {
    const tenant = Tenant.create('Acme Corp', '+15551234567');
    const customer = Customer.create(tenant, 'Jane Doe', '+15550001111', 'VIP client');
    expect(customer).toBeInstanceOf(Customer);
    expect(customer.id).toBeDefined();
    expect(customer.tenant).toBe(tenant);
    expect(customer.name).toBe('Jane Doe');
    expect(customer.phoneNumber).toBe('+15550001111');
    expect(customer.context).toBe('VIP client');
    expect(customer.createdAt).toBeInstanceOf(Date);
    expect(customer.updatedAt).toBeInstanceOf(Date);
  });

  it('should verify that domain entities are completely decorator-free and decoupled from Mikro-ORM', () => {
    const fs = require('fs');
    const path = require('path');
    const entitiesDir = path.join(process.cwd(), 'src/domain/entities');
    const files = fs.readdirSync(entitiesDir);

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      if (!file.endsWith('.ts')) continue;

      const filePath = path.join(entitiesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Ensure no imports of Mikro-ORM decorators or decorators are used
      expect(content).not.toContain('@mikro-orm');
      expect(content).not.toMatch(/@Entity/i);
      expect(content).not.toMatch(/@Property/i);
      expect(content).not.toMatch(/@PrimaryKey/i);
      expect(content).not.toMatch(/@ManyToOne/i);
      expect(content).not.toMatch(/@OneToMany/i);
      expect(content).not.toMatch(/@ManyToMany/i);
    }
  });
});
