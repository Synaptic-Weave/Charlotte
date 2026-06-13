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
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { UserRoleSchema, SuperAdminSchema, TenantAdminSchema } from '../src/domain/schemas/UserRole.schema.js';
import { CallSessionSchema } from '../src/domain/schemas/CallSession.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';
import { createCallsRouter } from '../src/routes/calls.js';
import { tenantLocalStorage, runInTenantTransaction } from '../src/db/context.js';

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

describe('Charlotte Calls & Transcript RLS Endpoint Integration Tests', () => {
  let orm: MikroORM;
  let dbSuperUrl: string;
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  let tenantA: Tenant;
  let tenantB: Tenant;
  let userA: User;
  let userB: User;

  let tokenA: string;
  let tokenB: string;

  let callIdA: string;

  beforeAll(async () => {
    dbSuperUrl = await setupTestDatabase();

    // 1. Initialize Mikro-ORM as superuser to run migrations and enforce RLS
    const superOrm = await MikroORM.init({
      ...config,
      clientUrl: dbSuperUrl,
      entities: [TenantSchema, UserSchema, CallSessionSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
      entitiesTs: [TenantSchema, UserSchema, CallSessionSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
    });

    try {
      const migrator = superOrm.getMigrator();
      await migrator.up();

      await superOrm.em.execute('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE call_sessions FORCE ROW LEVEL SECURITY;');
    } finally {
      await superOrm.close();
    }

    // 2. Create the temporary non-superuser test role
    const superClient = new Client({ connectionString: dbSuperUrl });
    await superClient.connect();
    try {
      await superClient.query('DROP ROLE IF EXISTS charlotte_calls_test_role;');
      await superClient.query("CREATE ROLE charlotte_calls_test_role WITH LOGIN PASSWORD 'test_password';");
      await superClient.query('GRANT ALL PRIVILEGES ON DATABASE charlotte_db TO charlotte_calls_test_role;');
      await superClient.query('GRANT USAGE ON SCHEMA public TO charlotte_calls_test_role;');
      await superClient.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO charlotte_calls_test_role;');
      await superClient.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO charlotte_calls_test_role;');
    } finally {
      await superClient.end();
    }

    // 3. Connect Mikro-ORM as the non-superuser test role
    const testUserUrl = new URL(dbSuperUrl);
    testUserUrl.username = 'charlotte_calls_test_role';
    testUserUrl.password = 'test_password';
    const workingUrl = testUserUrl.toString();

    orm = await MikroORM.init({
      ...config,
      clientUrl: workingUrl,
      entities: [TenantSchema, UserSchema, CallSessionSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
      entitiesTs: [TenantSchema, UserSchema, CallSessionSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
    });

    // 4. Seed Isolated Tenant A & B Data
    tenantA = Tenant.create('Tenant A - Acme Corp', '+15551112222');
    tenantB = Tenant.create('Tenant B - Stark Industries', '+15553334444');

    await tenantLocalStorage.run({ tenantId: tenantA.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        userA = User.create(tenantA, 'user-a@acme.com', 'hashed_pwd_a');
        txEm.persist([tenantA, userA]);
        await txEm.flush();
      });
    });

    await tenantLocalStorage.run({ tenantId: tenantB.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        userB = User.create(tenantB, 'user-b@stark.com', 'hashed_pwd_b');
        txEm.persist([tenantB, userB]);
        await txEm.flush();
      });
    });

    // 5. Generate JWT tokens
    tokenA = jwt.sign(
      { tenantId: tenantA.id, userId: userA.id, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    tokenB = jwt.sign(
      { tenantId: tenantB.id, userId: userB.id, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 6. Initialize Express Server
    const app = express();
    app.use(express.json());
    app.use('/api/tenants/calls', createCallsRouter(orm.em));

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    if (orm) {
      await orm.close();
    }

    if (dbSuperUrl) {
      try {
        const superClient = new Client({ connectionString: dbSuperUrl });
        await superClient.connect();
        try {
          await superClient.query('ALTER TABLE call_sessions DISABLE ROW LEVEL SECURITY;');
          if (tenantA && tenantB) {
            await superClient.query(
              'DELETE FROM tenants WHERE id IN ($1, $2)',
              [tenantA.id, tenantB.id]
            );
          }
          await superClient.query('DROP OWNED BY charlotte_calls_test_role;');
          await superClient.query('DROP ROLE IF EXISTS charlotte_calls_test_role;');
        } finally {
          await superClient.end();
        }
      } catch (err) {
        console.error('Error during teardown cleanup:', err);
      }
    }
  });

  it('should allow Tenant A to fetch empty call logs initially', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.calls).toEqual([]);
  });

  it('should allow Tenant A to create a simulated call session', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ callerNumber: '+15559998888' }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.call).toBeDefined();
    expect(data.call.caller).toBe('+15559998888');
    expect(data.call.status).toBe('active');
    expect(data.call.messages).toEqual([]);

    callIdA = data.call.id;
  });

  it('should allow Tenant A to fetch their seeded call log', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.calls.length).toBe(1);
    expect(data.calls[0].id).toBe(callIdA);
    expect(data.calls[0].caller).toBe('+15559998888');
  });

  it('should allow Tenant A to append transcript messages to their call session', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls/${callIdA}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        speaker: 'caller',
        text: 'Hello, this is a test message.',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.messages.length).toBe(1);
    expect(data.messages[0].speaker).toBe('caller');
    expect(data.messages[0].text).toBe('Hello, this is a test message.');
  });

  it('should allow Tenant A to update call status', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls/${callIdA}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        status: 'completed',
        streamSid: 'MZ_MOCK_STREAM_SID_123',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.call.status).toBe('completed');
  });

  it('should ensure Tenant B fetches empty call logs and cannot see Tenant A\'s logs', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.calls).toEqual([]);
  });

  it('should block Tenant B from appending messages to Tenant A\'s call session', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls/${callIdA}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        speaker: 'charlotte',
        text: 'This should fail.',
      }),
    });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Call session not found');
  });

  it('should block Tenant B from updating Tenant A\'s call session status', async () => {
    const response = await fetch(`${baseUrl}/api/tenants/calls/${callIdA}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        status: 'failed',
      }),
    });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Call session not found');
  });
});
