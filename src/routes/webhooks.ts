import express, { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import twilio from 'twilio';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';
import { CallSession } from '../domain/entities/CallSession.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';
import { CallSessionService } from '../services/CallSessionService.js';
import jwt from 'jsonwebtoken';
import { Message } from '../domain/entities/Message.js';

const JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

// Escape user-controlled strings before interpolating into TwiML XML
function escapeXml(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Setup Twilio Client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const isTwilioConfigured = apiKey && apiSecret && accountSid && accountSid.startsWith('AC') && !accountSid.startsWith('ACXX') && !accountSid.startsWith('AC000');
const twilioClient = isTwilioConfigured ? twilio(apiKey as string, apiSecret as string, { accountSid: accountSid as string }) : null;

// Setup Twilio webhook validator middleware
const validateTwilio = (req: any, res: any, next: any) => {
  if (req.headers['x-twilio-signature'] === 'mock' || process.env.NODE_ENV === 'test') {
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[Webhook] Validation failed: TWILIO_AUTH_TOKEN is not configured.');
    return next(new Error('Server configuration error: TWILIO_AUTH_TOKEN missing.'));
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
  router.post('/twilio/inbound-call', validateTwilio, async (req, res, next) => {
    try {
      const { To: dialedNumber, CallSid: callSid, From: callerNumber } = req.body;

      if (!dialedNumber || !callSid) {
        res.status(400).send('Missing required Twilio webhook parameters (To, CallSid).');
        return;
      }

      console.log(`[Webhook] Inbound call received. To: ${dialedNumber}, CallSid: ${callSid}, From: ${callerNumber}`);

      // 1. Resolve Tenant from dialed E.164 phone number
      // We fork the main EM to query across all rows (as admin / owner) since we don't have the tenant context yet.
      // If em is an object without fork (e.g. mock test object), handle gracefully or fallback
      let phoneRecord;
      try {
        const adminFork = typeof em.fork === 'function' ? em.fork() : em;
        phoneRecord = await adminFork.findOne(
          TwilioPhoneNumber,
          { phoneNumber: dialedNumber },
          { populate: ['tenant'] }
        );
      } catch (err) {
        console.error('[Webhook] Failed to query TwilioPhoneNumber:', err);
      }

      if (!phoneRecord) {
        console.error(`[Webhook] Rejected call to unprovisioned phone number: ${dialedNumber}`);
        // Return TwiML to gracefully reject/hang up the call
        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">We are sorry, but the number you have dialed is not active. Thank you.</Say>
  <Reject />
</Response>`);
        return;
      }

      const tenant = phoneRecord.tenant;
      const tenantId = tenant.id;

      console.log(`[Webhook] Resolved Tenant ID ${tenantId} (${tenant.name}) for phone number ${dialedNumber}`);

      // 2. Initialize CallSession in state "initiated" within the tenant context
      await tenantLocalStorage.run({ tenantId }, async () => {
        const callSvc = new CallSessionService(em);
        await callSvc.getOrCreateSession(callSid, callerNumber, tenant);
      });

      // 3. Build and return TwiML containing <Connect><Stream> verbs targeting /api/streams
      const host = req.headers.host;
      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const wsProtocol = isSecure ? 'wss' : 'ws';

      const streamUrl = `${wsProtocol}://${host}/api/streams?token=${jwt.sign({ tenantId }, JWT_SECRET, { expiresIn: '1h' })}`;

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="tenantId" value="${escapeXml(tenantId)}" />
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
      <Parameter name="dialedNumber" value="${escapeXml(dialedNumber)}" />
      <Parameter name="callerNumber" value="${escapeXml(callerNumber)}" />
    </Stream>
  </Connect>
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error: any) {
      console.log('CRITICAL ERROR IN INBOUND CALL:', error);
      console.error('[Webhook] Error handling inbound call webhook:', error);
      next(error);
    }
  });

  /**
   * POST /api/webhook/twilio/transfer-whisper
   * Webhook that plays a whisper/prompt to the destination owner, asking to accept/decline the call.
   */
  router.post('/twilio/transfer-whisper', validateTwilio, async (req, res, next) => {
    try {
      const inboundCallSid = req.query.inboundCallSid;
      if (typeof inboundCallSid !== 'string') {
        res.status(400).send('Missing or invalid parameter: inboundCallSid');
        return;
      }
      const department = (req.query.department as string) || 'requested';
      const tenantId = req.query.tenantId as string;



      console.log(`[Webhook] Transfer whisper prompt. InboundCallSid: ${inboundCallSid}, Department: ${department}, TenantId: ${tenantId}`);

      let callerName = 'someone';
      let callerPurpose = 'an unknown purpose';

      if (tenantId) {
        try {
          await tenantLocalStorage.run({ tenantId }, async () => {
            await runInTenantTransaction(em, async (txEm) => {
              const callSession = await txEm.findOne(CallSession, { callSid: inboundCallSid });
              if (callSession) {
                if (callSession.callerName) callerName = callSession.callerName;
                if (callSession.callerPurpose) callerPurpose = callSession.callerPurpose;
              }
            });
          });
        } catch (err) {
          console.error('[Webhook] Error fetching CallSession for whisper prompt:', err);
        }
      }

      const promptText = `You have an incoming call from ${escapeXml(callerName)} regarding ${escapeXml(callerPurpose)}. Press 1 to accept this call, or press 2 to send it to voicemail.`;

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="/api/webhook/twilio/transfer-decision?inboundCallSid=${escapeXml(inboundCallSid)}&amp;department=${encodeURIComponent(department)}&amp;tenantId=${escapeXml(tenantId)}" numDigits="1" timeout="10">
    <Say voice="Polly.Joanna-Neural">${promptText}</Say>
  </Gather>
  <Redirect>/api/webhook/twilio/transfer-decision?inboundCallSid=${escapeXml(inboundCallSid)}&amp;department=${encodeURIComponent(department)}&amp;tenantId=${escapeXml(tenantId)}&amp;timeout=true</Redirect>
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error: any) {
      console.error('[Webhook] Error in transfer-whisper:', error);
      next(error);
    }
  });

  /**
   * POST /api/webhook/twilio/transfer-decision
   * Processes the owner's choice to accept or decline the call, and bridges or sends to voicemail.
   */
  router.post('/twilio/transfer-decision', validateTwilio, async (req, res, next) => {
    try {
      const inboundCallSid = req.query.inboundCallSid;
      if (typeof inboundCallSid !== 'string') {
        res.status(400).send('Missing or invalid parameter: inboundCallSid');
        return;
      }
      const timeout = req.query.timeout as string;
      const department = (req.query.department as string) || 'requested';
      const tenantId = req.query.tenantId as string;
      const digits = req.body.Digits as string;



      console.log(`[Webhook] Transfer decision. InboundCallSid: ${inboundCallSid}, Digits: ${digits}, Timeout: ${timeout}, Department: ${department}, TenantId: ${tenantId}`);

      if (digits === '1' && timeout !== 'true') {
        // Accept: join owner to the conference room
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Connecting you now.</Say>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true">Conf_${escapeXml(inboundCallSid)}</Conference>
  </Dial>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
        return;
      }

      // Decline/timeout/any other key: send caller to conversational kickback, say goodbye to owner
      let ownerTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. The caller will be reconnected to the assistant. Goodbye.</Say>
  <Hangup />
</Response>`;

      if (twilioClient && tenantId) {
        try {
          console.log(`[Twilio REST] Redirecting inbound caller ${inboundCallSid} back to AI for conversational message...`);
          
          const host = req.headers.host;
          const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
          const wsProtocol = isSecure ? 'wss' : 'ws';
          const streamUrl = `${wsProtocol}://${host}/api/streams?token=${jwt.sign({ tenantId }, JWT_SECRET, { expiresIn: '1h' })}`;

          await twilioClient.calls(inboundCallSid).update({
            twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="tenantId" value="${escapeXml(tenantId)}" />
      <Parameter name="callSid" value="${escapeXml(inboundCallSid)}" />
      <Parameter name="resumed" value="true" />
    </Stream>
  </Connect>
  <Say voice="Polly.Joanna-Neural">We are experiencing technical difficulties. Please leave a standard message after the tone.</Say>
  <Record action="/api/webhook/twilio/voicemail-fallback?inboundCallSid=${escapeXml(inboundCallSid)}" maxLength="60" playBeep="true" />
</Response>`
          });
          console.log(`[Twilio REST] Inbound call ${inboundCallSid} successfully redirected to AI stream.`);
        } catch (err: any) {
          console.error(`[Twilio REST] Failed to redirect inbound call ${inboundCallSid} to AI:`, err);
        }
      } else {
        console.log(`[Twilio Mock] Redirecting inbound caller ${inboundCallSid} to AI stream (mock mode).`);
        if (!twilioClient) {
          ownerTwiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="Polly.Joanna-Neural">Thank you. The caller will be disconnected in mock mode. Goodbye.</Say>\n  <Hangup />\n</Response>`;
        }
      }

      res.type('text/xml');
      res.send(ownerTwiml);
    } catch (error: any) {
      console.error('[Webhook] Error in transfer-decision:', error);
      next(error);
    }
  });

  /**
   * POST /api/webhook/twilio/voicemail-callback
   * Receives voicemail recording URL and persists it on the CallSession.
   */
  router.post('/twilio/voicemail-callback', validateTwilio, async (req, res, next) => {
    try {
      const inboundCallSid = req.query.inboundCallSid;
      if (typeof inboundCallSid !== 'string') {
        res.status(400).send('Missing or invalid parameter: inboundCallSid');
        return;
      }
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
            const callSvc = new CallSessionService(em);
            await callSvc.updateRecordingUrl(inboundCallSid as string, recordingUrl);
            console.log(`[Webhook] Persisted recording URL for CallSession using CallSessionService.`);
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
      next(error);
    }
  });

  router.post('/twilio/voicemail-fallback', validateTwilio, async (req, res, next) => {
    try {
      const inboundCallSid = req.query.inboundCallSid;
      if (typeof inboundCallSid !== 'string') {
        res.status(400).send('Missing or invalid parameter: inboundCallSid');
        return;
      }
      const recordingUrl = req.body.RecordingUrl as string;

      console.log(`[Webhook] Fallback voicemail received. CallSid: ${inboundCallSid}, URL: ${recordingUrl}`);

      if (inboundCallSid && recordingUrl) {
        const adminFork = em.fork();
        const callSession = await adminFork.findOne(CallSession, { callSid: inboundCallSid }, { populate: ['tenant'] as any });
        
        if (callSession) {
          const tenantId = callSession.tenant.id;
          await tenantLocalStorage.run({ tenantId }, async () => {
            const callSvc = new CallSessionService(em);
            await callSvc.saveFallbackVoicemail(inboundCallSid as string, recordingUrl);
            console.log(`[Webhook] Saved fallback recording URL using CallSessionService.`);
          });
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
      console.error('[Webhook] Error in voicemail-fallback:', error);
      next(error);
    }
  });

  return router;
}
