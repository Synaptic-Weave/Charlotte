 
process.env.GEMINI_API_KEY = 'real-key';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { CallSessionService } from '../src/services/CallSessionService.js';
import { VoiceToolService } from '../src/services/VoiceToolService.js';
import { CustomerService } from '../src/services/CustomerService.js';
import { AppointmentService } from '../src/services/AppointmentService.js';

const { mockSendToolResponse, mockConnect } = vi.hoisted(() => {
  const mockSendToolResponse = vi.fn();
  const mockConnect: unknown = vi.fn().mockImplementation((config) => {
    mockConnect.config = config;
    return Promise.resolve({
      sendToolResponse: mockSendToolResponse,
      sendClientContent: vi.fn(),
      close: vi.fn()
    });
  });
  return { mockSendToolResponse, mockConnect };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    live: {
      connect: mockConnect
    }
  })),
  Type: {
    STRING: 'string',
    OBJECT: 'object',
    ARRAY: 'array',
    BOOLEAN: 'boolean',
    NUMBER: 'number'
  }
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn()
      }))
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        list: vi.fn().mockResolvedValue({ data: { items: [] } })
      }
    })
  }
}));

vi.mock('../src/db/context.js', () => ({
  tenantLocalStorage: {
    run: vi.fn((ctx, cb) => cb())
  },
  runInTenantTransaction: vi.fn(async (em, cb) => cb(em.fork()))
}));

const mockFindByPhoneNumber = vi.fn().mockResolvedValue({ id: 'cust-1', name: 'John Doe', context: 'VIP' });
const mockCustomerServiceConstructor = vi.fn();

vi.mock('../src/services/CustomerService.js', () => ({
  CustomerService: class {
    constructor(em: unknown) {
      mockCustomerServiceConstructor(em);
    }
    findByPhoneNumber = mockFindByPhoneNumber;
  }
}));

const mockBookAppointment = vi.fn().mockResolvedValue({ date: '2026-06-12T10:00:00Z' });
const mockAppointmentServiceConstructor = vi.fn();

vi.mock('../src/services/AppointmentService.js', () => ({
  AppointmentService: class {
    constructor(em: unknown) {
      mockAppointmentServiceConstructor(em);
    }
    bookAppointment = mockBookAppointment;
  }
}));

