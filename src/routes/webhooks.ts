import { Router, Request, Response, NextFunction } from 'express';
import { CallSessionService } from '../services/CallSessionService.js';
import twilio from 'twilio';

// Setup Twilio webhook validator middleware
const validateTwilio = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-twilio-signature'] as string;
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const protocol = isSecure ? 'https' : 'http';
  const url = (process.env.CHARLOTTE_API_BASE_URL || `${protocol}://${req.headers.host}`) + req.originalUrl;
  const params = req.body;

  if (!process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[Webhook] TWILIO_AUTH_TOKEN not set, bypassing validation.');
    next();
    return;
  }

  if (!signature) {
    console.error(`[Webhook] Validation failed: Missing X-Twilio-Signature header on URL: ${url}`);
    return res.status(401).send('Missing Twilio Signature.');
  }

  const isValid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, signature, url, params);
  if (!isValid) {
    console.error(`[Webhook] Signature validation failed. URL: ${url}, Signature: ${signature}, Params:`, params);
    return res.status(403).send('Webhook validation failed.');
  }

  next();
};

export function createWebhooksRouter(callSessionService: CallSessionService): Router {
  const router = Router();

  /**
   * POST /api/webhook/twilio/inbound-call
   * Handles incoming Twilio calls by routing them directly into the bidirectional Web Socket media stream.
   */
  router.post('/twilio/inbound-call', validateTwilio, async (req, res) => {
    try {
      const callSid = req.body.CallSid as string;
      const dialedNumber = req.body.To as string;
      const callerNumber = req.body.From as string;

      console.log(`[Webhook] Inbound call received. SID: ${callSid}, To: ${dialedNumber}, From: ${callerNumber}`);

      if (!callSid || !dialedNumber || !callerNumber) {
        res.status(400).send('Missing required Twilio webhook parameters');
        return;
      }

      // 1. Resolve tenant context from dialed number
      let tenantId = await callSessionService.findTenantIdByPhoneNumber(dialedNumber);

      if (!tenantId) {
        // Fallback for local testing and unconfigured numbers
        console.warn(`[Webhook] No tenant found for dialed number: ${dialedNumber}. Falling back to first available tenant.`);
        const firstTenant = await callSessionService.getFirstTenant();
        if (firstTenant) {
          tenantId = firstTenant.id;
        }
      }

      if (!tenantId) {
        console.warn(`[Webhook] No tenant found for dialed number: ${dialedNumber} and no fallback available. Playing error and hanging up.`);
        res.type('text/xml');
        res.send(callSessionService.generateErrorTwiML());
        return;
      }

      // 2. Open an async thread local context for the tenant and execute DB logic safely
      await callSessionService.createCallWithContext(tenantId, callSid, callerNumber);

      // 3. Build and return TwiML containing <Connect><Stream> verbs targeting /api/streams
      const host = req.headers.host;
      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const wsProtocol = isSecure ? 'wss' : 'ws';

      const streamUrl = `${wsProtocol}://${host}/api/streams`;

      const twiml = callSessionService.generateStreamTwiML(streamUrl, tenantId, callSid, dialedNumber, callerNumber);
      res.type('text/xml');
      res.send(twiml);
    } catch (error: unknown) {
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

      const twiml = callSessionService.generateTransferWhisperTwiML(inboundCallSid, department);
      res.type('text/xml');
      res.send(twiml);
    } catch (error: unknown) {
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
        const twiml = callSessionService.generateAcceptTransferTwiML(inboundCallSid);
        res.type('text/xml');
        res.send(twiml);
        return;
      }

      // Decline/timeout/any other key: send caller to voicemail, say goodbye to owner
      const ownerTwiml = await callSessionService.processDeclineTransfer(inboundCallSid, department);
      res.type('text/xml');
      res.send(ownerTwiml);
    } catch (error: unknown) {
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
        await callSessionService.updateRecordingUrl(inboundCallSid, recordingUrl);
      }

      const twiml = callSessionService.generateVoicemailCallbackTwiML();
      res.type('text/xml');
      res.send(twiml);
    } catch (error: unknown) {
      console.error('[Webhook] Error in voicemail-callback:', error);
      res.status(500).send('Internal server error processing voicemail callback.');
    }
  });

  return router;
}
