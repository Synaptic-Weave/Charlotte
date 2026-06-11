import re

with open('src/routes/streams.ts', 'r') as f:
    content = f.read()

# 1. Add connection variables
content = content.replace(
    'let outboundTransferCallSid: string | null = null;',
    'let outboundTransferCallSid: string | null = null;\n    let isResumed = false;\n    let callerNameForResume = "someone";'
)

# 2. Extract resumed flag
content = content.replace(
    'tenantId = customParams.tenantId;',
    'tenantId = customParams.tenantId;\n            isResumed = customParams.resumed === "true";'
)

# 3. Handle isResumed logic for CallSession greeting appending
old_call_session_block = """                if (callSession) {
                  callSession.updateStreamSid(streamSid!);
                  callSession.updateStatus('active');

                  // Manually append the welcome greeting to the database transcript immediately
                  const greetingText = `Hello, thanks for calling ${activeTenant.name}, how can I assist you?`;
                  const greetingMsg = {
                    id: `msg-greet-${Date.now()}`,
                    speaker: 'charlotte' as const,
                    text: greetingText,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  };
                  callSession.addMessage(greetingMsg);

                  txEm.persist(callSession);"""

new_call_session_block = """                if (callSession) {
                  callSession.updateStreamSid(streamSid!);
                  callSession.updateStatus('active');
                  callerNameForResume = callSession.callerName || 'someone';

                  if (!isResumed) {
                    // Manually append the welcome greeting to the database transcript immediately
                    const greetingText = `Hello, thanks for calling ${activeTenant.name}, how can I assist you?`;
                    const greetingMsg = {
                      id: `msg-greet-${Date.now()}`,
                      speaker: 'charlotte' as const,
                      text: greetingText,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    };
                    callSession.addMessage(greetingMsg);
                  }

                  txEm.persist(callSession);"""

content = content.replace(old_call_session_block, new_call_session_block)

# 4. Add save_message tool schema
old_tool = """                          {
                            name: 'query_crm',"""

new_tool = """                          {
                            name: 'save_message',
                            description: 'Save a conversational message from the caller if a transfer fails or they want to leave a message.',
                            parameters: {
                              type: 'OBJECT' as any,
                              properties: {
                                summary: {
                                  type: 'STRING' as any,
                                  description: 'The summary or content of the message to save.',
                                },
                              },
                              required: ['summary'],
                            },
                          },
                          {
                            name: 'query_crm',"""

content = content.replace(old_tool, new_tool)

# 5. Handle save_message tool call execution
old_handler = """                            } else if (fn.name === 'book_appointment') {"""

new_handler = """                            } else if (fn.name === 'save_message') {
                              const { summary } = fn.args as { summary: string };
                              console.log(`[Tool Call] Model triggered save_message with summary: ${summary}`);
                              
                              let saveResponse = 'Failed to save message.';
                              try {
                                await tenantLocalStorage.run({ tenantId: tenantId! }, async () => {
                                  await runInTenantTransaction(em, async (txEm) => {
                                    const callSession = await txEm.findOne(CallSession, { callSid });
                                    if (callSession && activeTenant) {
                                      const { Message } = await import('../domain/entities/Message.js');
                                      const msgEntity = Message.create(activeTenant, callSession, summary);
                                      txEm.persist(msgEntity);
                                      await txEm.flush();
                                      saveResponse = 'Message successfully saved. You can let the user know and then say goodbye.';
                                    }
                                  });
                                });
                              } catch (err) {
                                console.error('[Tool Call] Error saving message:', err);
                              }

                              await geminiSession.sendToolResponse({
                                functionResponses: [
                                  {
                                    name: 'save_message',
                                    id: fn.id,
                                    response: {
                                      status: 'success',
                                      message: saveResponse,
                                    },
                                  },
                                ],
                              });
                            } else if (fn.name === 'book_appointment') {"""

content = content.replace(old_handler, new_handler)

# 6. Inject the resumed prompt text
old_trigger = """                console.log('[Gemini] Connected to Live Voice API. Triggering initial greeting.');
                try {
                  await geminiSession.sendRealtimeInput({
                    text: "Start the conversation with your greeting."
                  });"""

new_trigger = """                console.log('[Gemini] Connected to Live Voice API. Triggering initial greeting.');
                try {
                  const initialPrompt = isResumed 
                    ? `The transfer failed. The caller's name is ${callerNameForResume}. Immediately apologize, tell them no one is available, and ask if you can take a message. Do not wait for them to speak first.`
                    : "Start the conversation with your greeting.";
                  await geminiSession.sendRealtimeInput({
                    text: initialPrompt
                  });"""

content = content.replace(old_trigger, new_trigger)

with open('src/routes/streams.ts', 'w') as f:
    f.write(content)

print("Patching streams.ts completed.")
