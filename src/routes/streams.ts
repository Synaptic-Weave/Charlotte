import { WebSocket, WebSocketServer, RawData } from 'ws';
import { IncomingMessage } from 'http';

import twilio from 'twilio';
import jwt from 'jsonwebtoken';
import { tenantLocalStorage } from '../db/context.js';
import { Tenant } from '../domain/entities/Tenant.js';
import { CallSessionService } from '../services/CallSessionService.js';
import { VoiceToolService } from '../services/VoiceToolService.js';
import { AppointmentService } from '../services/AppointmentService.js';
import { CustomerService } from '../services/CustomerService.js';
import { GeminiStreamService } from '../services/GeminiStreamService.js';

// Setup Twilio Client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC') && !accountSid.startsWith('ACXX') && !accountSid.startsWith('AC000');
export const twilioClient = isTwilioConfigured ? twilio(accountSid as string, authToken as string) : null;

const JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

export interface DashboardClient {
  ws: WebSocket;
  tenantId: string;
}

export const dashboardClients = new Set<DashboardClient>();

export function broadcastDashboardUpdate(tenantId: string, payload: unknown): void {
  const message = JSON.stringify(payload);
  console.log(`[WebSocket Broadcast] Broadcasting updates to tenant ${tenantId}. Payload:`, payload);
  for (const client of dashboardClients) {
    if (client.tenantId === tenantId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
      } catch (err) {
        console.error(`[WebSocket Broadcast] Failed to send update to client:`, err);
      }
    }
  }
}

