import { WebSocket } from 'ws';
import twilio from 'twilio';
import { GoogleGenAI, LiveServerMessage, Session, Type } from '@google/genai';
import { Tenant } from '../domain/entities/Tenant.js';
import { CallSessionService } from './CallSessionService.js';
import { VoiceToolService } from './VoiceToolService.js';
import { AppointmentService } from './AppointmentService.js';
import { CustomerService } from './CustomerService.js';
import { downsample24kHzTo8kHzWithCarryover, encodeMuLawBuffer, transcodeTwilioToGemini } from './transcoder.js';
import { tenantLocalStorage } from '../db/context.js';
import { broadcastDashboardUpdate } from '../routes/streams.js';

export class GeminiStreamService {
  private geminiSession: Session | null = null;
  private leftoverSamples: Int16Array = new Int16Array(0);
  private ai: GoogleGenAI | null;
  public isTransferring = false;
  public outboundTransferCallSid: string | null = null;

  constructor(
    private ws: WebSocket,
    private streamSid: string,
    private callSid: string,
    private tenantId: string,
    private activeTenant: Tenant,
    private dialedNumber: string | null,
    private twilioClient: twilio.Twilio | null,
    private callSessionSvc: CallSessionService,
    private voiceToolSvc: VoiceToolService,
    private appointmentSvc: AppointmentService,
    private customerSvc: CustomerService,
    private apiBaseUrl: string
  ) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    this.ai = geminiApiKey && !geminiApiKey.startsWith('AIzaSyMock') 
      ? new GoogleGenAI({ apiKey: geminiApiKey, httpOptions: { apiVersion: 'v1alpha' } }) 
      : null;
  }

  async start() {
    if (this.ai) {
      const model = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash';
      console.log(`[Gemini] Connecting to Gemini Live model: ${model}`);

      try {
        this.geminiSession = await this.ai.live.connect({
          model,
          config: {
            responseModalities: ['AUDIO' as any],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Aoede',
                },
              },
            },
            systemInstruction: {
              parts: [
                {
                  text: `You are Charlotte, the professional, friendly, and efficient AI-powered virtual receptionist for ${this.activeTenant.name}.
When the conversation starts, you MUST pause for 1 second, then answer the phone by saying exactly: 'Hello, thanks for calling ${this.activeTenant.name}, how can I assist you?'
Your job is to answer the caller's questions with brief, direct, and conversational responses suitable for a real-time telephone conversation.
If the caller asks to be connected, transferred, or routed to a specific department (such as Sales, Support, Billing, or a human agent), you MUST immediately call the 'transfer_call' tool with the destination.
Never tell the caller to call another number or try another way; always use the 'transfer_call' tool when routing is requested.`,
                },
              ],
            },
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'transfer_call',
                    description: 'Route or transfer the call to a specific department or human agent.',
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        department: {
                          type: Type.STRING,
                          description: 'The name of the department or human agent to transfer the call to (e.g. Sales, Support, Billing, Front Desk, or a specific employee name).',
                        },
                      },
                      required: ['department'],
                    },
                  },
                  {
                    name: 'query_crm',
                    description: 'Query the CRM for customer context using their phone number.',
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        phoneNumber: {
                          type: Type.STRING,
                          description: 'The phone number of the customer to look up. It should include the country code (e.g. +1).',
                        },
                      },
                      required: ['phoneNumber'],
                    },
                  },
                  {
                    name: 'book_appointment',
                    description: 'Book an appointment for a caller.',
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        customerId: {
                          type: Type.STRING,
                          description: 'The UUID of the customer. You must query_crm first to get this.',
                        },
                        departmentName: {
                          type: Type.STRING,
                          description: 'The name of the department.',
                        },
                        dateString: {
                          type: Type.STRING,
                          description: 'The appointment date and time in ISO 8601 format.',
                        },
                      },
                      required: ['customerId', 'departmentName', 'dateString'],
                    },
                  },
                  {
                    name: 'list_calendar_events',
                    description: 'List upcoming events from the Google Calendar to find free timeslots. Appointments are 60 minutes long, with a 15 minute buffer.',
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        timeMin: {
                          type: Type.STRING,
                          description: 'The start date and time in ISO 8601 format.',
                        },
                        timeMax: {
                          type: Type.STRING,
                          description: 'The end date and time in ISO 8601 format.',
                        },
                      },
                      required: ['timeMin', 'timeMax'],
                    },
                  },
                ],
              },
            ],
          },
          callbacks: {
            onmessage: async (serverMsg: LiveServerMessage) => this.handleMessage(serverMsg),
            onerror: (err: unknown) => {
              console.error('[Gemini] WebSocket error:', err);
            },
            onclose: (e: unknown) => {
              console.log('[Gemini] Connection closed:', e);
            },
          },
        });

        console.log('[Gemini] Connected to Live Voice API. Triggering initial greeting.');
        try {
          if (this.geminiSession) {
            await this.geminiSession.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: "Start the conversation with your greeting." }] }],
              turnComplete: true
            });
          }
        } catch (err) {
          console.error('[Gemini] Failed to send initial greeting trigger:', err);
        }
      } catch (err) {
        console.error('[Gemini] Failed to open live connection:', err);
      }
    } else {
      console.log('[Gemini Mock] Running in voice receptionist sandbox mode (No Gemini API Key set).');
      setTimeout(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          console.log('[Gemini Mock] Sending sandbox greeting audio...');
          const mockData = Buffer.alloc(160, 0x7F).toString('base64');
          this.ws.send(
            JSON.stringify({
              event: 'media',
              streamSid: this.streamSid,
              media: {
                payload: mockData,
              },
            })
          );
        }
      }, 1000);
    }
  }

  private async handleMessage(serverMsg: LiveServerMessage) {
    try {
      const inputTx = serverMsg.serverContent?.inputTranscription;
      if (inputTx && inputTx.text && this.tenantId && this.callSid) {
        const userText = inputTx.text.trim();
        if (userText) {
          console.log(`[Twilio Stream] User Transcription: ${userText}`);
          await tenantLocalStorage.run({ tenantId: this.tenantId }, async () => {
            await this.callSessionSvc.addMessageToSession(this.callSid, 'caller', userText);
          });
          console.log(`[Twilio Stream] User transcript appended/merged to CallSession ${this.callSid}`);
          broadcastDashboardUpdate(this.tenantId, { event: 'calls_updated' });
        }
      }

      const outputTx = serverMsg.serverContent?.outputTranscription;
      if (outputTx && outputTx.text && this.tenantId && this.callSid) {
        const agentText = outputTx.text.trim();
        if (agentText) {
          const isGreeting = agentText.toLowerCase().includes('thanks for calling') &&
                             agentText.toLowerCase().includes('how can i assist');
          if (isGreeting) {
            console.log(`[Twilio Stream] Ignoring streaming agent greeting to avoid duplication: "${agentText}"`);
          } else {
            console.log(`[Twilio Stream] Agent Transcription: ${agentText}`);
            await tenantLocalStorage.run({ tenantId: this.tenantId }, async () => {
              await this.callSessionSvc.addMessageToSession(this.callSid, 'charlotte', agentText);
            });
            console.log(`[Twilio Stream] Agent transcript appended/merged to CallSession ${this.callSid}`);
            broadcastDashboardUpdate(this.tenantId, { event: 'calls_updated' });
          }
        }
      }

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
              this.leftoverSamples
            );
            this.leftoverSamples = carryover;

            const muLawBuffer = encodeMuLawBuffer(downsampled);
            const twilioPayload = muLawBuffer.toString('base64');

            this.ws.send(
              JSON.stringify({
                event: 'media',
                streamSid: this.streamSid,
                media: {
                  payload: twilioPayload,
                },
              })
            );
          }
        }
      }

      if (serverMsg.serverContent?.interrupted) {
        console.log('[Gemini] User interrupted receptionist. Purging Twilio queue.');
        this.ws.send(
          JSON.stringify({
            event: 'clear',
            streamSid: this.streamSid,
          })
        );
      }

      const toolParts = serverMsg.serverContent?.modelTurn?.parts || [];
      const functionCalls = toolParts.map((p: { functionCall?: unknown }) => p.functionCall).filter(Boolean) as Array<{ name: string; args: Record<string, unknown>; id: string }>;
      if (functionCalls.length > 0) {
        for (const fn of functionCalls) {
          await this.handleToolCall(fn);
        }
      }
    } catch (err) {
      console.error('[Gemini] Error handling message:', err);
    }
  }

  private async handleToolCall(fn: { name: string; args: Record<string, unknown>; id: string }) {
    if (fn.name === 'transfer_call') {
      const { department } = fn.args as { department: string };
      console.log(`[Tool Call] Model triggered transfer_call to: ${department}`);
      this.isTransferring = true;

      if (this.geminiSession) {
        await this.geminiSession.sendToolResponse({
          functionResponses: [
            {
              name: 'transfer_call',
              id: fn.id,
              response: {
                status: 'success',
                message: `Successfully transferring call to ${department}.`,
              },
            },
          ],
        });
      }

      if (this.twilioClient && this.callSid && this.activeTenant) {
        try {
          let targetNumber = this.activeTenant.destinationNumber;
          try {
            const routingNumber = await this.voiceToolSvc.lookupDepartmentRoutingNumber(this.tenantId, department);
            if (routingNumber) {
              targetNumber = routingNumber;
              console.log(`[Routing] Found department specific routing number: ${targetNumber}`);
            }
          } catch (err) {
            console.error('[Routing] Error looking up department routing number:', err);
          }

          console.log(`[Twilio REST] Putting inbound caller ${this.callSid} into conference Conf_${this.callSid}...`);
          const holdMusicUrl = process.env.HOLD_MUSIC_URL || 'http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3';
          await this.twilioClient.calls(this.callSid).update({
            twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">One moment while I connect you to ${department}.</Say>
  <Dial>
    <Conference waitUrl="${holdMusicUrl}" startConferenceOnEnter="false" endConferenceOnExit="true">Conf_${this.callSid}</Conference>
  </Dial>
</Response>`
          });

          console.log(`[Twilio REST] Initiating outbound transfer call to ${targetNumber}...`);
          const fromNumber = this.dialedNumber || process.env.TWILIO_FROM_NUMBER || '';

          if (targetNumber.startsWith('sip:')) {
            const outboundTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${targetNumber}</Sip>
  </Dial>
</Response>`;
            const outboundCall = await this.twilioClient.calls.create({
              twiml: outboundTwiml,
              to: targetNumber,
              from: fromNumber
            });
            this.outboundTransferCallSid = outboundCall.sid;
            console.log(`[Twilio REST] Outbound SIP transfer call initiated successfully.`);
          } else {
            const outboundCall = await this.twilioClient.calls.create({
              to: targetNumber,
              from: fromNumber,
              url: `${this.apiBaseUrl}/api/webhook/twilio/transfer-whisper?inboundCallSid=${this.callSid}&department=${encodeURIComponent(department)}&tenantId=${this.tenantId}`
            });
            this.outboundTransferCallSid = outboundCall.sid;
            console.log(`[Twilio REST] Outbound transfer call initiated successfully.`);
          }
        } catch (err) {
          console.error('[Twilio REST] Failed to perform warm transfer:', err);
        }
      } else {
        console.log(`[Twilio Mock] Warm transfer for Call ${this.callSid} to ${this.activeTenant?.destinationNumber || 'destination'} requested (mock mode).`);
      }
    } else if (fn.name === 'query_crm') {
      const { phoneNumber } = fn.args as { phoneNumber: string };
      console.log(`[Tool Call] Model triggered query_crm for: ${phoneNumber}`);
      
      let crmResponse = 'No customer found with that phone number.';
      try {
        await tenantLocalStorage.run({ tenantId: this.tenantId }, async () => {
          const customer = await this.customerSvc.findByPhoneNumber(phoneNumber);
          if (customer) {
            crmResponse = `Customer found: ID: ${customer.id}, Name: ${customer.name}. Context: ${customer.context || 'None'}`;
          }
        });
      } catch (err) {
        console.error('[Tool Call] Error executing query_crm:', err);
        crmResponse = 'Error occurred while querying the CRM.';
      }

      if (this.geminiSession) {
        await this.geminiSession.sendToolResponse({
          functionResponses: [
            {
              name: 'query_crm',
              id: fn.id,
              response: {
                status: 'success',
                message: crmResponse,
              },
            },
          ],
        });
      }
    } else if (fn.name === 'list_calendar_events') {
      const { timeMin, timeMax } = fn.args as { timeMin: string; timeMax: string };
      console.log(`[Tool Call] Model triggered list_calendar_events: ${timeMin} to ${timeMax}`);
      let calResponse = '';
      try {
        const events = await this.voiceToolSvc.listCalendarEvents(this.tenantId, timeMin, timeMax) as Array<{ start?: { dateTime?: string, date?: string }, end?: { dateTime?: string, date?: string } }>;
        calResponse = JSON.stringify(events.map(e => ({
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          summary: 'Busy'
        })));
      } catch (err: unknown) {
        console.error('[Tool Call] Error executing list_calendar_events:', err);
        calResponse = 'Failed to fetch calendar events.';
      }

      if (this.geminiSession) {
        await this.geminiSession.sendToolResponse({
          functionResponses: [
            {
              name: 'list_calendar_events',
              id: fn.id,
              response: { status: 'success', events: calResponse },
            },
          ],
        });
      }
    } else if (fn.name === 'book_appointment') {
      const { customerId, departmentName, dateString } = fn.args as { customerId: string; departmentName: string; dateString: string };
      console.log(`[Tool Call] Model triggered book_appointment for: ${customerId}, ${departmentName}, ${dateString}`);
      
      let bookResponse = '';
      try {
        await tenantLocalStorage.run({ tenantId: this.tenantId }, async () => {
          const appointment = await this.appointmentSvc.bookAppointment(customerId, departmentName, dateString);
          bookResponse = `Appointment successfully booked for ${appointment.date} with ${departmentName}.`;
        });
      } catch (err: unknown) {
        console.error('[Tool Call] Error executing book_appointment:', err);
        bookResponse = `Failed to book appointment: ${err instanceof Error ? err.message : String(err)}. Please ask for a new time.`;
      }

      if (this.geminiSession) {
        await this.geminiSession.sendToolResponse({
          functionResponses: [
            {
              name: 'book_appointment',
              id: fn.id,
              response: {
                status: 'success',
                message: bookResponse,
              },
            },
          ],
        });
      }
    }
  }

  async processMedia(base64MuLaw: string) {
    if (this.geminiSession) {
      const geminiPayload = transcodeTwilioToGemini(base64MuLaw);
      await this.geminiSession.sendRealtimeInput([{
        audio: {
          data: geminiPayload,
          mimeType: 'audio/pcm;rate=16000',
        },
      }] as any);
    }
  }

  close() {
    if (this.geminiSession) {
      try {
        console.log('[Gemini] Closing Live API session.');
        this.geminiSession.close();
      } catch (err) {
        console.error('[Gemini] Error closing session:', err);
      }
    }
  }
}
