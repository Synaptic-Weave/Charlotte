# Charlotte Project: AI Function Calling & CRM Backlog (Vertical Slices)

## Milestone 1: Core Domain & AI Integration

### Story 1: AI Customer Context Retrieval (`query_crm`)

**User Story**:

- As a Caller,
- I want the AI to recognize my account details based on my phone number,
- So that I receive personalized and efficient service without repeating my information.

**Acceptance Criteria**:

- **Given** a caller with a registered phone number in the tenant workspace, **When** they interact with the AI, **Then** the AI successfully retrieves and uses their Customer profile context.
- **Given** a database query for the customer, **When** retrieving data, **Then** `tenantId` isolation must be strictly enforced so no cross-tenant data leaks occur.

**Tasks**:

- [ ] **DB**: Implement the `Customer` domain model and migrations using Mikro-ORM, ensuring robust `tenantId` isolation.
- [ ] **Service**: Build the backend endpoint/service logic to fetch a Customer record by phone number.
- [ ] **AI Integration**: Update Charlotte's Gemini Live connection in `streams.ts` to include the `query_crm` tool definition and handle the callback securely.

**Engineering Scope & Implementation Guidelines**:

- Use Mikro-ORM for the `Customer` entity.
- Integration tests must achieve 80% coverage on tenant isolation and service logic.
- Must pass all MegaLinter compliance checks.

---

### Story 2: AI Appointment Booking (`book_appointment`)

**User Story**:

- As a Caller,
- I want to book an appointment with a specific department through the AI,
- So that I can schedule services autonomously during my call.

**Acceptance Criteria**:

- **Given** an authenticated caller and a valid department, **When** the caller requests to book a time, **Then** a new Appointment entity is created and confirmed by the AI.
- **Given** an invalid Date/Time or Department, **When** the AI attempts to book, **Then** the system returns a validation error and the AI asks for a new time.

**Tasks**:

- [ ] **DB**: Implement the `Appointment` and `Department` domain models and migrations using Mikro-ORM, ensuring `tenantId` isolation.
- [ ] **Service**: Build the backend endpoint/service to book an Appointment, strictly enforcing schedule and department constraints.
- [ ] **AI Integration**: Update Charlotte's Gemini Live connection in `streams.ts` to include the `book_appointment` tool definition and handle the callback.

**Engineering Scope & Implementation Guidelines**:

- Use Mikro-ORM for `Appointment` and `Department` entities and relationships.
- Write integration tests verifying scheduling rules and schema constraints (80% coverage).
- Adhere to MegaLinter compliance rules.

---

### Story 3: AI Call Routing & Human Hand-off (`transfer_call`)

**User Story**:

- As a Caller,
- I want to be able to request a transfer to a human agent,
- So that complex or sensitive issues can be handled appropriately without frustration.

**Acceptance Criteria**:

- **Given** an active call, **When** the caller requests to speak to a human, **Then** the AI triggers the transfer protocol and routes the call successfully.

**Tasks**:

- [ ] **Service**: Implement the backend service logic to handle SIP/routing transfer requests based on the current tenant and department.
- [ ] **AI Integration**: Update Charlotte's Gemini Live connection in `streams.ts` to include the `transfer_call` tool definition and callback handler.

**Engineering Scope & Implementation Guidelines**:

- Ensure graceful degradation and fallback if routing fails.
- Adhere to MegaLinter compliance rules.
