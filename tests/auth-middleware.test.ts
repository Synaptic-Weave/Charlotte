 
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Request, Response } from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';

// Use the same fallback secret that the middleware uses when JWT_SECRET is not set.
// This lets the test sign valid tokens without an env dependency.
const VALID_SECRET = 'charlotte_super_secret_jwt_sign_key_change_me_in_production';
const WRONG_SECRET = 'wrong_secret_that_does_not_match';

// Minimal payload satisfying the middleware's required claims
const VALID_PAYLOAD = {
  tenantId: 'tenant-abc-123',
  userId: 'user-xyz-456',
  role: 'admin',
};

let server: http.Server;
let baseUrl: string;

// Set up a real Express app with the auth middleware protecting a test route.
// We do not mock jwt or the middleware — this is a real integration test.
beforeAll(async () => {
  // Ensure JWT_SECRET env is set so the middleware passes requireEnv
  process.env.JWT_SECRET = VALID_SECRET;

  // Dynamic import AFTER deleting the env var so the module captures the correct secret.
  const { authenticateToken } = await import('../src/middleware/auth.js');

  const app = express();
  app.use(express.json());

  // Protected sentinel route — returns 200 + context if auth passes
  app.get('/protected', authenticateToken, (req: Request, res: Response) => {
    res.status(200).json({ ok: true, context: req.context });
  });

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('Auth Middleware — token rejection', () => {
  it('should return 401 when Authorization header is missing', async () => {
    const res = await fetch(`${baseUrl}/protected`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('should return 401 when Authorization header is present but token is missing (bare "Bearer")', async () => {
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: 'Bearer' },
    });
    // "Bearer".split(' ')[1] is undefined → no token → 401
    expect(res.status).toBe(401);
  });

  it('should return 401 when token is malformed (not a JWT)', async () => {
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: 'Bearer this.is.not.valid.jwt' },
    });
    expect(res.status).toBe(401);
  });

  it('should return 401 when token is signed with the wrong secret', async () => {
    const token = jwt.sign(VALID_PAYLOAD, WRONG_SECRET, { expiresIn: '1h' });
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('should return 401 when token is expired', async () => {
    // Sign with the correct secret but set expiresIn to -1s so it is
    // already expired at the moment of signing.
    const token = jwt.sign(VALID_PAYLOAD, VALID_SECRET, { expiresIn: -1 });
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('should return 401 when token is valid JWT but missing required claims (tenantId)', async () => {
    const token = jwt.sign({ userId: 'user-xyz-456', role: 'admin' }, VALID_SECRET, { expiresIn: '1h' });
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('should return 401 when token is valid JWT but missing required claims (userId)', async () => {
    const token = jwt.sign({ tenantId: 'tenant-abc-123', role: 'admin' }, VALID_SECRET, { expiresIn: '1h' });
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('Auth Middleware — valid token passes through', () => {
  it('should return 200 and populate req.context when token is valid', async () => {
    const token = jwt.sign(VALID_PAYLOAD, VALID_SECRET, { expiresIn: '1h' });
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.context).toBeDefined();
    expect(body.context.tenantId).toBe(VALID_PAYLOAD.tenantId);
    expect(body.context.userId).toBe(VALID_PAYLOAD.userId);
    expect(body.context.role).toBe(VALID_PAYLOAD.role);
  });
});
