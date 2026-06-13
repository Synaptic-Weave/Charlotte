import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { User } from '../src/domain/entities/User.js';
import { CallSession } from '../src/domain/entities/CallSession.js';
import { TwilioPhoneNumber } from '../src/domain/entities/TwilioPhoneNumber.js';
import { createAdminRouter } from '../src/routes/admin.js';
import { runInTenantTransaction } from '../src/db/context.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { CallSessionSchema } from '../src/domain/schemas/CallSession.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';

const JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

async function setupTestDatabase(): Promise<string> {
  const possibleUrls = [
    process.env.DATABASE_URL,
    'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://localhost:5432/charlotte_db?sslmode=disable',
  ].filter((url): url is string => !!url);

  let systemUrl = '';
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

  const systemUrls = [
    'postgresql://charlotte_admin:password@localhost:5432/postgres?sslmode=disable',
    'postgresql://postgres:password@localhost:5432/postgres?sslmode=disable',
    'postgresql://postgres@localhost:5432/postgres?sslmode=disable',
    'postgresql://localhost:5432/postgres?sslmode=disable',
  ];
  for (const url of systemUrls) {
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.end();
      systemUrl = url;
      break;
    } catch (e) {
      // Ignore
    }
  }

  if (systemUrl) {
    const client = new Client({ connectionString: systemUrl });
    await client.connect();
    try {
      await client.query('CREATE DATABASE charlotte_db');
    } catch (e) {
      // Already exists
    }
    await client.end();
    return systemUrl.replace('/postgres', '/charlotte_db');
  }

  throw new Error('Could not find a valid database connection for tests');
}

let orm: MikroORM;
let server: http.Server;
let baseUrl: string;
let adminToken: string;
let userToken: string;
let tenant1: Tenant;
let tenant2: Tenant;

beforeAll(async () => {
  const dbUrl = await setupTestDatabase();
  process.env.DATABASE_URL = dbUrl;
  process.env.JWT_SECRET = JWT_SECRET;

  orm = await MikroORM.init({
    ...config,
    clientUrl: dbUrl,
    entitiesTs: [],
    entities: [
      TenantSchema,
      UserSchema,
      CallSessionSchema,
      OrganizationSchema,
      TwilioPhoneNumberSchema
    ],
    debug: false,
    schemaGenerator: {
      disableForeignKeys: true,
      createForeignKeyConstraints: true,
      ignoreSchema: [],
    },
  });

  const generator = orm.getSchemaGenerator();
  await generator.ensureDatabase();
  await generator.dropSchema();
  await generator.createSchema();

  const app = express();
  app.use(express.json());
  
  // Create test router just for this test
  app.use('/api/admin', createAdminRouter(orm.em));

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;

  // Seed data
  const globalEm = orm.em.fork();
  tenant1 = Tenant.create('Admin Test Tenant 1', '+15550000001');
  tenant2 = Tenant.create('Admin Test Tenant 2', '+15550000002');
  
  const adminUser = User.create(tenant1, 'admin@test.com', 'pwd', 'admin');
  const normalUser = User.create(tenant1, 'user@test.com', 'pwd', 'user');

  globalEm.persist([tenant1, tenant2, adminUser, normalUser]);
  await globalEm.flush();

  const phone1 = TwilioPhoneNumber.create(tenant1, '+15550000001', 'Tenant 1 Primary');
  const phone2 = TwilioPhoneNumber.create(tenant1, '+15550000002', 'Tenant 1 Secondary');
  const phone3 = TwilioPhoneNumber.create(tenant2, '+15550000003', 'Tenant 2 Primary');

  const call1 = CallSession.create(tenant1, 'sid-active', '+15559990001');
  call1.updateStatus('active');
  const call2 = CallSession.create(tenant1, 'sid-initiated', '+15559990002');
  call2.updateStatus('initiated');
  const call3 = CallSession.create(tenant2, 'sid-completed', '+15559990003');
  call3.updateStatus('completed');
  const call4 = CallSession.create(tenant2, 'sid-active-2', '+15559990004');
  call4.updateStatus('active');

  globalEm.persist([phone1, phone2, phone3, call1, call2, call3, call4]);
  await globalEm.flush();

  adminToken = jwt.sign(
    { tenantId: tenant1.id, userId: adminUser.id, role: adminUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  userToken = jwt.sign(
    { tenantId: tenant1.id, userId: normalUser.id, role: normalUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (orm) {
    await orm.close();
  }
});

describe('Admin Metrics API', () => {
  it('should deny access to non-admin users', async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('should return global system stats', async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    
    // We should see both tenants and all numbers
    expect(body.totalTenants).toBeGreaterThanOrEqual(2);
    expect(body.totalNumbers).toBeGreaterThanOrEqual(3);
    expect(body.mockLatency).toBe('120ms');
  });

  it('should return global live calls', async () => {
    const res = await fetch(`${baseUrl}/api/admin/calls/live`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    
    expect(Array.isArray(body)).toBe(true);
    // There are 3 live calls: active, initiated, active-2
    expect(body.length).toBeGreaterThanOrEqual(3);
    
    for (const call of body) {
      expect(['active', 'initiated']).toContain(call.status);
      expect(call.id).toBeDefined();
      expect(call.tenantId).toBeDefined();
      expect(call.callSid).toBeDefined();
    }
  });
});
