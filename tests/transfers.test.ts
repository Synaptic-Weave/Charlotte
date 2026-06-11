import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { Client } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../src/domain/entities/TwilioPhoneNumber.js';
import { CallSession } from '../src/domain/entities/CallSession.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';
import { CallSessionSchema } from '../src/domain/schemas/CallSession.schema.js';
import { tenantLocalStorage, runInTenantTransaction } from '../src/db/context.js';
let createWebhooksRouter: any;
let registerStreamHandler: any;

// Define globals to capture Google GenAI ADK callbacks
let storedCallbacks: any = null;
let storedSession: any = null;

// Mock Google GenAI Live Connection
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => {
      return {
        live: {
          connect: vi.fn().mockImplementation(async (config) => {
            storedCallbacks = config.callbacks;
            storedSession = {
              send: vi.fn().mockResolvedValue(undefined),
              sendToolResponse: vi.fn().mockResolvedValue(undefined),
              sendRealtimeInput: vi.fn().mockResolvedValue(undefined),
              close: vi.fn().mockResolvedValue(undefined),
            };
            // Trigger open callback asynchronously
            setTimeout(() => {
              if (config.callbacks?.onopen) {
                config.callbacks.onopen();
              }
            }, 10);
            return storedSession;
          }),
        },
      };
    }),
  };
});

// Mock Twilio Client
export const mockCallsCreate = vi.fn().mockResolvedValue({ sid: 'CA_OUTBOUND_MOCK_123' });
export const mockCallsUpdate = vi.fn().mockResolvedValue({ sid: 'CA_INBOUND_MOCK_UPDATED' });

const mockCalls = vi.fn((sid) => {
  return {
    update: mockCallsUpdate,
  };
});
(mockCalls as any).create = mockCallsCreate;

const mockTwilioClient = {
  calls: mockCalls,
};

vi.mock('twilio', () => {
  const mockFn = vi.fn(() => mockTwilioClient);
  (mockFn as any).validateRequest = vi.fn().mockReturnValue(true);
  return {
    default: mockFn,
  };
});

// Helper for waiting in async operations
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

