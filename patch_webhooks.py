with open('src/routes/webhooks.ts', 'r') as f:
    content = f.read()

old_connect = """<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="tenantId" value="${tenantId}" />
      <Parameter name="callSid" value="${inboundCallSid}" />
      <Parameter name="resumed" value="true" />
    </Stream>
  </Connect>
</Response>`"""

new_connect = """<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="tenantId" value="${tenantId}" />
      <Parameter name="callSid" value="${inboundCallSid}" />
      <Parameter name="resumed" value="true" />
    </Stream>
  </Connect>
  <Say voice="Polly.Joanna-Neural">We are experiencing technical difficulties. Please leave a standard message after the tone.</Say>
  <Record action="/api/webhook/twilio/voicemail-fallback?inboundCallSid=${inboundCallSid}" maxLength="60" playBeep="true" />
</Response>`"""

content = content.replace(old_connect, new_connect)

# Add /voicemail-fallback endpoint
fallback_endpoint = """  router.post('/twilio/voicemail-fallback', validateTwilio, async (req, res) => {
    try {
      const inboundCallSid = req.query.inboundCallSid as string;
      const recordingUrl = req.body.RecordingUrl as string;

      console.log(`[Webhook] Fallback voicemail received. CallSid: ${inboundCallSid}, URL: ${recordingUrl}`);

      if (inboundCallSid && recordingUrl) {
        const adminFork = em.fork();
        const callSession = await adminFork.findOne(CallSession, { callSid: inboundCallSid }, { populate: ['tenant'] as any });
        
        if (callSession) {
          const tenantId = callSession.tenant.id;
          await tenantLocalStorage.run({ tenantId }, async () => {
            await runInTenantTransaction(em, async (txEm) => {
              const { Message } = await import('../domain/entities/Message.js');
              // Create or update a message with the recordingUrl
              const msgEntity = Message.create(callSession.tenant, callSession, 'Fallback standard voicemail recording');
              msgEntity.updateRecordingUrl(recordingUrl);
              txEm.persist(msgEntity);
              await txEm.flush();
              console.log(`[Webhook] Saved fallback recording URL to Message entity.`);
            });
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
      res.status(500).send('Internal server error processing voicemail fallback.');
    }
  });

  return router;"""

content = content.replace('  return router;', fallback_endpoint)

with open('src/routes/webhooks.ts', 'w') as f:
    f.write(content)

print("Patched webhooks.ts.")
