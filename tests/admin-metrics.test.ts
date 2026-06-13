import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../src/domain/entities/TwilioPhoneNumber.js';
import { CallSession } from '../src/domain/entities/CallSession.js';
import { User } from '../src/domain/entities/User.js';
import { UserRole } from '../src/domain/entities/UserRole.js';
import { createAdminRouter } from '../src/routes/admin.js';

let orm: MikroORM;
let app: express.Express;
let server: http.Server;
let baseUrl: string;
let superAdminToken: string;
let normalUserToken: string;

beforeAll(async () => {
  orm = await MikroORM.init(config);
  await orm.schema.refreshDatabase();

  const em = orm.em.fork();

  // Create a SuperAdmin role and user
  const superAdminRole = UserRole.create('SuperAdmin', 'Super Administrator');
  const adminUser = User.create('admin@test.com', 'hashedpassword');
  adminUser.addRole(superAdminRole);
  
  const normalUser = User.create('normal@test.com', 'hashed');

  await em.persistAndFlush([superAdminRole, adminUser, normalUser]);

  superAdminToken = jwt.sign(
    { userId: adminUser.id, email: adminUser.email, roles: ['SuperAdmin'] },
    process.env.JWT_SECRET || 'testsecret',
    { expiresIn: '1h' }
  );

  normalUserToken = jwt.sign(
    { userId: normalUser.id, email: normalUser.email, roles: [] },
    process.env.JWT_SECRET || 'testsecret',
    { expiresIn: '1h' }
  );

  // Seed data
  const tenant1 = Tenant.create('Tenant A', '+1234567890');
  const tenant2 = Tenant.create('Tenant B', '+0987654321');
  
  const num1 = TwilioPhoneNumber.create(tenant1, '+1111111111', 'Main Line');
  const num2 = TwilioPhoneNumber.create(tenant2, '+2222222222', 'Support Line');

  const call1 = CallSession.create(tenant1, 'SID_1', '+1000000000');
  call1.updateStatus('active');
  const call2 = CallSession.create(tenant2, 'SID_2', '+2000000000');
  call2.updateStatus('completed');
  const call3 = CallSession.create(tenant1, 'SID_3', '+3000000000');
  call3.updateStatus('initiated');

  await em.persistAndFlush([tenant1, tenant2, num1, num2, call1, call2, call3]);

  // Setup Express
  app = express();
  app.use(express.json());
  
  app.use((req, res, next) => {
    req.em = orm.em.fork();
    next();
  });

  app.use('/api/admin', createAdminRouter(orm.em));

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address() as any;
      baseUrl = `http://localhost:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
  await orm.close(true);
});

describe('Admin Metrics API', () => {
  it('GET /api/admin/stats should return aggregate stats', async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalTenants).toBe(2);
    expect(body.totalNumbers).toBe(2);
    expect(body.latencyAverage).toBe(120);
  });

  it('GET /api/admin/calls/live should return only active and initiated calls', async () => {
    const res = await fetch(`${baseUrl}/api/admin/calls/live`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2); // call1 (active) and call3 (initiated)
    
    const statuses = body.map((c: any) => c.status);
    expect(statuses).toContain('active');
    expect(statuses).toContain('initiated');
    expect(statuses).not.toContain('completed');
    
    // Check DTO structure
    const call = body[0];
    expect(call).toHaveProperty('id');
    expect(call).toHaveProperty('callSid');
    expect(call).toHaveProperty('status');
    expect(call).toHaveProperty('callerNumber');
    expect(call).toHaveProperty('tenant');
    expect(call.tenant).toHaveProperty('id');
    expect(call.tenant).toHaveProperty('name');
  });

  it('should reject unauthorized access (no token)', async () => {
    const resStats = await fetch(`${baseUrl}/api/admin/stats`);
    expect(resStats.status).toBe(401);

    const resCalls = await fetch(`${baseUrl}/api/admin/calls/live`);
    expect(resCalls.status).toBe(401);
  });

  it('should reject access for normal users', async () => {
    const resStats = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${normalUserToken}` }
    });
    expect(resStats.status).toBe(403);

    const resCalls = await fetch(`${baseUrl}/api/admin/calls/live`, {
      headers: { Authorization: `Bearer ${normalUserToken}` }
    });
    expect(resCalls.status).toBe(403);
  });
});
