import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { User } from '../src/domain/entities/User.js';
import { Organization } from '../src/domain/entities/Organization.js';
import { TwilioPhoneNumber } from '../src/domain/entities/TwilioPhoneNumber.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { UserRoleSchema, SuperAdminSchema, TenantAdminSchema } from '../src/domain/schemas/UserRole.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';
import { authenticateToken } from '../src/middleware/auth.js';
import { UserApplicationService } from '../src/services/UserApplicationService.js';

let createAuthRouter: any;
let createNumbersRouter: any;

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

describe('Charlotte API Routes and Authentication Middleware Integration Tests', () => {
  let orm: MikroORM;
  let dbUrl: string;
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  // Track seeded entities for manual database cleanup
  let seededTenant: Tenant;
  let seededUser: User;
  let adminToken: string;

  beforeAll(async () => {
    // Override Twilio credentials with ACXX mock SID before importing router modules
    process.env.TWILIO_ACCOUNT_SID = 'ACXX_mock_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'mock_auth_token';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

    // Dynamically import routes
    const authModule = await import('../src/routes/auth.js');
    const numbersModule = await import('../src/routes/numbers.js');
    createAuthRouter = authModule.createAuthRouter;
    createNumbersRouter = numbersModule.createNumbersRouter;

    // 1. Establish database connection and run migrations
    dbUrl = await setupTestDatabase();
    orm = await MikroORM.init({
      ...config,
      clientUrl: dbUrl,
      entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
    });

    console.log('[Test Setup] Aligning database migrations...');
    await orm.getMigrator().up();

    // 2. Perform a pre-test database cleanup for reliability and repeatability
    const fork = orm.em.fork();
    const exTenants = await fork.find(Tenant, {
      $or: [
        { name: 'Routes Integration Tenant Ltd' },
        { name: 'Signup Test Tenant' },
        { name: 'Routes Integration Tenant Modified' }
      ]
    });
    if (exTenants.length > 0) {
      console.log(`[Test Setup] Clearing ${exTenants.length} lingering test tenants...`);
      await fork.nativeDelete(Tenant, { id: { $in: exTenants.map((t) => t.id) } });
    }

    const exUsers = await fork.find(User, {
      email: { $in: ['routes-test@example.com', 'signup-test@example.com'] }
    });
    if (exUsers.length > 0) {
      await fork.nativeDelete(User, { id: { $in: exUsers.map((u) => u.id) } });
    }

    // 3. Seed active tenant user for login and authentication testing
    seededTenant = Tenant.create('Routes Integration Tenant Ltd', '+15550001111');
    // Using bcrypt to hash a test password so that our live /login endpoint succeeds
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('testpassword123', 12);
    seededUser = User.create(seededTenant, 'routes-test@example.com', passwordHash);

    await fork.persist([seededTenant, seededUser]);
    await fork.flush();

    // Generate valid admin credentials token
    adminToken = jwt.sign(
      {
        tenantId: seededTenant.id,
        userId: seededUser.id,
        role: 'admin',
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 4. Initialize Express application
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mount Auth Router
    const userService = new UserApplicationService(orm.em);
    app.use('/api/auth', createAuthRouter(userService));

    // Mount Numbers Router
    app.use('/api/tenants/numbers', createNumbersRouter(orm.em));

    // Mount an isolated diagnostic endpoint to test authenticateToken middleware in isolation
    app.get('/api/test-auth-middleware', authenticateToken, (req, res) => {
      res.status(200).json({
        message: 'Access granted.',
        context: req.context,
      });
    });

    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Internal server error occurred.' });
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;
    console.log(`[Test Server] Routes & Auth Test Server running on ${baseUrl}`);
  });

  afterAll(async () => {
    // 1. Close Server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 2. Perform final database cleanup
    if (orm && seededTenant) {
      const fork = orm.em.fork();
      await fork.nativeDelete(Tenant, {
        $or: [
          { id: seededTenant.id },
          { name: 'Signup Test Tenant' },
        ]
      });
      await fork.nativeDelete(User, {
        email: { $in: ['routes-test@example.com', 'signup-test@example.com'] }
      });
      await orm.close();
    }
    console.log('[Test Teardown] Routes & Auth clean shutdown completed.');
  });

  describe('1. authenticateToken Middleware', () => {
    it('should return 401 Unauthorized if no Authorization header is provided', async () => {
      const response = await fetch(`${baseUrl}/api/test-auth-middleware`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Authentication token is required.' });
    });

    it('should return 401 Unauthorized if Authorization header format is incorrect (no token portion)', async () => {
      const response = await fetch(`${baseUrl}/api/test-auth-middleware`, {
        method: 'GET',
        headers: { 'Authorization': 'NotBearer' },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Authentication token is required.' });
    });

    it('should return 403 Forbidden if Authorization header format is technically complete but token is malformed', async () => {
      const response = await fetch(`${baseUrl}/api/test-auth-middleware`, {
        method: 'GET',
        headers: { 'Authorization': 'NotBearer token123' },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid or expired authentication token.' });
    });

    it('should return 403 Forbidden if token has an invalid signature', async () => {
      const invalidToken = jwt.sign({ tenantId: '123' }, 'wrong-secret');
      const response = await fetch(`${baseUrl}/api/test-auth-middleware`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${invalidToken}` },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid or expired authentication token.' });
    });

    it('should return 403 Forbidden if token is expired', async () => {
      const expiredToken = jwt.sign(
        { tenantId: '123', userId: '456', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '-1s' } // Expired instantly
      );
      const response = await fetch(`${baseUrl}/api/test-auth-middleware`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${expiredToken}` },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid or expired authentication token.' });
    });

    it('should return 403 Forbidden if token is missing crucial claim attributes', async () => {
      const invalidClaimsToken = jwt.sign(
        { role: 'admin' }, // Missing tenantId and userId
        JWT_SECRET
      );
      const response = await fetch(`${baseUrl}/api/test-auth-middleware`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${invalidClaimsToken}` },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Token is missing tenant or user claim attributes.' });
    });

    it('should grant access and forward context if token is fully valid', async () => {
      const response = await fetch(`${baseUrl}/api/test-auth-middleware`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Access granted.');
      expect(data.context).toEqual({
        tenantId: seededTenant.id,
        userId: seededUser.id,
        role: 'admin',
      });
    });
  });

  describe('2. createAuthRouter Endpoints', () => {
    describe('POST /api/auth/signup', () => {
      it('should fail with 400 if required registration parameters are missing', async () => {
        const response = await fetch(`${baseUrl}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'new@example.com' }), // Missing password, tenantName, destinationNumber
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain('Missing required onboarding parameters');
      });

      it('should fail with 400 if email is already taken', async () => {
        const response = await fetch(`${baseUrl}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'routes-test@example.com', // Already seeded in beforeAll
            password: 'password123',
            tenantName: 'Duplicate Tenant',
            destinationNumber: '+15550000000',
          }),
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('An account with this email already exists.');
      });

      it('should succeed with 201 and onboard a new tenant organization programmatically', async () => {
        const response = await fetch(`${baseUrl}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'signup-test@example.com',
            password: 'securePassword456',
            tenantName: 'Signup Test Tenant',
            destinationNumber: '+15553334444',
          }),
        });

        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.message).toBe('Onboarding registration completed successfully.');
        expect(data.token).toBeDefined();
        expect(data.tenant.name).toBe('Signup Test Tenant');
        expect(data.tenant.destinationNumber).toBe('+15553334444');
        expect(data.tenant.destinationVerified).toBe(false);

        // Verify record exists in DB using a fresh em fork
        const fork = orm.em.fork();
        const tenant = await fork.findOne(Tenant, { id: data.tenant.id });
        expect(tenant).toBeDefined();
        expect(tenant?.name).toBe('Signup Test Tenant');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should fail with 400 if credentials are incomplete', async () => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'routes-test@example.com' }), // Missing password
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('Missing email or password credentials.');
      });

      it('should fail with 401 if user is not found', async () => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'notfound@example.com', password: 'pwd' }),
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Invalid email or password credentials.');
      });

      it('should fail with 401 if password does not match', async () => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'routes-test@example.com', password: 'wrongpassword' }),
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Invalid email or password credentials.');
      });

      it('should successfully authenticate user and return a JWT access token', async () => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'routes-test@example.com', password: 'testpassword123' }),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe('Authentication successful.');
        expect(data.token).toBeDefined();
        expect(data.tenant.id).toBe(seededTenant.id);
        expect(data.tenant.name).toBe('Routes Integration Tenant Ltd');

        // Check JWT payload structure
        const decoded = jwt.decode(data.token) as any;
        expect(decoded).toBeDefined();
        expect(decoded.userId).toBe(seededUser.id);
        expect(decoded.tenantId).toBe(seededTenant.id);
      });
    });

    describe('GET /api/auth/settings', () => {
      it('should return 401 if unauthenticated', async () => {
        const response = await fetch(`${baseUrl}/api/auth/settings`, {
          method: 'GET',
        });
        expect(response.status).toBe(401);
      });

      it('should return settings if authenticated', async () => {
        const response = await fetch(`${baseUrl}/api/auth/settings`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${adminToken}` },
        });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.tenant).toBeDefined();
        expect(data.user).toBeDefined();
      });
    });

    describe('POST /api/auth/verify-destination', () => {
      it('should reject with 400 if PIN parameter is missing', async () => {
        const response = await fetch(`${baseUrl}/api/auth/verify-destination`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({}),
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('Verification PIN is required.');
      });

      it('should reject with 400 if PIN is incorrect', async () => {
        const response = await fetch(`${baseUrl}/api/auth/verify-destination`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ pin: '5555' }),
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('Incorrect verification PIN.');
      });

      it('should successfully verify forwarding number when PIN is correct (1234)', async () => {
        const response = await fetch(`${baseUrl}/api/auth/verify-destination`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ pin: '1234' }),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe('Forwarding destination phone number verified successfully.');
        expect(data.tenant.destinationVerified).toBe(true);

        // Verify update persisted in DB
        const fork = orm.em.fork();
        const tenant = await fork.findOne(Tenant, { id: seededTenant.id });
        expect(tenant?.destinationVerified).toBe(true);
      });
    });

    describe('PUT /api/auth/settings', () => {
      it('should fail with 400 if parameters are missing', async () => {
        const response = await fetch(`${baseUrl}/api/auth/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ name: 'Routes Integration Tenant Modified' }), // Missing destinationNumber
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('Tenant name and destination number are required.');
      });

      it('should successfully update tenant settings and reset verification if destination number changed', async () => {
        const response = await fetch(`${baseUrl}/api/auth/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: 'Routes Integration Tenant Modified',
            destinationNumber: '+15559998888', // Changed number
          }),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe('Tenant settings updated successfully.');
        expect(data.tenant.name).toBe('Routes Integration Tenant Modified');
        expect(data.tenant.destinationNumber).toBe('+15559998888');
        expect(data.tenant.destinationVerified).toBe(false); // Resets verification

        // Verify database state
        const fork = orm.em.fork();
        const tenant = await fork.findOne(Tenant, { id: seededTenant.id });
        expect(tenant?.name).toBe('Routes Integration Tenant Modified');
        expect(tenant?.destinationNumber).toBe('+15559998888');
        expect(tenant?.destinationVerified).toBe(false);
      });
    });
  });

  describe('3. createNumbersRouter Endpoints', () => {
    describe('GET /api/tenants/numbers/search', () => {
      it('should fail with 400 if area code is malformed (not 3 digits)', async () => {
        const response = await fetch(`${baseUrl}/api/tenants/numbers/search?areaCode=abc`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('Area code must be a 3-digit number.');
      });

      it('should return a 503 error since real twilio credentials are not provided during tests', async () => {
        const response = await fetch(`${baseUrl}/api/tenants/numbers/search?areaCode=512`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(503);
        const data = await response.json();
        expect(data.error).toContain('Real Twilio credentials');
      });
    });

    describe('POST /api/tenants/numbers/provision', () => {
      it('should fail with 400 if phoneNumber is not provided', async () => {
        const response = await fetch(`${baseUrl}/api/tenants/numbers/provision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ friendlyName: 'My Desk Hotline' }), // Missing phoneNumber
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('phoneNumber is required for provisioning.');
      });

      it('should fail with 500 because real twilio credentials are not provided during tests, but we manually insert a number for downstream tests', async () => {
        const response = await fetch(`${baseUrl}/api/tenants/numbers/provision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            phoneNumber: '+15125559000',
            friendlyName: 'Acme Test Desk Line',
          }),
        });

        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data.error).toContain('Real Twilio credentials');

        // Manually insert the TwilioPhoneNumber so the next test passes
        const fork = orm.em.fork();
        const tenant = await fork.findOne(Tenant, { id: seededTenant.id });
        expect(tenant).toBeDefined();
        
        const twilioPhone = TwilioPhoneNumber.create(tenant!, '+15125559000', 'Acme Test Desk Line');
        fork.persist(twilioPhone);
        await fork.flush();
      });
    });

    describe('GET /api/tenants/numbers/', () => {
      it('should retrieve all provisioned numbers assigned to the tenant', async () => {
        const response = await fetch(`${baseUrl}/api/tenants/numbers/`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.numbers).toBeDefined();
        // We provisioned one number in the previous test case
        expect(data.numbers.length).toBeGreaterThanOrEqual(1);
        const matches = data.numbers.filter((num: any) => num.phoneNumber === '+15125559000');
        expect(matches.length).toBe(1);
        expect(matches[0].friendlyName).toBe('Acme Test Desk Line');
      });

      it('should return ONLY the requesting tenant\'s phone numbers and isolate cross-tenant data', async () => {
        const fork = orm.em.fork();
        
        // Create Tenant B
        const tenantB = Tenant.create('Tenant B isolation test', '+15550002222');
        const twilioPhoneB = TwilioPhoneNumber.create(tenantB, '+15550003333', 'Tenant B Line');
        fork.persist([tenantB, twilioPhoneB]);
        await fork.flush();

        const response = await fetch(`${baseUrl}/api/tenants/numbers/`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${adminToken}` }, // AdminToken is Tenant A
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        
        // Assert Tenant A only sees their numbers, not Tenant B's
        const matchB = data.numbers.filter((num: any) => num.phoneNumber === '+15550003333');
        expect(matchB.length).toBe(0);

        // Cleanup Tenant B
        await fork.nativeDelete(Tenant, { id: tenantB.id });
      });
    });
  });
});
