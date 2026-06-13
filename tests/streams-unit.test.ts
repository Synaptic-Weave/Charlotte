process.env.GEMINI_API_KEY = 'real-key';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockSendToolResponse, mockConnect } = vi.hoisted(() => {
  const mockSendToolResponse = vi.fn();
  const mockConnect: any = vi.fn().mockImplementation((config) => {
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
  }))
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
  runInTenantTransaction: vi.fn(async (em, cb) => cb(em))
}));

const mockFindByPhoneNumber = vi.fn().mockResolvedValue({ id: 'cust-1', name: 'John Doe', context: 'VIP' });
const mockCustomerServiceConstructor = vi.fn();

vi.mock('../src/services/CustomerService.js', () => ({
  CustomerService: class {
    constructor(em: any) {
      mockCustomerServiceConstructor(em);
    }
    findByPhoneNumber = mockFindByPhoneNumber;
  }
}));

const mockBookAppointment = vi.fn().mockResolvedValue({ date: '2026-06-12T10:00:00Z' });
const mockAppointmentServiceConstructor = vi.fn();

vi.mock('../src/services/AppointmentService.js', () => ({
  AppointmentService: class {
    constructor(em: any) {
      mockAppointmentServiceConstructor(em);
    }
    bookAppointment = mockBookAppointment;
  }
}));

describe('Streams Route - Tool Calls', () => {
  let mockEm: any;
  let mockFork: any;
  let mockWsServer: EventEmitter;
  let registerStreamHandler: any;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'real-key'; // to pass hasGeminiKey check
    const mod = await import('../src/routes/streams.js');
    registerStreamHandler = mod.registerStreamHandler;
    
    const mockFindOne = vi.fn().mockImplementation((entity: any) => {
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
  });

  it('should fork EntityManager when handling list_calendar_events tool call', async () => {
    // 1. Register stream handler
    registerStreamHandler(mockWsServer as any, mockEm);

    // 2. Simulate WS connection
    const ws = new EventEmitter() as any;
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
      toolCall: {
        functionCalls: [
          {
            name: 'list_calendar_events',
            id: 'call-id-123',
            args: { timeMin: '2026-06-12T00:00:00Z', timeMax: '2026-06-13T00:00:00Z' }
          }
        ]
      }
    });

    // 5. Assert em.fork() was called
    expect(mockEm.fork).toHaveBeenCalled();
    expect(mockFork.findOne).toHaveBeenCalledWith(expect.anything(), { id: 'test-tenant' });
    expect(mockSendToolResponse).toHaveBeenCalled();
  });

  it('should fork EntityManager when handling query_crm tool call', async () => {
    registerStreamHandler(mockWsServer as any, mockEm);

    const ws = new EventEmitter() as any;
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
      toolCall: {
        functionCalls: [
          {
            name: 'query_crm',
            id: 'call-id-124',
            args: { phoneNumber: '+15551234567' }
          }
        ]
      }
    });

    expect(mockEm.fork).toHaveBeenCalled();
    expect(mockCustomerServiceConstructor).toHaveBeenCalledWith(mockFork);
    expect(mockFindByPhoneNumber).toHaveBeenCalledWith('+15551234567');
    expect(mockSendToolResponse).toHaveBeenCalled();
  });

  it('should fork EntityManager when handling book_appointment tool call', async () => {
    registerStreamHandler(mockWsServer as any, mockEm);

    const ws = new EventEmitter() as any;
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
      toolCall: {
        functionCalls: [
          {
            name: 'book_appointment',
            id: 'call-id-125',
            args: { customerId: 'cust-1', departmentName: 'Sales', dateString: '2026-06-12T10:00:00Z' }
          }
        ]
      }
    });

    expect(mockEm.fork).toHaveBeenCalled();
    expect(mockAppointmentServiceConstructor).toHaveBeenCalledWith(mockFork);
    expect(mockBookAppointment).toHaveBeenCalledWith('cust-1', 'Sales', '2026-06-12T10:00:00Z');
    expect(mockSendToolResponse).toHaveBeenCalled();
  });
});
