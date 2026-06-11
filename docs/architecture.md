# Domain Model Design

*Authored by Architect, Domain Modeling Expert*

I have completed the domain model design based on Peter Coad's color archetypes to support the Oracle AI persona's function-calling tools. Here is the full architectural design.

### 1. Color Model Classification Table

| Archetype (Color) | Entity Name | Description |
| :--- | :--- | :--- |
| **Thing (Green)** | `Customer` | Core identity entity representing the caller/user in the CRM. Maintains its own lifecycle and holds identifying details like phone number. |
| **Transaction (Pink)** | `Appointment` | An interval of time (Moment-Interval) scheduled for a specific service. Represents a coordinated business process tied to a Customer. |
| **Descriptor (Blue)** | `Department` | A catalog entry used to characterize routing destinations (e.g., Support, Sales) for call transfers. Serves as a factory/descriptor for routing events. |

### 2. Entity Definitions

```typescript
// --- THING (Green) ---
export class Customer {
  constructor(
    public readonly id: string,
    public readonly tenantId: string, // Data Isolation Guard
    public readonly phoneNumber: string,
    public readonly name: string | null,
    public readonly createdAt: Date
  ) {}

  // Factory Method
  static create(tenantId: string, phoneNumber: string, name: string | null = null): Customer {
    return new Customer(
      crypto.randomUUID(),
      tenantId,
      phoneNumber,
      name,
      new Date()
    );
  }
}

// --- TRANSACTION (Pink) ---
export class Appointment {
  constructor(
    public readonly id: string,
    public readonly tenantId: string, // Data Isolation Guard
    public readonly customerId: string,
    public readonly serviceType: string,
    public readonly scheduledAt: Date,
    public readonly status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED',
    public readonly createdAt: Date
  ) {}

  // Factory Method
  static schedule(
    tenantId: string, 
    customerId: string, 
    serviceType: string, 
    scheduledAt: Date
  ): Appointment {
    return new Appointment(
      crypto.randomUUID(),
      tenantId,
      customerId,
      serviceType,
      scheduledAt,
      'SCHEDULED',
      new Date()
    );
  }
}

// --- DESCRIPTOR (Blue) ---
export class Department {
  constructor(
    public readonly id: string,
    public readonly tenantId: string, // Data Isolation Guard
    public readonly name: string,
    public readonly routingKey: string,
    public readonly active: boolean
  ) {}

  // Factory Method
  static create(tenantId: string, name: string, routingKey: string): Department {
    return new Department(
      crypto.randomUUID(),
      tenantId,
      name,
      routingKey,
      true
    );
  }
}
```

### 3. Schema Mappings

| TypeScript (CamelCase) | Database (snake_case) | Type / Constraints |
| :--- | :--- | :--- |
| **Customer** | `customers` | |
| `id` | `id` | `UUID PRIMARY KEY` |
| `tenantId` | `tenant_id` | `UUID NOT NULL` |
| `phoneNumber` | `phone_number` | `VARCHAR(50) NOT NULL` |
| `name` | `name` | `VARCHAR(255)` |
| `createdAt` | `created_at` | `TIMESTAMP WITH TIME ZONE` |
| **Appointment** | `appointments` | |
| `id` | `id` | `UUID PRIMARY KEY` |
| `tenantId` | `tenant_id` | `UUID NOT NULL` |
| `customerId` | `customer_id` | `UUID NOT NULL REFERENCES customers(id)`|
| `serviceType` | `service_type` | `VARCHAR(255) NOT NULL` |
| `scheduledAt` | `scheduled_at` | `TIMESTAMP WITH TIME ZONE NOT NULL` |
| `status` | `status` | `VARCHAR(50) NOT NULL` |
| `createdAt` | `created_at` | `TIMESTAMP WITH TIME ZONE` |
| **Department** | `departments` | |
| `id` | `id` | `UUID PRIMARY KEY` |
| `tenantId` | `tenant_id` | `UUID NOT NULL` |
| `name` | `name` | `VARCHAR(255) NOT NULL` |
| `routingKey` | `routing_key` | `VARCHAR(100) NOT NULL` |
| `active` | `active` | `BOOLEAN DEFAULT TRUE` |

