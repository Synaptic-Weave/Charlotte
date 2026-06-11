import express, { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import twilio from 'twilio';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';
import { CallSession } from '../domain/entities/CallSession.js';
import { Tenant } from '../domain/entities/Tenant.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';

// Escape user-controlled strings before interpolating into TwiML XML
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Setup Twilio Client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC') && !accountSid.startsWith('ACXX') && !accountSid.startsWith('AC000');
const twilioClient = isTwilioConfigured ? twilio(accountSid as string, authToken as string) : null;

// Setup Twilio webhook validator middleware
const validateTwilio = (req: any, res: any, next: any) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return next();
  }

  const signature = req.headers['x-twilio-signature'] as string;
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const protocol = isSecure ? 'https' : 'http';
  const url = (process.env.CHARLOTTE_API_BASE_URL || `${protocol}://${req.headers.host}`) + req.originalUrl;
  const params = req.body;

  if (!signature) {
    console.error(`[Webhook] Validation failed: Missing X-Twilio-Signature header on URL: ${url}`);
    return res.status(401).send('Missing Twilio Signature.');
  }

  const isValid = twilio.validateRequest(authToken, signature, url, params);
  if (!isValid) {
    console.error(`[Webhook] Signature validation failed. URL: ${url}, Signature: ${signature}, Params:`, params);
    return res.status(403).send('Webhook validation failed.');
  }

  next();
};

