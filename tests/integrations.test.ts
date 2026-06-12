import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';

// Mock the auth middleware BEFORE importing the router that uses it
vi.mock('../src/middleware/auth.js', () => ({
  authenticateToken: vi.fn((req, res, next) => {
    // Simulate what authenticateToken does by setting req.context
    req.context = { tenantId: 'test-tenant-id', userId: 'user-id', role: 'admin' };
    next();
  })
}));

const mockGenerateAuthUrl = vi.fn().mockReturnValue('http://mock-google-auth-url');
const mockGetToken = vi.fn().mockResolvedValue({ tokens: { refresh_token: 'mock_refresh_token' } });
const mockSetCredentials = vi.fn();
const mockListCalendars = vi.fn().mockResolvedValue({ data: { items: [{ id: 'cal1' }] } });

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials
      }))
    },
    calendar: vi.fn().mockReturnValue({
      calendarList: {
        list: () => mockListCalendars()
      }
    })
  }
}));

import { createIntegrationsRouter } from '../src/routes/integrations.js';

describe('Integrations Router (Unit)', () => {
  let server: http.Server;
  let baseUrl: string;
  let mockEm: any;
  let mockFork: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFork = {
      findOne: vi.fn(),
      flush: vi.fn()
    };
    mockEm = {
      fork: vi.fn().mockReturnValue(mockFork)
    };
    
    const app = express();
    app.use(express.json());
    app.use('/api/integrations', createIntegrationsRouter(mockEm));
    
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('GET /api/integrations/google/auth', () => {
    it('should properly read req.context.tenantId instead of req.user.tenantId to generate auth url', async () => {
      const response = await fetch(`${baseUrl}/api/integrations/google/auth`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ url: 'http://mock-google-auth-url' });
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
        state: 'test-tenant-id' // asserts that it read from context properly
      }));
    });
  });

  describe('GET /api/integrations/google/calendars', () => {
    it('should read req.context.tenantId to fetch tenant and return calendars', async () => {
      mockFork.findOne.mockResolvedValue({ id: 'test-tenant-id', googleRefreshToken: 'valid_token' });
      
      const response = await fetch(`${baseUrl}/api/integrations/google/calendars`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ calendars: [{ id: 'cal1' }] });
      
      // Ensure it queried using tenantId from req.context using the forked em
      expect(mockEm.fork).toHaveBeenCalled();
      expect(mockFork.findOne).toHaveBeenCalledWith(expect.anything(), { id: 'test-tenant-id' });
    });

    it('should return 400 if tenant not found or missing googleRefreshToken', async () => {
      mockFork.findOne.mockResolvedValue(null);
      
      const response = await fetch(`${baseUrl}/api/integrations/google/calendars`);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Google Calendar not connected' });
    });
  });

  describe('POST /api/integrations/google/callback', () => {
    it('should fork EntityManager and flush on success', async () => {
      mockFork.findOne.mockResolvedValue({ id: 'test-tenant-id' });
      
      const response = await fetch(`${baseUrl}/api/integrations/google/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'mock-code', state: 'test-tenant-id' })
      });
      
      expect(response.status).toBe(200);
      expect(mockEm.fork).toHaveBeenCalled();
      expect(mockFork.findOne).toHaveBeenCalledWith(expect.anything(), { id: 'test-tenant-id' });
      expect(mockFork.flush).toHaveBeenCalled();
    });
  });

  describe('POST /api/integrations/google/calendars', () => {
    it('should fork EntityManager and flush on success', async () => {
      mockFork.findOne.mockResolvedValue({ id: 'test-tenant-id' });
      
      const response = await fetch(`${baseUrl}/api/integrations/google/calendars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: 'new-cal-id' })
      });
      
      expect(response.status).toBe(200);
      expect(mockEm.fork).toHaveBeenCalled();
      expect(mockFork.findOne).toHaveBeenCalledWith(expect.anything(), { id: 'test-tenant-id' });
      expect(mockFork.flush).toHaveBeenCalled();
    });
  });
});
