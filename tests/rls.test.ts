
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { User } from '../src/domain/entities/User.js';
import { Organization } from '../src/domain/entities/Organization.js';
import { TwilioPhoneNumber } from '../src/domain/entities/TwilioPhoneNumber.js';
import { CallSession } from '../src/domain/entities/CallSession.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';
import { CallSessionSchema } from '../src/domain/schemas/CallSession.schema.js';
import { CustomerSchema } from '../src/domain/schemas/Customer.schema.js';
import { Customer } from '../src/domain/entities/Customer.js';
import { CustomerService } from '../src/services/CustomerService.js';
import { tenantLocalStorage, runInTenantTransaction } from '../src/db/context.js';

// Self-healing database connection discovery helper (superuser/owner context)
async function setupTestDatabase(): Promise<string> {
  const possibleUrls = [
    process.env.DATABASE_URL,
    'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://localhost:5432/charlotte_db?sslmode=disable',
  ].filter((url): url is string => !!url);

  // First, check if we can connect to charlotte_db directly
  for (const url of possibleUrls) {
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.end();
      console.log(`Successfully connected directly to charlotte_db using: ${url.replace(/:[^:@]+@/, ':***@')}`);
      return url;
    } catch {
      // Ignore and try next
    }
  }

  // If charlotte_db is not accessible directly, let's try connecting to the system 'postgres' db
  // using various credentials to see if we can create charlotte_db
  const systemUrls = [
    'postgresql://charlotte_admin:password@localhost:5432/postgres?sslmode=disable',
    'postgresql://postgres:password@localhost:5432/postgres?sslmode=disable',
    'postgresql://postgres@localhost:5432/postgres?sslmode=disable',
    'postgresql://localhost:5432/postgres?sslmode=disable',
  ];

  let systemUrl: string | null = null;
  for (const url of systemUrls) {
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.end();
      systemUrl = url;
      console.log(`Successfully connected to administrative postgres db using: ${url.replace(/:[^:@]+@/, ':***@')}`);
      break;
    } catch {
      // Ignore
    }
  }

  if (!systemUrl) {
    throw new Error('Could not connect to PostgreSQL on localhost:5432 with any known credentials. Please check that postgres is running.');
  }

  // Connect to postgres db and create charlotte_db if it doesn't exist
  const client = new Client({ connectionString: systemUrl });
  await client.connect();
  try {
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'charlotte_db'");
    if (res.rowCount === 0) {
      console.log('Database "charlotte_db" does not exist. Creating database...');
      await client.query("CREATE DATABASE charlotte_db");
      console.log('Database "charlotte_db" created successfully.');
    } else {
      console.log('Database "charlotte_db" already exists.');
    }
  } finally {
    await client.end();
  }

  // Now, try connecting to the newly created/existing charlotte_db
  const parsed = new URL(systemUrl);
  parsed.pathname = '/charlotte_db';
  const newDbUrl = parsed.toString();
  
  // Verify we can connect to the new URL
  const testClient = new Client({ connectionString: newDbUrl });
  await testClient.connect();
  await testClient.end();
  return newDbUrl;
}

