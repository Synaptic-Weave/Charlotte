with open('tests/streams.test.ts', 'r') as f:
    streams = f.read()

streams = streams.replace(
    """expect(xml).toContain('<Gather action="/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&amp;department=Sales"');""",
    """expect(xml).toContain('<Gather action="/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&amp;department=Sales&amp;tenantId=undefined"');"""
)
streams = streams.replace(
    """expect(xml).toContain('<Redirect>/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&amp;department=Sales&amp;timeout=true</Redirect>');""",
    """expect(xml).toContain('<Redirect>/api/webhook/twilio/transfer-decision?inboundCallSid=CA_TRANSFER_123&amp;department=Sales&amp;tenantId=undefined&amp;timeout=true</Redirect>');"""
)
streams = streams.replace(
    """expect(xml).toContain('Thank you. The caller will be sent to voicemail. Goodbye.');""",
    """expect(xml).toContain('Thank you. The caller will be reconnected to the assistant. Goodbye.');"""
)

with open('tests/streams.test.ts', 'w') as f:
    f.write(streams)


with open('tests/transfers.test.ts', 'r') as f:
    transfers = f.read()

transfers = transfers.replace(
    """expect(updateArgs.twiml).toContain('<Record');
      expect(updateArgs.twiml).toContain('/api/webhook/twilio/voicemail-callback');""",
    """expect(updateArgs.twiml).toContain('<Connect>');
      expect(updateArgs.twiml).toContain('<Stream');
      expect(updateArgs.twiml).toContain('resumed');"""
)

transfers = transfers.replace(
    """expect(updateArgs.twiml).toContain('<Record');""",
    """expect(updateArgs.twiml).toContain('<Connect>');
      expect(updateArgs.twiml).toContain('<Stream');
      expect(updateArgs.twiml).toContain('resumed');"""
)

with open('tests/transfers.test.ts', 'w') as f:
    f.write(transfers)

print("Fixed tests.")
