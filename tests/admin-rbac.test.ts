import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { User } from '../src/domain/entities/User.js';
import { UserRole } from '../src/domain/entities/UserRole.js';
import { SuperAdmin } from '../src/domain/entities/SuperAdmin.js';
import { Organization } from '../src/domain/entities/Organization.js';
import { TwilioPhoneNumber } from '../src/domain/entities/TwilioPhoneNumber.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { UserRoleSchema } from '../src/domain/schemas/UserRole.schema.js';
import { SuperAdminSchema } from '../src/domain/schemas/SuperAdmin.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';
import { createAdminRouter } from '../src/routes/admin.js';
import { v4 as uuidv4 } from 'uuid';
import { TenantAdminSchema } from '../src/domain/schemas/TenantAdmin.schema.js';

const JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

// Self-healing database connection discovery helper
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
      // Ignore and try next
    }
  }

  // Administrative fallback
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

describe('Admin RBAC Middleware and Routes Integration Tests', () => {
  let orm: MikroORM;
  let dbUrl: string;
  let server: http.Server;
  let baseUrl: string;

  let seededTenant: Tenant;
  let normalUser: User;
  let superAdminUser: User;

  let normalUserToken: string;
  let superAdminToken: string;
  let adminRole: SuperAdmin;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    
    dbUrl = await setupTestDatabase();

    // 1. Initialize MikroORM with required entities
    orm = await MikroORM.init({
      ...config,
      clientUrl: dbUrl,
      entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
    });

    await orm.getMigrator().up();
    await orm.getSchemaGenerator().updateSchema();

    // 2. Setup Test Data
    const em = orm.em.fork();

    // Cleanup existing for isolation
    await em.nativeDelete(User, {});
    await em.nativeDelete(UserRole, {});
    await em.nativeDelete(Tenant, {});
    
    seededTenant = Tenant.create('Test Tenant Admin RBAC', 'test-tenant-admin-rbac');
    em.persist(seededTenant);

    // Create Normal User
    normalUser = User.create(seededTenant, 'normal@example.com', 'hashed-pwd', 'user');
    em.persist(normalUser);

    // Create SuperAdmin User
    superAdminUser = User.create(seededTenant, 'superadmin@example.com', 'hashed-pwd', 'admin');
    
    // Assign SuperAdmin Role
    adminRole = new SuperAdmin('super_admin', 'Super Admin', 'Has all permissions');
    em.persist(adminRole);
    superAdminUser.addRole(adminRole);
    em.persist(superAdminUser);

    await em.flush();

    // 3. Generate tokens
    normalUserToken = jwt.sign(
      { userId: normalUser.id, tenantId: seededTenant.id, role: normalUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    superAdminToken = jwt.sign(
      { userId: superAdminUser.id, tenantId: seededTenant.id, role: superAdminUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 4. Setup Express App
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mount Admin Router
    app.use('/api/admin', createAdminRouter(orm.em));

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
      const em = orm.em.fork();
      await em.nativeDelete(User, {});
      await em.nativeDelete(UserRole, {});
      await em.nativeDelete(Tenant, {});
      await orm.close();
    }
  });

  describe('GET /api/admin/roles', () => {
    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/admin/roles`);
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden for a normal user', async () => {
      const res = await fetch(`${baseUrl}/api/admin/roles`, {
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
        },
      });
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data.error).toBe('Forbidden: Super Admin access required.');
    });

    it('should return 200 OK and roles for a SuperAdmin user', async () => {
      const res = await fetch(`${baseUrl}/api/admin/roles`, {
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
        },
      });
      expect(res.status).toBe(200);
      
      const roles = await res.json();
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThanOrEqual(1);
      
      const returnedAdminRole = roles.find((r: any) => r.id === adminRole.id);
      expect(returnedAdminRole).toBeDefined();
      expect(returnedAdminRole.name).toBe('super_admin');
    });
  });

  describe('PUT /api/admin/roles/:id', () => {
    it('should return 403 Forbidden for a normal user', async () => {
      const res = await fetch(`${baseUrl}/api/admin/roles/${adminRole.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ displayName: 'Hacked Name' })
      });
      expect(res.status).toBe(403);
    });

    it('should allow a SuperAdmin to update a role', async () => {
      const newDisplayName = 'Updated Super Admin';
      const res = await fetch(`${baseUrl}/api/admin/roles/${adminRole.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ displayName: newDisplayName })
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.displayName).toBe(newDisplayName);
    });
  });

  describe('POST /api/admin/users/:userId/roles', () => {
    it('should return 403 Forbidden for a normal user', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${normalUser.id}/roles`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ roleId: adminRole.id })
      });
      expect(res.status).toBe(403);
    });

    it('should allow a SuperAdmin to assign a role to a user', async () => {
      // First, check the normal user does not have the role
      const res1 = await fetch(`${baseUrl}/api/admin/users/${normalUser.id}/roles`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ roleId: adminRole.id })
      });
      
      expect(res1.status).toBe(200);
      const data = await res1.json();
      expect(data.message).toBe('Role assigned successfully.');
      
      // Ensure the user now has the role
      const hasRole = data.user.roles.some((r: any) => r.id === adminRole.id);
      expect(hasRole).toBe(true);
    });
  });
});