### 4. Migration SQL

```sql
-- ==========================================
-- UP MIGRATION
-- ==========================================

-- DEPARTMENTS (Descriptor)
CREATE TABLE departments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    routing_key VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_departments_tenant ON departments(tenant_id);

-- CUSTOMERS (Thing)
CREATE TABLE customers (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_tenant_phone UNIQUE(tenant_id, phone_number)
);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone_number);

-- APPOINTMENTS (Transaction)
CREATE TABLE appointments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    service_type VARCHAR(255) NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_appointments_schedule ON appointments(tenant_id, scheduled_at);


-- ==========================================
-- DOWN MIGRATION
-- ==========================================
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS departments;
```

### 5. Architecture Overview

```mermaid
graph TD
    subgraph External
        Caller[Customer/Caller]
        GoogleWorkspace[Google Workspace APIs]
    end

    subgraph Twilio[Twilio Platform]
        PhoneNumbers[Phone Numbers]
        Webhooks[TwiML Webhooks]
        MediaStreams[Media Streams]
    end

    subgraph GCP[Google Cloud Platform]
        Frontend[Cloud Run: Frontend React]
        Backend[Cloud Run: Backend Node.js]
        DB[(Cloud SQL: PostgreSQL)]
        Secrets[Secret Manager]
        Gemini[Gemini Multimodal Live API]
    end

    Caller -- "Voice Call" --> PhoneNumbers
    PhoneNumbers -- "Inbound Call Event" --> Webhooks
    Webhooks -- "HTTP POST" --> Backend
    Backend -- "TwiML <Connect><Stream>" --> Webhooks
    MediaStreams -- "Bidirectional Audio (WSS)" --> Backend
    Backend -- "Bidirectional Audio (WSS)" --> Gemini
    
    Frontend -- "HTTP/REST APIs" --> Backend
    Backend -- "Read/Write (RLS)" --> DB
    Backend -- "Fetch Credentials" --> Secrets
    Backend -- "OAuth/Calendar APIs" --> GoogleWorkspace
```

### 6. Entity Relationship Diagram

```mermaid
erDiagram
    TENANT ||--o{ CUSTOMER : "owns"
    TENANT ||--o{ APPOINTMENT : "owns"
    TENANT ||--o{ DEPARTMENT : "owns"
    
    CUSTOMER ||--o{ APPOINTMENT : "books (Transaction)"
    
    DEPARTMENT {
        UUID id PK
        UUID tenant_id FK
        string name
        string routing_key
    }
    
    CUSTOMER {
        UUID id PK
        UUID tenant_id FK
        string phone_number
        string name
    }
    
    APPOINTMENT {
        UUID id PK
        UUID tenant_id FK
        UUID customer_id FK
        string service_type
        timestamp scheduled_at
        string status
    }
```

### 7. Sequence Diagrams

#### 7.1 Inbound Call Setup
```mermaid
sequenceDiagram
    autonumber
    participant Caller
    participant Twilio
    participant Backend
    participant Gemini

    Caller->>Twilio: Dials Business Number
    Twilio->>Backend: POST /api/webhook/twilio/inbound-call
    Backend->>Backend: Resolve Tenant & Create CallSession
    Backend-->>Twilio: Return TwiML with <Connect><Stream>
    Twilio->>Backend: Establish WebSocket Connection
    Backend->>Gemini: Establish WebSocket Connection
    
    rect rgb(240, 248, 255)
        Note over Caller, Gemini: Bidirectional Real-time Audio Stream
        Caller->>Twilio: Speaks
        Twilio->>Backend: Audio chunks (Base64)
        Backend->>Gemini: Audio chunks (Base64)
        Gemini->>Backend: Audio chunks (Base64)
        Backend->>Twilio: Audio chunks (Base64)
        Twilio->>Caller: Hears AI voice
    end
```