export function createWebhooksRouter(em: EntityManager): Router {
  const router = Router();

  // Parse urlencoded bodies for Twilio webhooks
  router.use(express.urlencoded({ extended: true }));

  /**
   * POST /api/webhook/twilio/inbound-call
   * Webhook called by Twilio when an inbound voice call is received.
   * Resolves the matching Tenant based on dialed phone number (To),
   * initializes the CallSession under active RLS context, and
   * returns TwiML containing the <Connect><Stream> verbs.
   */
  router.post('/twilio/inbound-call', validateTwilio, async (req, res) => {
    try {
      const { To: dialedNumber, CallSid: callSid, From: callerNumber } = req.body;

      if (!dialedNumber || !callSid) {
        res.status(400).send('Missing required Twilio webhook parameters (To, CallSid).');
        return;
      }

      console.log(`[Webhook] Inbound call received. To: ${dialedNumber}, CallSid: ${callSid}, From: ${callerNumber}`);

      // 1. Resolve Tenant from dialed E.164 phone number
      // We fork the main EM to query across all rows (as admin / owner) since we don't have the tenant context yet.
      const adminFork = em.fork();
      const phoneRecord = await adminFork.findOne(
        TwilioPhoneNumber,
        { phoneNumber: dialedNumber },
        { populate: ['tenant'] }
      );

      let tenant;
      let tenantId;

      if (!phoneRecord) {
        console.warn(`[Webhook] Warning: Phone number ${dialedNumber} is not provisioned in the database. Falling back to the first available tenant...`);
        // Fallback to the first tenant in the system (safe for single-user deployments)
        const fallbackTenant = await adminFork.findOne(Tenant, {});
        if (!fallbackTenant) {
          console.error(`[Webhook] Rejected call: No tenants exist in the database!`);
          res.type('text/xml');
          res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">We are sorry, but the system is currently unavailable. Thank you.</Say>
  <Reject />
</Response>`);
          return;
        }
        tenant = fallbackTenant;
        tenantId = tenant.id;
      } else {
        tenant = phoneRecord.tenant;
        tenantId = tenant.id;
      }

      console.log(`[Webhook] Resolved Tenant ID ${tenantId} (${tenant.name}) for inbound call`);

      // 2. Initialize CallSession in state "initiated" within the tenant context
      await tenantLocalStorage.run({ tenantId }, async () => {
        await runInTenantTransaction(em, async (txEm) => {
          // Check if session already exists
          const existing = await txEm.findOne(CallSession, { callSid });
          if (!existing) {
            const callSession = CallSession.create(tenant, callSid, callerNumber || 'Unknown');
            txEm.persist(callSession);
            await txEm.flush();
            console.log(`[Webhook] Created new CallSession in "initiated" status: ${callSession.id}`);
          } else {
            console.log(`[Webhook] CallSession already exists for CallSid: ${callSid}`);
          }
        });
      });

      // 3. Build and return TwiML containing <Connect><Stream> verbs targeting /api/streams
      const host = req.headers.host;
      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const wsProtocol = isSecure ? 'wss' : 'ws';

      const streamUrl = `${wsProtocol}://${host}/api/streams`;

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="tenantId" value="${tenantId}" />
      <Parameter name="callSid" value="${callSid}" />
      <Parameter name="dialedNumber" value="${dialedNumber}" />
      <Parameter name="callerNumber" value="${callerNumber}" />
    </Stream>
  </Connect>
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error: any) {
      console.error('[Webhook] Error handling inbound call webhook:', error);
      res.status(500).send('Internal server error occurred processing call.');
    }
  });

  /**
   * POST /api/webhook/twilio/transfer-whisper
   * Webhook that plays a whisper/prompt to the destination owner, asking to accept/decline the call.
   */
  router.post('/twilio/transfer-whisper', validateTwilio, async (req, res) => {
    try {
      const inboundCallSid = req.query.inboundCallSid as string;
      const department = (req.query.department as string) || 'requested';
      const tenantId = req.query.tenantId as string;

      if (!inboundCallSid) {
        res.status(400).send('Missing required parameter: inboundCallSid');
        return;
      }

      console.log(`[Webhook] Transfer whisper prompt. InboundCallSid: ${inboundCallSid}, Department: ${department}, TenantId: ${tenantId}`);

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="/api/webhook/twilio/transfer-decision?inboundCallSid=${inboundCallSid}&amp;department=${encodeURIComponent(department)}" numDigits="1" timeout="10">
    <Say voice="Polly.Joanna-Neural">You have an incoming call from Charlotte for the ${escapeXml(department)} department. Press 1 to accept this call, or press 2 to send it to voicemail.</Say>
  </Gather>
  <Redirect>/api/webhook/twilio/transfer-decision?inboundCallSid=${inboundCallSid}&amp;department=${encodeURIComponent(department)}&amp;timeout=true</Redirect>
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error: any) {
      console.error('[Webhook] Error in transfer-whisper:', error);
      res.status(500).send('Internal server error processing transfer whisper.');
    }
  });

  /**
   * POST /api/webhook/twilio/transfer-decision
   * Processes the owner's choice to accept or decline the call, and bridges or sends to voicemail.
   */
  router.post('/twilio/transfer-decision', validateTwilio, async (req, res) => {
    try {
      const inboundCallSid = req.query.inboundCallSid as string;
      const timeout = req.query.timeout as string;
      const department = (req.query.department as string) || 'requested';
      const digits = req.body.Digits as string;

      if (!inboundCallSid) {
        res.status(400).send('Missing required parameter: inboundCallSid');
        return;
      }

      console.log(`[Webhook] Transfer decision. InboundCallSid: ${inboundCallSid}, Digits: ${digits}, Timeout: ${timeout}, Department: ${department}`);

      if (digits === '1' && timeout !== 'true') {
        // Accept: join owner to the conference room
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Connecting you now.</Say>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true">Conf_${inboundCallSid}</Conference>
  </Dial>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
        return;
      }

      // Decline/timeout/any other key: send caller to voicemail, say goodbye to owner
      const ownerTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. The caller will be sent to voicemail. Goodbye.</Say>
  <Hangup />
</Response>`;

      if (twilioClient) {
        try {
          console.log(`[Twilio REST] Redirecting inbound caller ${inboundCallSid} to voicemail prompt...`);
          await twilioClient.calls(inboundCallSid).update({
            twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I'm sorry, but no one is available in the ${escapeXml(department)} department right now. Please leave a message after the tone.</Say>
  <Record action="/api/webhook/twilio/voicemail-callback?inboundCallSid=${inboundCallSid}" maxLength="60" playBeep="true" />
</Response>`
          });
          console.log(`[Twilio REST] Inbound call ${inboundCallSid} successfully redirected to voicemail.`);
        } catch (err: any) {
          console.error(`[Twilio REST] Failed to redirect inbound call ${inboundCallSid} to voicemail:`, err);
        }
      } else {
        console.log(`[Twilio Mock] Redirecting inbound caller ${inboundCallSid} to voicemail prompt (mock mode).`);
      }

      res.type('text/xml');
      res.send(ownerTwiml);
    } catch (error: any) {
      console.error('[Webhook] Error in transfer-decision:', error);
      res.status(500).send('Internal server error processing transfer decision.');
    }
  });

  /**
   * POST /api/webhook/twilio/voicemail-callback
   * Receives voicemail recording URL and persists it on the CallSession.
   */
  router.post('/twilio/voicemail-callback', validateTwilio, async (req, res) => {
    try {
      const inboundCallSid = req.query.inboundCallSid as string;
      const recordingUrl = req.body.RecordingUrl as string;
      const recordingDuration = req.body.RecordingDuration as string;

      console.log(`[Webhook] Voicemail received. InboundCallSid: ${inboundCallSid}, RecordingUrl: ${recordingUrl}, Duration: ${recordingDuration}s`);

      // Persist the recording URL on the CallSession record
      if (inboundCallSid && recordingUrl) {
        // Use an admin fork (no tenant context) to resolve the session and its tenant
        const adminFork = em.fork();
        const callSession = await adminFork.findOne(CallSession, { callSid: inboundCallSid }, { populate: ['tenant'] as any });
        if (callSession) {
          const tenantId = callSession.tenant.id;
          await tenantLocalStorage.run({ tenantId }, async () => {
            await runInTenantTransaction(em, async (txEm) => {
              const session = await txEm.findOne(CallSession, { callSid: inboundCallSid });
              if (session) {
                session.updateRecordingUrl(recordingUrl);
                txEm.persist(session);
                await txEm.flush();
                console.log(`[Webhook] Persisted recording URL for CallSession ${session.id}.`);
              }
            });
          });
        } else {
          console.warn(`[Webhook] CallSession not found for CallSid: ${inboundCallSid}. Recording URL not persisted.`);
        }
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Your message has been recorded. Thank you for calling. Goodbye.</Say>
  <Hangup />
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error: any) {
      console.error('[Webhook] Error in voicemail-callback:', error);
      res.status(500).send('Internal server error processing voicemail callback.');
    }
  });

  return router;
}
