 
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
  let mockIntegrationService: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIntegrationService = {
      generateAuthUrl: vi.fn().mockReturnValue('http://mock-google-auth-url'),
      verifyStateToken: vi.fn().mockResolvedValue('test-tenant-id'),
      exchangeToken: vi.fn().mockResolvedValue(undefined),
      getCalendars: vi.fn().mockResolvedValue([{ id: 'cal1' }]),
      updateGoogleCalendarId: vi.fn().mockResolvedValue(undefined),
    };
    
    const app = express();
    app.use(express.json());
    app.use('/api/integrations', createIntegrationsRouter(mockIntegrationService));
    
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as unknown).port;
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
      expect(mockIntegrationService.generateAuthUrl).toHaveBeenCalledWith('test-tenant-id');
    });
  });

  describe('GET /api/integrations/google/calendars', () => {
    it('should read req.context.tenantId to fetch tenant and return calendars', async () => {
      const response = await fetch(`${baseUrl}/api/integrations/google/calendars`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ calendars: [{ id: 'cal1' }] });
      
      // Ensure it queried using tenantId from req.context
      expect(mockIntegrationService.getCalendars).toHaveBeenCalledWith('test-tenant-id');
    });

    it('should return 400 if tenant not found or missing googleRefreshToken', async () => {
      mockIntegrationService.getCalendars.mockRejectedValue(new Error('Google Calendar not connected'));
      
      const response = await fetch(`${baseUrl}/api/integrations/google/calendars`);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Google Calendar not connected' });
    });
  });

  describe('POST /api/integrations/google/callback', () => {
    it('should call exchangeToken on success', async () => {
      const response = await fetch(`${baseUrl}/api/integrations/google/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'mock-code', state: 'test-tenant-id' })
      });
      
      expect(response.status).toBe(200);
      expect(mockIntegrationService.verifyStateToken).toHaveBeenCalledWith('test-tenant-id');
      expect(mockIntegrationService.exchangeToken).toHaveBeenCalledWith('mock-code', 'test-tenant-id');
    });
  });

  describe('POST /api/integrations/google/calendars', () => {
    it('should call updateGoogleCalendarId on success', async () => {
      const response = await fetch(`${baseUrl}/api/integrations/google/calendars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: 'new-cal-id' })
      });
      
      expect(response.status).toBe(200);
      expect(mockIntegrationService.updateGoogleCalendarId).toHaveBeenCalledWith('test-tenant-id', 'new-cal-id');
    });
  });
});