export function registerStreamHandler(wss: WebSocketServer, callSessionSvc: CallSessionService, voiceToolSvc: VoiceToolService, appointmentSvc: AppointmentService, customerSvc: CustomerService): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/ws/updates') {
      const token = url.searchParams.get('token');
      if (!token) {
        console.log('[WebSocket Updates] Connection rejected: Missing token query parameter.');
        ws.close(4001, 'Authentication token required');
        return;
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & { tenantId: string };
        const tenantId = decoded.tenantId;
        if (!tenantId) {
          console.log('[WebSocket Updates] Connection rejected: Token missing tenantId claim.');
          ws.close(4003, 'Invalid token claims');
          return;
        }

        const client: DashboardClient = { ws, tenantId };
        dashboardClients.add(client);
        console.log(`[WebSocket Updates] Client subscribed successfully for Tenant ID: ${tenantId}`);

        ws.on('close', () => {
          dashboardClients.delete(client);
          console.log(`[WebSocket Updates] Client unsubscribed for Tenant ID: ${tenantId}`);
        });

        ws.on('error', (err) => {
          console.error(`[WebSocket Updates] Client connection error:`, err);
          dashboardClients.delete(client);
        });
      } catch (err) {
        console.log('[WebSocket Updates] Connection rejected: Invalid token.', err);
        ws.close(4002, 'Invalid authentication token');
      }
      return;
    }

    if (url.pathname !== '/api/streams') {
      console.log(`[WebSocket] Rejecting connection to path: ${url.pathname}`);
      ws.close(4004, 'Invalid streaming path');
      return;
    }

    console.log(`[WebSocket] Connection accepted from ${req.socket.remoteAddress}`);

    let streamSid: string | null = null;
    let callSid: string | null = null;
    let tenantId: string | null = null;
    let activeTenant: Tenant | null = null;
    let dialedNumber: string | null = null;
    let geminiSvc: GeminiStreamService | null = null;

    ws.on('message', async (message: RawData) => {
      try {
        const raw = typeof message === 'string' ? message : message.toString();
        const msg = JSON.parse(raw);

        switch (msg.event) {
          case 'connected':
            console.log('[Twilio Stream] Received connected event.');
            break;

          case 'start': {
            console.log('[Twilio Stream] Received start event:', msg.start);
            streamSid = msg.start.streamSid;
            callSid = msg.start.callSid;

            // Resolve custom parameters containing tenantId passed via TwiML
            const customParams = msg.start.customParameters || {};
            tenantId = customParams.tenantId;
            dialedNumber = customParams.dialedNumber;

            if (!tenantId || !callSid || !streamSid) {
              console.error('[Twilio Stream] Missing required custom parameters on start event.');
              ws.close(4000, 'Missing start parameters');
              return;
            }

            // Execute DB resolution and updates under RLS context
            await tenantLocalStorage.run({ tenantId }, async () => {
              const tenant = await callSessionSvc.getActiveTenant(tenantId!);
              if (!tenant) {
                throw new Error(`Tenant with ID ${tenantId} not found.`);
              }
              activeTenant = tenant;

              if (!dialedNumber) {
                const fbNumber = await callSessionSvc.getFallbackDialedNumber(tenantId!);
                if (fbNumber) {
                  dialedNumber = fbNumber;
                  console.log(`[Twilio Stream] Resolved dialed phone number from DB fallback: ${dialedNumber}`);
                }
              } else {
                console.log(`[Twilio Stream] Using dialed phone number from custom parameters: ${dialedNumber}`);
              }

              const greetingText = (tenant as any).agentGreeting || "Hello, how can I help you today?";
              await callSessionSvc.updateCallStatus(callSid!, streamSid!, 'active', greetingText);
              console.log(`[Twilio Stream] Updated CallSession for CallSid ${callSid} state to "active" and appended welcome greeting.`);
              broadcastDashboardUpdate(tenantId!, { event: 'calls_updated' });
            });

            if (!activeTenant) {
              ws.close(4001, 'Tenant resolution failed');
              return;
            }

            console.log(`[Twilio Stream] Bidirectional audio bridge initiated for Tenant: ${activeTenant.name}`);
            
            const isSecure = req.headers['x-forwarded-proto'] === 'https';
            const protocol = isSecure ? 'https' : 'http';
            const apiBaseUrl = process.env.CHARLOTTE_API_BASE_URL || `${protocol}://${req.headers.host}`;

            geminiSvc = new GeminiStreamService(
              ws,
              streamSid!,
              callSid!,
              tenantId!,
              activeTenant,
              dialedNumber,
              twilioClient,
              callSessionSvc,
              voiceToolSvc,
              appointmentSvc,
              customerSvc,
              apiBaseUrl
            );
            await geminiSvc.start();
            break;
          }

          case 'media': {
            if (geminiSvc) {
              await geminiSvc.processMedia(msg.media.payload);
            }
            break;
          }

          case 'stop':
            console.log('[Twilio Stream] Received stop event.');
            ws.close();
            break;
        }
      } catch (err) {
        console.error('[WebSocket] Error processing Twilio stream message:', err);
      }
    });

    ws.on('close', async (code: number, reason: string) => {
      console.log(`[WebSocket] Twilio Stream closed. Code: ${code}, Reason: ${reason}`);

      if (geminiSvc) {
        if (geminiSvc.outboundTransferCallSid && twilioClient && !geminiSvc.isTransferring) {
          try {
            console.log(`[Twilio REST] Inbound dropped, terminating active outbound transfer call ${geminiSvc.outboundTransferCallSid}...`);
            await twilioClient.calls(geminiSvc.outboundTransferCallSid).update({ status: 'completed' });
          } catch (err) {
            console.error(`[Twilio REST] Failed to terminate outbound call:`, err);
          }
        }
        geminiSvc.close();
      }

      // Update CallSession to completed/failed state
      if (callSid && tenantId) {
        try {
          await tenantLocalStorage.run({ tenantId }, async () => {
            await callSessionSvc.updateCallStatus(callSid!, '', 'completed');
            console.log(`[Twilio Stream] Updated CallSession ${callSid} state to "completed".`);
            broadcastDashboardUpdate(tenantId!, { event: 'calls_updated' });
          });
        } catch (err) {
          console.error('[WebSocket] Error during session teardown database update:', err);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error occurred:', error);
    });
  });
}
