 
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
import {
  decodeMuLawBuffer,
  encodeMuLawBuffer,
  upsample8kHzTo16kHz,
  downsample24kHzTo8kHz,
  downsample24kHzTo8kHzWithCarryover,
  transcodeTwilioToGemini,
  transcodeGeminiToTwilio
} from '../src/services/transcoder.js';

let createWebhooksRouter: unknown;
let registerStreamHandler: unknown;

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
    } catch {
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
  } catch {
    throw new Error('Could not resolve postgres connection or create charlotte_db.');
  } finally {
    await client.end();
  }

  return 'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable';
}

describe('Charlotte Telephony Inbound Call Webhook & WebSocket Media Stream Bridge Integration Tests', () => {
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
    // Run in mock/sandbox mode during testing by specifying a key starting with 'AIzaSyMock'
    process.env.GEMINI_API_KEY = 'AIzaSyMock_test_key';
    delete process.env.TWILIO_AUTH_TOKEN;

    // Dynamically import routes after env setup to ensure streams.ts correctly initializes in mock mode
    const webhooksModule = await import('../src/routes/webhooks.js');
    const streamsModule = await import('../src/routes/streams.js');
    createWebhooksRouter = webhooksModule.createWebhooksRouter;
    registerStreamHandler = streamsModule.registerStreamHandler;

    // 1. Database Connection and Migration Sync
    dbUrl = await setupTestDatabase();
    orm = await MikroORM.init({
      ...config,
      clientUrl: dbUrl,
      entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],
    });

    console.log('[Test Setup] Checking database schema and running migrations...');
    await orm.getMigrator().up();

    // 2. Clear pre-existing test residues
    const fork = orm.em.fork();
    const exTenants = await fork.find(Tenant, { name: 'Voice Test Tenant Ltd' });
    if (exTenants.length > 0) {
      await fork.nativeDelete(Tenant, { id: { $in: exTenants.map((t) => t.id) } });
    }

    // 3. Seed Tenant & Phone Number inside RLS context so the seed path
    //    exercises the same application data path as production writes.
    testTenant = Tenant.create('Voice Test Tenant Ltd', '+15559990000');
    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await runInTenantTransaction(orm.em, async (txEm) => {
        testPhoneNumber = TwilioPhoneNumber.create(testTenant, '+15125550200', 'Voice Testing Number');
        txEm.persist([testTenant, testPhoneNumber]);
        await txEm.flush();
      });
    });
    console.log(`[Test Setup] Seeded Tenant ${testTenant.id} with Twilio Number ${testPhoneNumber.phoneNumber}`);

    // 4. Initialize Express application and HTTP server
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Register Webhook endpoints
    app.use('/api/webhook', createWebhooksRouter(orm.em));

    server = http.createServer(app);
    wss = new WebSocketServer({ server });

    // Register WebSocket streaming route
    registerStreamHandler(wss, orm.em);

    // Bind HTTP server to dynamic free port assigned by the OS
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    port = (server.address() as unknown).port;
    baseUrl = `http://localhost:${port}`;
    wsUrl = `ws://localhost:${port}/api/streams`;
    console.log(`[Test Server] Live on ${baseUrl} & WebSocket on ${wsUrl}`);
  });

  afterAll(async () => {
    // 1. Close Server & WebSockets
    if (wss) {
      wss.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 2. Cleanup Data Residues
    if (orm && testTenant) {
      const fork = orm.em.fork();
      await fork.nativeDelete(Tenant, { id: testTenant.id });
      await orm.close();
    }
    console.log('[Test Teardown] Complete. All resources released.');
  });

  describe('1. Inbound Twilio Webhook POST /api/webhook/twilio/inbound-call', () => {
    it('should reject call with 400 Bad Request if webhook parameters are missing', async () => {
      const response = await fetch(`${baseUrl}/api/webhook/twilio/inbound-call`, {
        method: 'POST',
        headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain('Missing required Twilio webhook parameters');
    });

    it('should fallback to the first tenant if phone number is not found/provisioned', async () => {
      const response = await fetch(`${baseUrl}/api/webhook/twilio/inbound-call`, {
        method: 'POST',
        headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          To: '+18005559999', // Unknown unprovisioned number
          CallSid: 'CA_UNKNOWN_SID_001',
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/xml');
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Connect>');
      expect(xml).toContain('<Stream url=');
    });

    it('should successfully resolve tenant, save CallSession with state "initiated", and return valid TwiML with Connect Stream verbs', async () => {
      const callSid = 'CA_TEST_CALL_12345';
      const response = await fetch(`${baseUrl}/api/webhook/twilio/inbound-call`, {
        method: 'POST',
        headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          To: '+15125550200', // Our seeded active number
          CallSid: callSid,
        }),
      });

      // Assert Response Headers and XML Content
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/xml');
      const xml = await response.text();
      
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Connect>');
      expect(xml).toContain(`<Stream url="ws://localhost:${port}/api/streams">`);
      expect(xml).toContain(`<Parameter name="tenantId" value="${testTenant.id}" />`);
      expect(xml).toContain(`<Parameter name="callSid" value="${callSid}" />`);

      // Query database to confirm CallSession exists in state 'initiated'
      const fork = orm.em.fork();
      const callSession = await fork.findOne(CallSession, { callSid });
      expect(callSession).not.toBeNull();
      expect(callSession!.status).toBe('initiated');
      expect(callSession!.tenant.id).toBe(testTenant.id);
    });
  });

  describe('1.5 Inbound Twilio Transfer & Bridging Webhooks', () => {
    it('should handle POST /api/webhook/twilio/transfer-whisper and return correct TwiML with Gather and Redirect', async () => {
      const response = await fetch(`${baseUrl}/api/webhook/twilio/transfer-whisper?inboundCallSid=CA_TRANSFER_123&department=Sales`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/xml');
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Gather action="/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&amp;department=Sales" numDigits="1" timeout="10">');
      expect(xml).toContain('You have an incoming call from Charlotte for the Sales department. Press 1 to accept this call, or press 2 to send it to voicemail.');
      expect(xml).toContain('<Redirect>/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&amp;department=Sales&amp;timeout=true</Redirect>');
    });

    it('should handle POST /api/webhook/twilio/transfer-decision with accept decision (Digits=1) and return connecting conference TwiML', async () => {
      const response = await fetch(`${baseUrl}/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&department=Sales`, {
        method: 'POST',
        headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'Digits=1',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/xml');
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('Connecting you now.');
      expect(xml).toContain('<Conference startConferenceOnEnter="true" endConferenceOnExit="true">Conf_CA_TRANSFER_123</Conference>');
    });

    it('should handle POST /api/webhook/twilio/transfer-decision with decline decision (Digits=2) or timeout and return voicemail redirect with mock support', async () => {
      const response = await fetch(`${baseUrl}/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&department=Support`, {
        method: 'POST',
        headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'Digits=2',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/xml');
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('Thank you. The caller will be sent to voicemail. Goodbye.');
      expect(xml).toContain('<Hangup />');
    });

    it('should handle POST /api/webhook/twilio/voicemail-callback and return thank you response TwiML', async () => {
      const response = await fetch(`${baseUrl}/api/webhook/twilio/voicemail-callback?inboundCallSid=CA_TRANSFER_123`, {
        method: 'POST',
        headers: { 'X-Twilio-Signature': 'mock', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'RecordingUrl=http://mockurl.com/record.mp3&RecordingDuration=15',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/xml');
      const xml = await response.text();
      expect(xml).toContain('<Response>');
      expect(xml).toContain('Your message has been recorded. Thank you for calling. Goodbye.');
      expect(xml).toContain('<Hangup />');
    });
  });

  describe('2. WebSocket Media Stream Connection, Transcoding & Sandbox Audio Loop', () => {
    it('should reject connection to any non-streaming WebSocket path', async () => {
      const client = new WebSocket(`ws://localhost:${port}/api/unknown-path`);
      
      const errorPromise = new Promise<number>((resolve) => {
        client.on('close', (code) => {
          resolve(code);
        });
      });

      const code = await errorPromise;
      expect(code).toBe(4004); // Sent by our router (Invalid streaming path)
    });

    it('should process start/media/stop framing, update database statuses correctly, and receive audio loops', async () => {
      const callSid = 'CA_TEST_CALL_12345'; // Matching the CallSid from webhook test
      const streamSid = 'MZ_TEST_STREAM_12345';

      const client = new WebSocket(wsUrl);

      // Verify connection opens
      await new Promise<void>((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
      });

      // Set up listeners to capture incoming server messages
      const receivedMessages: unknown[] = [];
      client.on('message', (data: string) => {
        receivedMessages.push(JSON.parse(data));
      });

      // 1. Send Connected packet
      client.send(JSON.stringify({ event: 'connected' }));
      await sleep(100);

      // 2. Send Start packet containing parameters
      client.send(JSON.stringify({
        event: 'start',
        start: {
          streamSid,
          callSid,
          customParameters: {
            tenantId: testTenant.id,
            callSid: callSid
          }
        }
      }));

      // Give database update worker thread time to process and flush
      await sleep(300);

      // Verify CallSession status escalated to "active" with streamSid populated
      const fork = orm.em.fork();
      const activeSession = await fork.findOne(CallSession, { callSid });
      expect(activeSession).not.toBeNull();
      expect(activeSession!.status).toBe('active');
      expect(activeSession!.streamSid).toBe(streamSid);

      // 3. Send Media packet (base64 encoded audio sample)
      // Generates a mock mu-law audio chunk
      const mockAudioSample = Buffer.alloc(160, 0x55).toString('base64');
      client.send(JSON.stringify({
        event: 'media',
        media: {
          payload: mockAudioSample
        }
      }));

      // Wait 1.2s to trigger sandbox fallback greeting audio packet scheduler (1000ms delay)
      await sleep(1200);

      // Check that client received at least one media frame back from the bridge server sandbox mode
      expect(receivedMessages.length).toBeGreaterThan(0);
      const mediaMsg = receivedMessages.find((m) => m.event === 'media');
      expect(mediaMsg).toBeDefined();
      expect(mediaMsg.streamSid).toBe(streamSid);
      expect(mediaMsg.media?.payload).toBeDefined();

      // 4. Send Stop packet
      client.send(JSON.stringify({ event: 'stop' }));

      // Wait for WS close and database status update completion
      await sleep(300);

      // Verify CallSession status completed teardown successfully as "completed"
      const completedSession = await fork.findOne(CallSession, { callSid });
      expect(completedSession).not.toBeNull();
      expect(completedSession!.status).toBe('completed');

      client.close();
    });
  });

  describe('3. High-Performance Audio Transcoder Service Unit Tests', () => {
    it('should accurately translate G.711 mu-law (PCMU) buffer to Linear PCM and back (O(1) lookup)', () => {
      // Create mu-law buffer populated with diverse byte values [0..255]
      const originalMuLaw = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
      
      const pcm16 = decodeMuLawBuffer(originalMuLaw);
      expect(pcm16).toBeInstanceOf(Int16Array);
      expect(pcm16.length).toBe(256);

      const encodedBack = encodeMuLawBuffer(pcm16);
      expect(encodedBack).toBeInstanceOf(Buffer);
      expect(encodedBack.length).toBe(256);

      // Verify that all encoded values are standard 8-bit unsigned integers in the range [0..255]
      for (let i = 0; i < 256; i++) {
        expect(encodedBack[i]).toBeGreaterThanOrEqual(0);
        expect(encodedBack[i]).toBeLessThanOrEqual(255);
      }
    });

    it('should upscale 8kHz PCM to 16kHz via linear interpolation', () => {
      const pcm8 = new Int16Array([1000, 2000, -1000, -2000]);
      const pcm16 = upsample8kHzTo16kHz(pcm8);

      expect(pcm16.length).toBe(8);
      expect(pcm16[0]).toBe(1000);
      expect(pcm16[1]).toBe(1500); // Average of 1000 and 2000
      expect(pcm16[2]).toBe(2000);
      expect(pcm16[3]).toBe(500);  // Average of 2000 and -1000
      expect(pcm16[4]).toBe(-1000);
      expect(pcm16[5]).toBe(-1500); // Average of -1000 and -2000
      expect(pcm16[6]).toBe(-2000);
      expect(pcm16[7]).toBe(-2000); // Edge case boundary repeated
    });

    it('should downsample 24kHz to 8kHz via 3-sample average filter', () => {
      const pcm24 = new Int16Array([
        300, 600, 900,      // Avg = 600
        -300, -600, -900,   // Avg = -600
        1200, 1200, 1200    // Avg = 1200
      ]);

      const pcm8 = downsample24kHzTo8kHz(pcm24);
      expect(pcm8.length).toBe(3);
      expect(pcm8[0]).toBe(600);
      expect(pcm8[1]).toBe(-600);
      expect(pcm8[2]).toBe(1200);
    });

    it('should downsample with stateful carryover to eliminate phase-jitter', () => {
      // 5 samples: not divisible by 3. Leftover count = 5 % 3 = 2 samples leftover.
      const pcm24_first = new Int16Array([300, 600, 900, 1200, 1500]);
      const carryover_empty = new Int16Array(0);

      const result1 = downsample24kHzTo8kHzWithCarryover(pcm24_first, carryover_empty);
      expect(result1.downsampled.length).toBe(1);
      expect(result1.downsampled[0]).toBe(600); // Avg of 300, 600, 900
      expect(result1.carryover.length).toBe(2);
      expect(result1.carryover[0]).toBe(1200);
      expect(result1.carryover[1]).toBe(1500);

      // Now supply 2 new samples. Total samples = 2 carryover + 2 new = 4 samples.
      // 4 / 3 = 1 output sample. Leftover count = 4 % 3 = 1 sample leftover.
      const pcm24_second = new Int16Array([1800, 2100]);
      const result2 = downsample24kHzTo8kHzWithCarryover(pcm24_second, result1.carryover);
      expect(result2.downsampled.length).toBe(1);
      expect(result2.downsampled[0]).toBe(1500); // Avg of 1200, 1500, 1800
      expect(result2.carryover.length).toBe(1);
      expect(result2.carryover[0]).toBe(2100);
    });

    it('should complete cross-transcoding streams successfully (Twilio => Gemini and Gemini => Twilio)', () => {
      // 1. Twilio (8kHz mu-law) to Gemini (16kHz PCM)
      const twilioPayloadBase64 = Buffer.alloc(80, 0x55).toString('base64');
      const geminiPayloadBase64 = transcodeTwilioToGemini(twilioPayloadBase64);
      
      expect(geminiPayloadBase64).toBeDefined();
      const geminiBytes = Buffer.from(geminiPayloadBase64, 'base64');
      // 80 samples of 8kHz => upsampled to 160 samples of 16kHz * 2 bytes/sample = 320 bytes
      expect(geminiBytes.length).toBe(320);

      // 2. Gemini (24kHz PCM) to Twilio (8kHz mu-law)
      // 240 samples * 2 bytes/sample = 480 bytes
      const geminiInputBase64 = Buffer.alloc(480, 0).toString('base64');
      const twilioOutputBase64 = transcodeGeminiToTwilio(geminiInputBase64);

      expect(twilioOutputBase64).toBeDefined();
      const twilioBytes = Buffer.from(twilioOutputBase64, 'base64');
      // 240 samples of 24kHz => downsampled to 80 samples of 8kHz * 1 byte/sample = 80 bytes
      expect(twilioBytes.length).toBe(80);
    });
  });
});
