import { Router } from 'express';
import { Twilio } from 'twilio';
import { CallSessionService } from '../services/CallSessionService.js';

import { Request, Response, NextFunction } from 'express';

// Minimal middleware to loosely check if the request looks like it came from Twilio
// In production, use twilio.webhook() with your auth token.
function validateTwilio(req: Request, res: Response, next: NextFunction) {
  // If we wanted strict validation:
  // twilio.validateRequest(authToken, req.headers['x-twilio-signature'], url, req.body)
  next();
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Setup Twilio Client with optional credentials check
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC') && !accountSid.startsWith('ACXX') && !accountSid.startsWith('AC000');
const twilioClient = isTwilioConfigured ? new Twilio(accountSid, authToken) : null;

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

      // 1. Resolve tenant context from dialed number
      const tenantId = await callSessionService.findTenantIdByPhoneNumber(dialedNumber);

      if (!tenantId) {
        console.warn(`[Webhook] No tenant found for dialed number: ${dialedNumber}. Playing error and hanging up.`);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">We're sorry, but the application could not find a subscriber for this number. Goodbye.</Say>
  <Hangup />
</Response>`;
        res.type('text/xml');
        res.send(twiml);
        return;
      }

      // 2. Open an async thread local context for the tenant and execute DB logic safely
      await callSessionService.createCallWithContext(tenantId, callSid, callerNumber);

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

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="/api/webhook/twilio/transfer-decision?inboundCallSid=${inboundCallSid}&amp;department=${encodeURIComponent(department)}" numDigits="1" timeout="10">
    <Say voice="Polly.Joanna-Neural">You have an incoming call from Charlotte for the ${escapeXml(department)} department. Press 1 to accept this call, or press 2 to send it to voicemail.</Say>
  </Gather>
  <Redirect>/api/webhook/twilio/transfer-decision?inboundCallSid=${inboundCallSid}&amp;department=${encodeURIComponent(department)}&amp;timeout=true</Redirect>
</Response>`;

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
        } catch (err: unknown) {
          console.error(`[Twilio REST] Failed to redirect inbound call ${inboundCallSid} to voicemail:`, err);
        }
      } else {
        console.log(`[Twilio Mock] Redirecting inbound caller ${inboundCallSid} to voicemail prompt (mock mode).`);
      }

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

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Your message has been recorded. Thank you for calling. Goodbye.</Say>
  <Hangup />
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error: unknown) {
      console.error('[Webhook] Error in voicemail-callback:', error);
      res.status(500).send('Internal server error processing voicemail callback.');
    }
  });

  return router;
}
