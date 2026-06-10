import { WebSocket, WebSocketServer, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { EntityManager } from '@mikro-orm/postgresql';
import twilio from 'twilio';
// Uses the Google GenAI SDK directly for Gemini Live voice streaming.
// TODO: migrate to @google/adk once ADK supports real-time audio bidirectional streaming.
import { GoogleGenAI } from '@google/genai';
import jwt from 'jsonwebtoken';
import { Tenant } from '../domain/entities/Tenant.js';
import { CallSession } from '../domain/entities/CallSession.js';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';
import { transcodeTwilioToGemini, transcodeGeminiToTwilio, downsample24kHzTo8kHzWithCarryover, encodeMuLawBuffer } from '../services/transcoder.js';

// Setup Twilio Client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = accountSid && authToken && !accountSid.startsWith('ACXX');
const twilioClient = isTwilioConfigured ? twilio(accountSid, authToken) : null;

// Setup Google GenAI Client
const geminiApiKey = process.env.GEMINI_API_KEY;
const hasGeminiKey = geminiApiKey && !geminiApiKey.startsWith('AIzaSyMock');
const ai = hasGeminiKey ? new GoogleGenAI({ apiKey: geminiApiKey, httpOptions: { apiVersion: 'v1alpha' } }) : null;

const JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

export interface DashboardClient {
  ws: WebSocket;
  tenantId: string;
}

export const dashboardClients = new Set<DashboardClient>();

export function broadcastDashboardUpdate(tenantId: string, payload: any): void {
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

export function registerStreamHandler(wss: WebSocketServer, em: EntityManager): void {
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
    let geminiSession: any = null;
    let activeTenant: Tenant | null = null;
    let dialedNumber: string | null = null;
    let leftoverSamples: Int16Array = new Int16Array(0);
    let outboundTransferCallSid: string | null = null;

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
              await runInTenantTransaction(em, async (txEm) => {
                // Fetch tenant info
                activeTenant = await txEm.findOne(Tenant, { id: tenantId } as any);
                if (!activeTenant) {
                  throw new Error(`Tenant with ID ${tenantId} not found.`);
                }

                // Fetch dialed phone number for the tenant as fallback
                if (!dialedNumber) {
                  const phoneRecord = await txEm.findOne(TwilioPhoneNumber, { tenant: activeTenant });
                  if (phoneRecord) {
                    dialedNumber = phoneRecord.phoneNumber;
                    console.log(`[Twilio Stream] Resolved dialed phone number from DB fallback: ${dialedNumber}`);
                  }
                } else {
                  console.log(`[Twilio Stream] Using dialed phone number from custom parameters: ${dialedNumber}`);
                }

                // Retrieve and update CallSession status
                const callSession = await txEm.findOne(CallSession, { callSid });
                if (callSession) {
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

                  txEm.persist(callSession);
                  await txEm.flush();
                  console.log(`[Twilio Stream] Updated CallSession ${callSession.id} state to "active" and appended welcome greeting.`);
                  broadcastDashboardUpdate(tenantId!, { event: 'calls_updated' });
                } else {
                  console.error(`[Twilio Stream] CallSession with CallSid ${callSid} not found in database.`);
                }
              });
            });

            if (!activeTenant) {
              ws.close(4001, 'Tenant resolution failed');
              return;
            }

            console.log(`[Twilio Stream] Bidirectional audio bridge initiated for Tenant: ${activeTenant.name}`);

            if (ai) {
              // Connect to Google Gemini Multimodal Live Voice API
              const model = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash';
              console.log(`[Gemini] Connecting to Gemini Live model: ${model}`);

              try {
                geminiSession = await ai.live.connect({
                  model,
                  config: {
                    responseModalities: ['AUDIO'] as any,
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: {
                          voiceName: 'Aoede', // Puck, Charon, Kore, Fenrir, Aoede
                        },
                      },
                    },
                    systemInstruction: {
                      parts: [
                        {
                          text: `You are Charlotte, the professional, friendly, and efficient AI-powered virtual receptionist for ${activeTenant.name}.
When the conversation starts, you MUST pause for 1 second, then answer the phone by saying exactly: 'Hello, thanks for calling ${activeTenant.name}, how can I assist you?'
Your job is to answer the caller's questions with brief, direct, and conversational responses suitable for a real-time telephone conversation.
If the caller asks to be connected, transferred, or routed to a specific department (such as Sales, Support, Billing, or a human agent), you MUST immediately call the 'routeCall' tool with the destination.
Never tell the caller to call another number or try another way; always use the 'routeCall' tool when routing is requested.`,
                        },
                      ],
                    },
                    tools: [
                      {
                        functionDeclarations: [
                          {
                            name: 'routeCall',
                            description: 'Route or transfer the call to a specific department or human agent.',
                            parameters: {
                              type: 'OBJECT' as any,
                              properties: {
                                department: {
                                  type: 'STRING' as any,
                                  description: 'The name of the department or human agent to transfer the call to (e.g. Sales, Support, Billing, Front Desk, or a specific employee name).',
                                },
                              },
                              required: ['department'],
                            },
                          },
                        ],
                      },
                    ],
                  },
                  callbacks: {
                    onmessage: async (serverMsg: any) => {
                      try {
                        // Handle real-time audio transcriptions
                        const inputTx = serverMsg.serverContent?.inputTranscription;
                        if (inputTx && inputTx.text && tenantId && callSid) {
                          const userText = inputTx.text.trim();
                          if (userText) {
                            console.log(`[Twilio Stream] User Transcription: ${userText}`);
                            await tenantLocalStorage.run({ tenantId }, async () => {
                              await runInTenantTransaction(em, async (txEm) => {
                                const callSession = await txEm.findOne(CallSession, { callSid });
                                if (callSession) {
                                  const lastMsg = callSession.messages && callSession.messages.length > 0
                                    ? callSession.messages[callSession.messages.length - 1]
                                    : null;

                                  if (lastMsg && lastMsg.speaker === 'caller') {
                                    lastMsg.text = `${lastMsg.text} ${userText}`.trim();
                                    callSession.messages = [...callSession.messages];
                                    callSession.updatedAt = new Date();
                                  } else {
                                    const newMsg = {
                                      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                      speaker: 'caller' as const,
                                      text: userText,
                                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                                    };
                                    callSession.addMessage(newMsg);
                                  }

                                  txEm.persist(callSession);
                                  await txEm.flush();
                                  console.log(`[Twilio Stream] User transcript appended/merged to CallSession ${callSession.id}`);
                                  broadcastDashboardUpdate(tenantId!, { event: 'calls_updated' });
                                }
                              });
                            });
                          }
                        }

                        const outputTx = serverMsg.serverContent?.outputTranscription;
                        if (outputTx && outputTx.text && tenantId && callSid) {
                          const agentText = outputTx.text.trim();
                          if (agentText) {
                            // Check for welcome greeting to deduplicate
                            const isGreeting = agentText.toLowerCase().includes('thanks for calling') &&
                                               agentText.toLowerCase().includes('how can i assist');
                            if (isGreeting) {
                              console.log(`[Twilio Stream] Ignoring streaming agent greeting to avoid duplication: "${agentText}"`);
                            } else {
                              console.log(`[Twilio Stream] Agent Transcription: ${agentText}`);
                              await tenantLocalStorage.run({ tenantId }, async () => {
                                await runInTenantTransaction(em, async (txEm) => {
                                  const callSession = await txEm.findOne(CallSession, { callSid });
                                  if (callSession) {
                                    const lastMsg = callSession.messages && callSession.messages.length > 0
                                      ? callSession.messages[callSession.messages.length - 1]
                                      : null;

                                    if (lastMsg && lastMsg.speaker === 'charlotte') {
                                      lastMsg.text = `${lastMsg.text} ${agentText}`.trim();
                                      callSession.messages = [...callSession.messages];
                                      callSession.updatedAt = new Date();
                                    } else {
                                      const newMsg = {
                                        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                        speaker: 'charlotte' as const,
                                        text: agentText,
                                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                                      };
                                      callSession.addMessage(newMsg);
                                    }

                                    txEm.persist(callSession);
                                    await txEm.flush();
                                    console.log(`[Twilio Stream] Agent transcript appended/merged to CallSession ${callSession.id}`);
                                    broadcastDashboardUpdate(tenantId!, { event: 'calls_updated' });
                                  }
                                });
                              });
                            }
                          }
                        }

                        // 1. Handle incoming model audio stream response
                        const parts = serverMsg.serverContent?.modelTurn?.parts;
                        if (parts) {
                          for (const part of parts) {
                            if (part.inlineData && part.inlineData.data) {
                              const pcm24kHzBase64 = part.inlineData.data;
                              const pcmBuffer = Buffer.from(pcm24kHzBase64, 'base64');
                              const sampleCount = Math.floor(pcmBuffer.length / 2);
                              const pcm24kHz = new Int16Array(sampleCount);

                              for (let i = 0; i < sampleCount; i++) {
                                pcm24kHz[i] = pcmBuffer.readInt16LE(i * 2);
                              }

                              const { downsampled, carryover } = downsample24kHzTo8kHzWithCarryover(
                                pcm24kHz,
                                leftoverSamples
                              );
                              leftoverSamples = carryover;

                              const muLawBuffer = encodeMuLawBuffer(downsampled);
                              const twilioPayload = muLawBuffer.toString('base64');

                              // Send media packet back to Twilio
                              ws.send(
                                JSON.stringify({
                                  event: 'media',
                                  streamSid,
                                  media: {
                                    payload: twilioPayload,
                                  },
                                })
                              );
                            }
                          }
                        }

                        // 2. Handle barge-in/interruption (VAD)
                        if (serverMsg.serverContent?.interrupted) {
                          console.log('[Gemini] User interrupted receptionist. Purging Twilio queue.');
                          // Send "clear" event to Twilio to purge its current output audio buffer
                          ws.send(
                            JSON.stringify({
                              event: 'clear',
                              streamSid,
                            })
                          );
                        }

                        // 3. Handle tool/function calls from the model
                        const functionCalls = serverMsg.toolCall?.functionCalls;
                        if (functionCalls) {
                          for (const fn of functionCalls) {
                            if (fn.name === 'routeCall') {
                              const { department } = fn.args as { department: string };
                              console.log(`[Tool Call] Model triggered routeCall to: ${department}`);

                              // Acknowledge tool execution back to Gemini
                              await geminiSession.sendToolResponse({
                                functionResponses: [
                                  {
                                    name: 'routeCall',
                                    id: fn.id,
                                    response: {
                                      status: 'success',
                                      message: `Successfully transferring call to ${department}.`,
                                    },
                                  },
                                ],
                              });

                              // Execute the warm transfer via Twilio REST API
                              if (twilioClient && callSid && activeTenant) {
                                try {
                                  console.log(`[Twilio REST] Putting inbound caller ${callSid} into conference Conf_${callSid}...`);
                                  const holdMusicUrl = process.env.HOLD_MUSIC_URL || 'https://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestain-MM-MAMBO.mp3';
                                  await twilioClient.calls(callSid).update({
                                    twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Please hold for just a moment while I connect your call to the ${department} department.</Say>
  <Dial>
    <Conference waitUrl="${holdMusicUrl}" startConferenceOnEnter="false" endConferenceOnExit="true">Conf_${callSid}</Conference>
  </Dial>
</Response>`
                                  });

                                  console.log(`[Twilio REST] Initiating outbound transfer call to ${activeTenant.destinationNumber}...`);
                                  const isSecure = req.headers['x-forwarded-proto'] === 'https';
                                  const protocol = isSecure ? 'https' : 'http';
                                  const apiBaseUrl = process.env.CHARLOTTE_API_BASE_URL || `${protocol}://${req.headers.host}`;
                                  const fromNumber = dialedNumber || (activeTenant as any).phoneNumber || process.env.TWILIO_FROM_NUMBER || '';

                                  const outboundCall = await twilioClient.calls.create({
                                    to: activeTenant.destinationNumber,
                                    from: fromNumber,
                                    url: `${apiBaseUrl}/api/webhook/twilio/transfer-whisper?inboundCallSid=${callSid}&department=${encodeURIComponent(department)}&tenantId=${tenantId}`
                                  });
                                  
                                  outboundTransferCallSid = outboundCall.sid;


                                  console.log(`[Twilio REST] Outbound transfer call initiated successfully.`);
                                } catch (err) {
                                  console.error('[Twilio REST] Failed to perform warm transfer:', err);
                                }
                              } else {
                                console.log(`[Twilio Mock] Warm transfer for Call ${callSid} to ${activeTenant?.destinationNumber || 'destination'} requested (mock mode).`);
                              }
                            }
                          }
                        }
                      } catch (err) {
                        console.error('[Gemini] Error handling message:', err);
                      }
                    },
                    onerror: (err: any) => {
                      console.error('[Gemini] WebSocket error:', err);
                    },
                    onclose: (e: any) => {
                      console.log('[Gemini] Connection closed:', e);
                    },
                  },
                });

                console.log('[Gemini] Connected to Live Voice API. Triggering initial greeting.');
                try {
                  await geminiSession.sendRealtimeInput({
                    text: "Start the conversation with your greeting."
                  });
                } catch (err) {
                  console.error('[Gemini] Failed to send initial greeting trigger:', err);
                }
              } catch (err) {
                console.error('[Gemini] Failed to open live connection:', err);
              }
            } else {
              console.log('[Gemini Mock] Running in voice receptionist sandbox mode (No Gemini API Key set).');
              // Setup a simple sandbox voice greet interval for testing
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  console.log('[Gemini Mock] Sending sandbox greeting audio...');
                  // We send a tiny silent or mock audio packet to confirm websocket stream communication is working
                  const mockData = Buffer.alloc(160, 0x7F).toString('base64');
                  ws.send(
                    JSON.stringify({
                      event: 'media',
                      streamSid,
                      media: {
                        payload: mockData,
                      },
                    })
                  );
                }
              }, 1000);
            }
            break;
          }

          case 'media': {
            // Forward voice stream packets to Google Gemini Live Voice API
            if (geminiSession) {
              const base64MuLaw = msg.media.payload;
              const geminiPayload = transcodeTwilioToGemini(base64MuLaw);

              await geminiSession.sendRealtimeInput({
                audio: {
                  data: geminiPayload,
                  mimeType: 'audio/pcm;rate=16000',
                },
              });
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

      // Terminate outbound transfer call if it exists
      if (outboundTransferCallSid && twilioClient) {
        try {
          console.log(`[Twilio REST] Inbound dropped, terminating active outbound transfer call ${outboundTransferCallSid}...`);
          await twilioClient.calls(outboundTransferCallSid).update({ status: 'completed' });
        } catch (err) {
          console.error(`[Twilio REST] Failed to terminate outbound call:`, err);
        }
      }

      // Clean up Gemini Live connection
      if (geminiSession) {
        try {
          console.log('[Gemini] Closing Live API session.');
          geminiSession.close();
        } catch (err) {
          console.error('[Gemini] Error closing session:', err);
        }
      }

      // Update CallSession to completed/failed state
      if (callSid && tenantId) {
        try {
          await tenantLocalStorage.run({ tenantId }, async () => {
            await runInTenantTransaction(em, async (txEm) => {
              const callSession = await txEm.findOne(CallSession, { callSid });
              if (callSession && callSession.status === 'active') {
                callSession.updateStatus('completed');
                txEm.persist(callSession);
                await txEm.flush();
                console.log(`[Twilio Stream] Updated CallSession ${callSession.id} state to "completed".`);
                broadcastDashboardUpdate(tenantId!, { event: 'calls_updated' });
              }
            });
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
