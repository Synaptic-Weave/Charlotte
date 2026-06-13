import { UserRoleSchema, SuperAdminSchema, TenantAdminSchema } from '../src/domain/schemas/UserRole.schema.js';
import { DepartmentSchema } from '../src/domain/schemas/Department.schema.js';
import { AppointmentSchema } from '../src/domain/schemas/Appointment.schema.js';
import { CustomerSchema } from '../src/domain/schemas/Customer.schema.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { User } from '../src/domain/entities/User.js';
import { SuperAdmin } from '../src/domain/entities/SuperAdmin.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { createAdminRolesRouter } from '../src/routes/admin/roles.js';
import { adminAuth } from '../src/middlewares/adminAuth.js';
import { tenantLocalStorage, runInTenantTransaction } from '../src/db/context.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { CallSessionSchema } from '../src/domain/schemas/CallSession.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';
import { UserRoleSchema, SuperAdminSchema, TenantAdminSchema } from '../src/domain/schemas/UserRole.schema.js';
import { DepartmentSchema } from '../src/domain/schemas/Department.schema.js';
import { CustomerSchema } from '../src/domain/schemas/Customer.schema.js';
import { AppointmentSchema } from '../src/domain/schemas/Appointment.schema.js';

const JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

async function setupTestDatabase(): Promise<string> {
  const possibleUrls = [
    process.env.DATABASE_URL,
    'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://localhost:5432/charlotte_db?sslmode=disable',
  ].filter((url): url is string => !!url);

  for (const url of possibleUrls) {
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.end();
      return url;
    } catch (e) {
      // Ignore
    }
  }

  const systemUrl = 'postgresql://postgres:password@localhost:5432/postgres?sslmode=disable';
  const client = new Client({ connectionString: systemUrl });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'charlotte_db'");
    if (res.rowCount === 0) {
      await client.query("CREATE DATABASE charlotte_db");
    }
  } catch (e) {
    throw new Error('Could not resolve postgres connection or create charlotte_db.');
  } finally {
    await client.end();
  }

  return 'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable';
}

describe('Admin Roles API Integration Tests', () => {
  let orm: MikroORM;
  let dbUrl: string;
  let server: http.Server;
  let baseUrl: string;

  let tenantA: Tenant;
  let userStandard: User;
  let userSuperAdmin: User;
  let userTarget: User;

  let tokenStandard: string;
  let tokenSuperAdmin: string;

  beforeAll(async () => {
    dbUrl = await setupTestDatabase();

    process.env.JWT_SECRET = JWT_SECRET;

    orm = await MikroORM.init({
      ...config,
      clientUrl: dbUrl,
      // Need to make sure we include all entities
      entities: [TenantSchema, UserSchema, OrganizationSchema, CallSessionSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema, DepartmentSchema, CustomerSchema, AppointmentSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, CallSessionSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema, DepartmentSchema, CustomerSchema, AppointmentSchema],
    });

    const generator = orm.getSchemaGenerator();
    await generator.refreshDatabase();

    tenantA = Tenant.create('Tenant A - Acme Corp', '+15551112222');

    await tenantLocalStorage.run({ tenantId: tenantA.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        userStandard = User.create(tenantA, 'standard@acme.com', 'hashed_pwd_1');
        
        userSuperAdmin = User.create(tenantA, 'super@acme.com', 'hashed_pwd_2');
        const superRole = new SuperAdmin();
        txEm.persist(superRole);
        userSuperAdmin.updateRole(superRole);
        
        userTarget = User.create(tenantA, 'target@acme.com', 'hashed_pwd_3');

        txEm.persist([tenantA, userStandard, userSuperAdmin, userTarget]);
        await txEm.flush();
      });
    });

    tokenStandard = jwt.sign(
      { tenantId: tenantA.id, userId: userStandard.id, role: 'standard' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    tokenSuperAdmin = jwt.sign(
      { tenantId: tenantA.id, userId: userSuperAdmin.id, role: 'super_admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const app = express();
    app.use(express.json());
    app.use('/api/admin/roles', adminAuth, createAdminRolesRouter(orm.em));

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    if (orm) {
      // clean up DB
      await orm.em.nativeDelete(User, { tenant: tenantA.id });
      await orm.em.nativeDelete(Tenant, { id: tenantA.id });
      await orm.close();
    }
  });

  it('should deny access to standard users without super_admin role', async () => {
    const response = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStandard}`,
      },
      body: JSON.stringify({
        email: 'target@acme.com',
        roleType: 'tenant_admin',
      }),
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden: SuperAdmin access required.');
  });

  it('should allow super_admin to grant tenant_admin role', async () => {
    const response = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSuperAdmin}`,
      },
      body: JSON.stringify({
        email: 'target@acme.com',
        roleType: 'tenant_admin',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('Role assigned successfully.');

    // Verify in db
    const fork = orm.em.fork();
    const updatedUser = await fork.findOne(User, { id: userTarget.id }, { populate: ['role'] });
    expect(updatedUser?.role?.type).toBe('tenant_admin');
  });

  it('should fail if email is missing', async () => {
    const response = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSuperAdmin}`,
      },
      body: JSON.stringify({
        roleType: 'tenant_admin',
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Email and roleType are required.');
  });

  it('should fail if roleType is invalid', async () => {
    const response = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSuperAdmin}`,
      },
      body: JSON.stringify({
        email: 'target@acme.com',
        roleType: 'fake_role_xyz',
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid roleType.');
  });

  it('should fail if user is not found', async () => {
    const response = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSuperAdmin}`,
      },
      body: JSON.stringify({
        email: 'doesnotexist@acme.com',
        roleType: 'tenant_admin',
      }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('User not found.');
  });
});