describe('PostgreSQL Row-Level Security (RLS) Integration Tests', () => {
  let orm: MikroORM;
  let dbSuperUrl: string;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let userA: User;
  let userB: User;
  let orgA: Organization;
  let orgB: Organization;
  let sessionA: CallSession;
  let sessionB: CallSession;

  beforeAll(async () => {
    // 1. Establish database connection and verify/create database (using superuser/owner)
    dbSuperUrl = await setupTestDatabase();

    // 2. Initialize Mikro-ORM as superuser first to run migrations and enforce RLS
    const superOrm = await MikroORM.init({
      ...config,
      clientUrl: dbSuperUrl,
      entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],
    });

    try {
      const migrator = superOrm.getMigrator();
      console.log('Running pending migrations as superuser...');
      await migrator.up();
      console.log('Migrations completed successfully.');

      console.log('Enforcing Row-Level Security on all multi-tenant tables...');
      await superOrm.em.execute('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE twilio_phone_numbers ENABLE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;');

      // Force RLS on owners/superusers for completeness
      await superOrm.em.execute('ALTER TABLE tenants FORCE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE users FORCE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE organizations FORCE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE twilio_phone_numbers FORCE ROW LEVEL SECURITY;');
      await superOrm.em.execute('ALTER TABLE call_sessions FORCE ROW LEVEL SECURITY;');

      // 2.5 Seed Isolated Tenant A & B Data using superOrm to bypass RLS for initial creation
      tenantA = Tenant.create('Tenant A - Acme Corp', '+15551002001');
      userA = User.create(tenantA, 'admin@acme.com', 'hashed_pwd_acme', 'admin');
      orgA = Organization.create(tenantA, 'Acme Engineering');
      const phoneA = TwilioPhoneNumber.create(tenantA, '+15125550100', 'Acme Hotline');
      sessionA = CallSession.create(tenantA, 'CA_RLS_TEST_ACME_001');
      const customerA = Customer.create(tenantA, 'Alice', '+15550001111', 'Acme VIP');

      tenantB = Tenant.create('Tenant B - Stark Industries', '+15552003002');
      userB = User.create(tenantB, 'admin@stark.com', 'hashed_pwd_stark', 'admin');
      orgB = Organization.create(tenantB, 'Stark R&D');
      const phoneB = TwilioPhoneNumber.create(tenantB, '+15125550101', 'Stark Hotline');
      sessionB = CallSession.create(tenantB, 'CA_RLS_TEST_STARK_001');
      const customerB = Customer.create(tenantB, 'Bob', '+15550002222', 'Stark VIP');

      await superOrm.em.fork().persistAndFlush([
        tenantA, userA, orgA, phoneA, sessionA, customerA,
        tenantB, userB, orgB, phoneB, sessionB, customerB
      ]);
    } finally {
      await superOrm.close();
    }

    // 3. Create a temporary non-superuser database role to test strict RLS restrictions
    console.log('Creating temporary non-superuser database role "charlotte_test_role"...');
    const superClient = new Client({ connectionString: dbSuperUrl });
    await superClient.connect();
    try {
      await superClient.query('DROP ROLE IF EXISTS charlotte_test_role;');
      await superClient.query("CREATE ROLE charlotte_test_role WITH LOGIN PASSWORD 'test_password';");
      await superClient.query('GRANT ALL PRIVILEGES ON DATABASE charlotte_db TO charlotte_test_role;');
      await superClient.query('GRANT USAGE ON SCHEMA public TO charlotte_test_role;');
      await superClient.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO charlotte_test_role;');
      await superClient.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO charlotte_test_role;');
    } finally {
      await superClient.end();
    }

    // 4. Connect Mikro-ORM as the non-superuser test role
    const testUserUrl = new URL(dbSuperUrl);
    testUserUrl.username = 'charlotte_test_role';
    testUserUrl.password = 'test_password';
    const workingUrl = testUserUrl.toString();

    orm = await MikroORM.init({
      ...config,
      clientUrl: workingUrl,
      entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],
    });
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }

    // Connect with superuser to perform global cleanup and drop role
    if (dbSuperUrl) {
      try {
        console.log('Restoring database state with superuser...');
        const superClient = new Client({ connectionString: dbSuperUrl });
        await superClient.connect();
        try {
          // Disable RLS temporarily to clean up data globally across all tenants
          await superClient.query('ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE users DISABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE twilio_phone_numbers DISABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE call_sessions DISABLE ROW LEVEL SECURITY;');
          
          if (tenantA && tenantB) {
            await superClient.query(
              'DELETE FROM tenants WHERE id IN ($1, $2)',
              [tenantA.id, tenantB.id]
            );
            console.log(`Cleaned up tenants (and cascaded children).`);
          }

          // Enable RLS back for safety
          await superClient.query('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE twilio_phone_numbers ENABLE ROW LEVEL SECURITY;');
          await superClient.query('ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;');

          // Drop the temporary test role
          await superClient.query('DROP OWNED BY charlotte_test_role;');
          await superClient.query('DROP ROLE IF EXISTS charlotte_test_role;');
          console.log('Temporary database role dropped successfully.');
        } finally {
          await superClient.end();
        }
      } catch (err) {
        console.error('Error during superuser cleanup:', err);
      }
    }
  });

  it('should enforce strict data isolation for Tenant A', async () => {
    await tenantLocalStorage.run({ tenantId: tenantA.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        // Query Tenant A details
        const tenants = await txEm.find(Tenant, {});
        expect(tenants.length).toBe(1);
        expect(tenants[0].id).toBe(tenantA.id);
        expect(tenants[0].name).toBe('Tenant A - Acme Corp');

        // Query Tenant A users
        const users = await txEm.find(User, {});
        expect(users.length).toBe(1);
        expect(users[0].id).toBe(userA.id);
        expect(users[0].email).toBe('admin@acme.com');

        // Query Tenant A organizations
        const orgs = await txEm.find(Organization, {});
        expect(orgs.length).toBe(1);
        expect(orgs[0].id).toBe(orgA.id);
        expect(orgs[0].name).toBe('Acme Engineering');

        // Query Tenant A phone numbers
        const phones = await txEm.find(TwilioPhoneNumber, {});
        expect(phones.length).toBe(1);
        expect(phones[0].phoneNumber).toBe('+15125550100');
        expect(phones[0].friendlyName).toBe('Acme Hotline');

        // Query Tenant A call sessions
        const sessionsA = await txEm.find(CallSession, {});
        expect(sessionsA.length).toBe(1);
        expect(sessionsA[0].id).toBe(sessionA.id);
        expect(sessionsA[0].callSid).toBe('CA_RLS_TEST_ACME_001');

        // Double check we cannot find Tenant B's records even if we query by id explicitly
        const starkTenant = await txEm.findOne(Tenant, { id: tenantB.id });
        expect(starkTenant).toBeNull();

        const starkUser = await txEm.findOne(User, { id: userB.id });
        expect(starkUser).toBeNull();

        const starkOrg = await txEm.findOne(Organization, { id: orgB.id });
        expect(starkOrg).toBeNull();

        const starkPhone = await txEm.findOne(TwilioPhoneNumber, { phoneNumber: '+15125550101' });
        expect(starkPhone).toBeNull();

        const starkSession = await txEm.findOne(CallSession, { id: sessionB.id });
        expect(starkSession).toBeNull();
      });
    });
  });

  it('should enforce strict data isolation for Tenant B', async () => {
    await tenantLocalStorage.run({ tenantId: tenantB.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        // Query Tenant B details
        const tenants = await txEm.find(Tenant, {});
        expect(tenants.length).toBe(1);
        expect(tenants[0].id).toBe(tenantB.id);
        expect(tenants[0].name).toBe('Tenant B - Stark Industries');

        // Query Tenant B users
        const users = await txEm.find(User, {});
        expect(users.length).toBe(1);
        expect(users[0].id).toBe(userB.id);
        expect(users[0].email).toBe('admin@stark.com');

        // Query Tenant B organizations
        const orgs = await txEm.find(Organization, {});
        expect(orgs.length).toBe(1);
        expect(orgs[0].id).toBe(orgB.id);
        expect(orgs[0].name).toBe('Stark R&D');

        // Query Tenant B phone numbers
        const phones = await txEm.find(TwilioPhoneNumber, {});
        expect(phones.length).toBe(1);
        expect(phones[0].phoneNumber).toBe('+15125550101');
        expect(phones[0].friendlyName).toBe('Stark Hotline');

        // Query Tenant B call sessions
        const sessionsB = await txEm.find(CallSession, {});
        expect(sessionsB.length).toBe(1);
        expect(sessionsB[0].id).toBe(sessionB.id);
        expect(sessionsB[0].callSid).toBe('CA_RLS_TEST_STARK_001');

        // Double check we cannot find Tenant A's records even if we query by id explicitly
        const acmeTenant = await txEm.findOne(Tenant, { id: tenantA.id });
        expect(acmeTenant).toBeNull();

        const acmeUser = await txEm.findOne(User, { id: userA.id });
        expect(acmeUser).toBeNull();

        const acmeOrg = await txEm.findOne(Organization, { id: orgA.id });
        expect(acmeOrg).toBeNull();

        const acmePhone = await txEm.findOne(TwilioPhoneNumber, { phoneNumber: '+15125550100' });
        expect(acmePhone).toBeNull();

        const acmeSession = await txEm.findOne(CallSession, { id: sessionA.id });
        expect(acmeSession).toBeNull();
      });
    });
  });

  it('should abort transaction if no active tenant context is loaded in local storage', async () => {
    // Attempting to runInTenantTransaction without setting context in tenantLocalStorage
    await expect(
      runInTenantTransaction(orm.em, async () => {
        // should not reach here
      })
    ).rejects.toThrow('Database transaction aborted: No active tenant context found on current execution thread.');
  });

  it('should return 0 records if a query is run outside of an RLS-bound transaction', async () => {
    // If a fork is used outside of runInTenantTransaction (where app.current_tenant_id is not set)
    // forced RLS will block all rows because current_setting('app.current_tenant_id') won't match any ID.
    const fork = orm.em.fork();
    const tenants = await fork.find(Tenant, {});
    expect(tenants.length).toBe(0);

    const users = await fork.find(User, {});
    expect(users.length).toBe(0);

    const orgs = await fork.find(Organization, {});
    expect(orgs.length).toBe(0);

    const phones = await fork.find(TwilioPhoneNumber, {});
    expect(phones.length).toBe(0);

    const sessions = await fork.find(CallSession, {});
    expect(sessions.length).toBe(0);
  });

  it('call_sessions: Tenant A cannot see Tenant B call sessions', async () => {
    // Tenant A context — query call_sessions — must only return Tenant A's session.
    await tenantLocalStorage.run({ tenantId: tenantA.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        const sessions = await txEm.find(CallSession, {});
        expect(sessions.length).toBe(1);
        expect(sessions[0].id).toBe(sessionA.id);

        // Explicit lookup by Tenant B's session ID must return null
        const starkSession = await txEm.findOne(CallSession, { id: sessionB.id });
        expect(starkSession).toBeNull();

        // Explicit lookup by Tenant B's callSid must return null
        const starkByCid = await txEm.findOne(CallSession, { callSid: 'CA_RLS_TEST_STARK_001' });
        expect(starkByCid).toBeNull();
      });
    });
  });

  it('call_sessions: Tenant B cannot see Tenant A call sessions', async () => {
    // Tenant B context — query call_sessions — must only return Tenant B's session.
    await tenantLocalStorage.run({ tenantId: tenantB.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        const sessions = await txEm.find(CallSession, {});
        expect(sessions.length).toBe(1);
        expect(sessions[0].id).toBe(sessionB.id);

        // Explicit lookup by Tenant A's session ID must return null
        const acmeSession = await txEm.findOne(CallSession, { id: sessionA.id });
        expect(acmeSession).toBeNull();

        // Explicit lookup by Tenant A's callSid must return null
        const acmeByCid = await txEm.findOne(CallSession, { callSid: 'CA_RLS_TEST_ACME_001' });
        expect(acmeByCid).toBeNull();
      });
    });
  });

  describe('CustomerService and Context Isolation', () => {
    it('CustomerService should only fetch customers for the active tenant', async () => {
      await tenantLocalStorage.run({ tenantId: tenantA.id }, async () => {
        const customerSvc = new CustomerService(orm.em.fork());
        // Can find Tenant A's customer
        const alice = await customerSvc.findByPhoneNumber('+15550001111');
        expect(alice).not.toBeNull();
        expect(alice?.name).toBe('Alice');

        // Cannot find Tenant B's customer
        const bob = await customerSvc.findByPhoneNumber('+15550002222');
        expect(bob).toBeNull();
      });

      await tenantLocalStorage.run({ tenantId: tenantB.id }, async () => {
        const customerSvc = new CustomerService(orm.em.fork());
        // Can find Tenant B's customer
        const bob = await customerSvc.findByPhoneNumber('+15550002222');
        expect(bob).not.toBeNull();
        expect(bob?.name).toBe('Bob');

        // Cannot find Tenant A's customer
        const alice = await customerSvc.findByPhoneNumber('+15550001111');
        expect(alice).toBeNull();
      });
    });
    
    it('CustomerService throws error if run outside of tenant context', async () => {
      const customerSvc = new CustomerService(orm.em.fork());
      await expect(customerSvc.findByPhoneNumber('+15550001111')).rejects.toThrow('CustomerService must be called within a tenant context');
    });
  });
});