describe('Charlotte Warm Transfer & Call Bridging Integration Tests', () => {
  let orm: MikroORM;
  let dbUrl: string;
  let server: http.Server;
  let wss: WebSocketServer;
  let port: number;
  let baseUrl: string;
  let wsUrl: string;

  let testTenant: Tenant;
  let testPhoneNumber: TwilioPhoneNumber;

  beforeAll(async () => {
    // Set environment variables BEFORE importing the routers
    process.env.GEMINI_API_KEY = 'AIzaSy_test_key_not_mock';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_account';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';

    // Dynamically import the routes
    const webhooksModule = await import('../src/routes/webhooks.js');
    const streamsModule = await import('../src/routes/streams.js');
    createWebhooksRouter = webhooksModule.createWebhooksRouter;
    registerStreamHandler = streamsModule.registerStreamHandler;

    // 1. Database connection and migrations
    dbUrl = await setupTestDatabase();
    orm = await MikroORM.init({
      ...config,
      clientUrl: dbUrl,
      entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],
    });

    await orm.getMigrator().up();

    // 2. Clear old residues
    const fork = orm.em.fork();
    const exTenants = await fork.find(Tenant, { name: 'Warm Transfer Test Tenant Ltd' });
    if (exTenants.length > 0) {
      await fork.nativeDelete(Tenant, { id: { $in: exTenants.map((t) => t.id) } });
    }

    // 3. Seed active tenant with destination number inside RLS context so the
    //    seed path exercises the same application data path as production writes.
    testTenant = Tenant.create('Warm Transfer Test Tenant Ltd', '+15551234567');
    testTenant.updateDestination('+15551234567', true);
    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        testPhoneNumber = TwilioPhoneNumber.create(testTenant, '+15125550300', 'Transfer Test Line');
        txEm.persist([testTenant, testPhoneNumber]);
        await txEm.flush();
      });
    });

    // 4. Express Server & WebSockets
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Inject Webhooks router
    app.use('/api/webhook', createWebhooksRouter(orm.em));

    server = http.createServer(app);
    wss = new WebSocketServer({ server });

    // Register stream handler
    registerStreamHandler(wss, orm.em);

    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;
    wsUrl = `ws://localhost:${port}/api/streams`;
  });

  afterAll(async () => {
    if (wss) {
      wss.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (orm && testTenant) {
      const fork = orm.em.fork();
      await fork.nativeDelete(Tenant, { id: testTenant.id });
      await orm.close();
    }
  });

  describe('1. routeCall Tool Execution and Webhooks Triggering', () => {
    it('should place Call A on hold in a conference and trigger outbound Call B on routeCall tool execution', async () => {
      // Clear mock call logs
      mockCallsCreate.mockClear();
      mockCallsUpdate.mockClear();

      const callSid = 'CA_INBOUND_TRANSFER_123';
      const streamSid = 'MZ_TRANSFER_STREAM_123';

      // Ensure CallSession exists in state "initiated"
      const fork = orm.em.fork();
      const callSession = CallSession.create(testTenant, callSid);
      await fork.persistAndFlush(callSession);

      // Connect real test WebSocket client to trigger our streaming handler
      const client = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
      });

      // Send start event to register parameters and trigger Gemini live connect mock
      client.send(JSON.stringify({ event: 'connected' }));
      client.send(JSON.stringify({
        event: 'start',
        start: {
          streamSid,
          callSid,
          customParameters: {
            tenantId: testTenant.id,
            callSid
          }
        }
      }));

      // Allow registration and state change to propagate
      await sleep(300);

      // Verify callbacks are stored and active
      expect(storedCallbacks).toBeDefined();
      expect(storedCallbacks.onmessage).toBeDefined();

      // Programmatically trigger a transfer_call tool execution callback
      await storedCallbacks.onmessage({
        toolCall: {
          functionCalls: [
            {
              id: 'fn_route_123',
              name: 'transfer_call',
              args: { department: 'Support' }
            }
          ]
        }
      });

      // Assert inbound caller leg (Call A) was updated to enter a Conference room
      expect(mockCallsUpdate).toHaveBeenCalled();
      const updateArgs = mockCallsUpdate.mock.calls[0][0];
      expect(updateArgs.twiml).toContain('<Conference');
      expect(updateArgs.twiml).toContain(`Conf_${callSid}`);

      // Assert outbound caller leg (Call B) was created targeting the owner's destination number
      expect(mockCallsCreate).toHaveBeenCalled();
      const createArgs = mockCallsCreate.mock.calls[0][0];
      expect(createArgs.to).toBe('+15551234567');
      expect(createArgs.url).toContain('/api/webhook/twilio/transfer-whisper');
      expect(createArgs.url).toContain(`inboundCallSid=${callSid}`);
      expect(createArgs.url).toContain('department=Support');

      client.close();
    });
  });

  describe('2. Whisper Webhook POST /api/webhook/twilio/transfer-whisper', () => {
    it('should return valid TwiML with <Gather> and speak department name', async () => {
      const response = await fetch(
        `${baseUrl}/api/webhook/twilio/transfer-whisper?inboundCallSid=CA_INBOUND_TRANSFER_123&department=Support&tenantId=${testTenant.id}`,
        { method: 'POST', headers: { 'X-Twilio-Signature': 'mock' } }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/xml');

      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Gather');
      expect(xml).toContain('action="/api/webhook/twilio/transfer-decision');
      expect(xml).toContain('numDigits="1"');
    });
  });

  describe('3. Decision Webhook POST /api/webhook/twilio/transfer-decision', () => {
    it('should return conference join TwiML when accepted (Digits=1)', async () => {
      const response = await fetch(
        `${baseUrl}/api/webhook/twilio/transfer-decision?inboundCallSid=CA_INBOUND_TRANSFER_123&department=Support&tenantId=${testTenant.id}`,
        {
          method: 'POST',
          headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/json' },
          body: JSON.stringify({ Digits: '1' }),
        }
      );

      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Conference startConferenceOnEnter="true"');
      expect(xml).toContain('Conf_CA_INBOUND_TRANSFER_123');
    });

    it('should return hangup TwiML and redirect inbound call to voicemail when declined (Digits=2)', async () => {
      mockCallsUpdate.mockClear();

      const response = await fetch(
        `${baseUrl}/api/webhook/twilio/transfer-decision?inboundCallSid=CA_INBOUND_TRANSFER_123&department=Support&tenantId=${testTenant.id}`,
        {
          method: 'POST',
          headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/json' },
          body: JSON.stringify({ Digits: '2' }),
        }
      );

      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Hangup />');

      // Assert inbound caller leg redirected programmatically to voicemail callback
      expect(mockCallsUpdate).toHaveBeenCalled();
      const updateArgs = mockCallsUpdate.mock.calls[0][0];
      expect(updateArgs.twiml).toContain('<Record');
      expect(updateArgs.twiml).toContain('/api/webhook/twilio/voicemail-callback');
    });

    it('should behave identically to decline on timeout/other inputs', async () => {
      mockCallsUpdate.mockClear();

      const response = await fetch(
        `${baseUrl}/api/webhook/twilio/transfer-decision?inboundCallSid=CA_INBOUND_TRANSFER_123&department=Support&tenantId=${testTenant.id}&timeout=true`,
        {
          method: 'POST',
          headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Hangup />');

      expect(mockCallsUpdate).toHaveBeenCalled();
      const updateArgs = mockCallsUpdate.mock.calls[0][0];
      expect(updateArgs.twiml).toContain('<Record');
    });
  });

  describe('4. Voicemail Webhook POST /api/webhook/twilio/voicemail-callback', () => {
    it('should parse recording URL and return hangup TwiML when RecordingUrl is present', async () => {
      const response = await fetch(
        `${baseUrl}/api/webhook/twilio/voicemail-callback?inboundCallSid=CA_INBOUND_TRANSFER_123&tenantId=${testTenant.id}`,
        {
          method: 'POST',
          headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC_test/Recordings/RE_12345',
            RecordingDuration: '15'
          }),
        }
      );

      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('recorded');
      expect(xml).toContain('<Hangup />');
    });
  });
});