#### 7.2 Appointment Booking Flow (Google Calendar)
```mermaid
sequenceDiagram
    autonumber
    participant Caller
    participant Gemini
    participant Backend
    participant GoogleWorkspace as Google Calendar

    Note over Caller, Gemini: Active Audio Session
    Caller->>Gemini: "I'd like to book a haircut for tomorrow."
    Gemini->>Backend: Tool Call: list_calendar_events(tomorrow)
    Backend->>GoogleWorkspace: GET /calendars/events
    GoogleWorkspace-->>Backend: Event list
    Backend-->>Gemini: Tool Result: available slots
    Gemini->>Caller: "I have an opening at 2 PM. Does that work?"
    Caller->>Gemini: "Yes, book it."
    Gemini->>Backend: Tool Call: book_appointment(...)
    Backend->>GoogleWorkspace: POST /calendars/events
    GoogleWorkspace-->>Backend: Event created
    Backend-->>Gemini: Tool Result: success
    Gemini->>Caller: "You're all set for 2 PM tomorrow!"
```

#### 7.3 Human Handoff / Transfer Routing
```mermaid
sequenceDiagram
    autonumber
    participant Caller
    participant Gemini
    participant Backend
    participant Twilio
    participant Human as Business Owner

    Note over Caller, Gemini: Active Audio Session
    Caller->>Gemini: "I need to talk to a human."
    Gemini->>Backend: Tool Call: transfer_call("Sales")
    Backend-->>Gemini: Tool Result: "Transferring now..."
    Backend->>Twilio: Update Call: Redirect to Transfer Webhook
    Twilio->>Human: Dials Business Owner (Whisper Prompt)
    Human->>Twilio: Presses 1 to Accept
    Twilio->>Backend: Owner Accepted
    Backend->>Twilio: Bridge Caller and Owner (Conference)
    Note over Caller, Human: Caller and Owner Connected
```

### 8. Call Flow Workflow Diagram

```mermaid
flowchart TD
    Start((Incoming Call)) --> LookupTenant{Tenant Provisioned?}
    LookupTenant -- Yes --> InitSession[Initialize CallSession]
    LookupTenant -- No --> FallbackTenant[Fallback to Default Tenant]
    FallbackTenant --> InitSession
    
    InitSession --> ReturnTwiML[Return TwiML with WebSockets]
    ReturnTwiML --> OpenSockets[Open Audio Streams: Twilio <-> Backend <-> Gemini]
    
    OpenSockets --> AIConversation[Active AI Conversation]
    
    AIConversation --> ToolCall{AI Tool Call?}
    ToolCall -- book_appointment --> BookAppt[Google Calendar API]
    BookAppt --> AIConversation
    
    ToolCall -- transfer_call --> Transfer[Human Handoff Workflow]
    Transfer --> DialOwner[Dial Human Staff]
    DialOwner --> OwnerAccept{Owner Accepts?}
    OwnerAccept -- Yes --> Bridge[Bridge Call]
    OwnerAccept -- No --> Voicemail[Send to Voicemail]
    
    ToolCall -- None --> CallEnd((Call Ended))
    Bridge --> CallEnd
    Voicemail --> CallEnd
```

### 9. Data Isolation Strategy

**Tenant Boundary Enforcement**
1. **Physical Schema Guard:** Every single domain table includes a `tenant_id` UUID column.
2. **Composite Uniqueness:** Constraints that would typically be globally unique (like a Customer's `phone_number`) are strictly scoped by a composite key `(tenant_id, phone_number)`.
3. **Query Layer Enforcement:** In the application's Data Access Layer (DAL) or ORM repository, every query must implicitly include `WHERE tenant_id = ?`. This guarantees that an appointment or customer query cross-pollinating into another tenant's workspace is impossible. 
4. **Index Optimization:** All tables have a leading index on `tenant_id` (or include it as the first parameter in composite indexes) to ensure that multitenant data retrieval is highly performant.