describe('Streams Route - Tool Calls', () => {
  let mockEm: unknown;
  let mockFork: unknown;
  let mockWsServer: EventEmitter;
  let registerStreamHandler: unknown;
  let callSessionService: CallSessionService;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'real-key'; // to pass hasGeminiKey check
    const mod = await import('../src/routes/streams.js');
    registerStreamHandler = mod.registerStreamHandler;
    
    const mockFindOne = vi.fn().mockImplementation((entity: unknown) => {
      if (entity.name === 'Tenant') {
        return Promise.resolve({ 
          id: 'test-tenant', 
          name: 'Test',
          googleRefreshToken: 'token', 
          googleCalendarId: 'cal-id' 
        });
      } else if (entity.name === 'CallSession') {
        return Promise.resolve({
          id: 'call-1',
          updateStreamSid: vi.fn(),
          updateStatus: vi.fn(),
          addMessage: vi.fn(),
        });
      }
      return Promise.resolve(null);
    });

    mockFork = {
      findOne: mockFindOne,
      flush: vi.fn(),
      persist: vi.fn()
    };
    
    mockEm = {
      fork: vi.fn().mockReturnValue(mockFork),
      findOne: mockFindOne,
      persist: vi.fn(),
      flush: vi.fn()
    };
    
    mockWsServer = new EventEmitter();
    callSessionService = new CallSessionService(mockEm as never);
  });

  it('should fork EntityManager when handling list_calendar_events tool call', async () => {
    // 1. Register stream handler
    registerStreamHandler(mockWsServer as unknown, callSessionService, new VoiceToolService(mockEm as never), new AppointmentService(mockEm as never), new CustomerService(mockEm as never));

    // 2. Simulate WS connection
    const ws = new EventEmitter() as unknown;
    ws.send = vi.fn();
    ws.close = vi.fn();
    
    mockWsServer.emit('connection', ws, { url: '/api/streams', headers: { host: 'localhost' }, socket: { remoteAddress: '127.0.0.1' } });

    // 3. Send "start" event to trigger AI connection
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: {
        streamSid: 'stream-1',
        callSid: 'call-1',
        customParameters: { tenantId: 'test-tenant' }
      }
    }));
    
    // Wait a tick for promises to resolve
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(mockConnect).toHaveBeenCalled();
    expect(mockConnect.config).toBeDefined();
    
    const onmessage = mockConnect.config.callbacks.onmessage;
    expect(onmessage).toBeDefined();

    // 4. Simulate list_calendar_events tool call from AI
    await onmessage({
      serverContent: {
        modelTurn: {
          parts: [
            {
              functionCall: {
                name: 'list_calendar_events',
                id: 'call-id-123',
                args: { timeMin: '2026-06-12T00:00:00Z', timeMax: '2026-06-13T00:00:00Z' }
              }
            }
          ]
        }
      }
    });

    // 5. Assert em.fork() was called
    expect(mockEm.fork).toHaveBeenCalled();
    expect(mockFork.findOne).toHaveBeenCalledWith(expect.anything(), { id: 'test-tenant' });
    expect(mockSendToolResponse).toHaveBeenCalled();
  });

  it('should fork EntityManager when handling query_crm tool call', async () => {
    registerStreamHandler(mockWsServer as unknown, callSessionService, new VoiceToolService(mockEm as never), new AppointmentService(mockEm as never), new CustomerService(mockEm as never));

    const ws = new EventEmitter() as unknown;
    ws.send = vi.fn();
    ws.close = vi.fn();
    
    mockWsServer.emit('connection', ws, { url: '/api/streams', headers: { host: 'localhost' }, socket: { remoteAddress: '127.0.0.1' } });

    ws.emit('message', JSON.stringify({
      event: 'start',
      start: {
        streamSid: 'stream-1',
        callSid: 'call-1',
        customParameters: { tenantId: 'test-tenant' }
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const onmessage = mockConnect.config.callbacks.onmessage;

    await onmessage({
      serverContent: {
        modelTurn: {
          parts: [
            {
              functionCall: {
                name: 'query_crm',
                id: 'call-id-124',
                args: { phoneNumber: '+15551234567' }
              }
            }
          ]
        }
      }
    });

    expect(mockFindByPhoneNumber).toHaveBeenCalledWith('+15551234567');
    expect(mockSendToolResponse).toHaveBeenCalled();
  });

  it('should fork EntityManager when handling book_appointment tool call', async () => {
    registerStreamHandler(mockWsServer as unknown, callSessionService, new VoiceToolService(mockEm as never), new AppointmentService(mockEm as never), new CustomerService(mockEm as never));

    const ws = new EventEmitter() as unknown;
    ws.send = vi.fn();
    ws.close = vi.fn();
    
    mockWsServer.emit('connection', ws, { url: '/api/streams', headers: { host: 'localhost' }, socket: { remoteAddress: '127.0.0.1' } });

    ws.emit('message', JSON.stringify({
      event: 'start',
      start: {
        streamSid: 'stream-1',
        callSid: 'call-1',
        customParameters: { tenantId: 'test-tenant' }
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const onmessage = mockConnect.config.callbacks.onmessage;

    await onmessage({
      serverContent: {
        modelTurn: {
          parts: [
            {
              functionCall: {
                name: 'book_appointment',
                id: 'call-id-125',
                args: { customerId: 'cust-1', departmentName: 'Sales', dateString: '2026-06-12T10:00:00Z' }
              }
            }
          ]
        }
      }
    });

    expect(mockBookAppointment).toHaveBeenCalledWith('cust-1', 'Sales', '2026-06-12T10:00:00Z');
    expect(mockSendToolResponse).toHaveBeenCalled();
  });
});
