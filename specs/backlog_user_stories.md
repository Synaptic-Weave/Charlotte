# Charlotte Backlog: Intelligent Voicemail & Call Handoff

## Overview
This backlog breaks down the requirements for enhancing Charlotte's call handoff and intelligent voicemail capabilities into vertical user slices. Each story delivers end-to-end value across the necessary technical layers (Database, Backend APIs, Twilio Webhooks, AI Streaming, and Frontend).

---

## Story 1: Information Gathering
**Title:** Gather and Persist Caller Information Before Transfer
**As a** caller,
**I want to** provide my name and the purpose of my call to Charlotte before being transferred,
**So that** the person I am calling has context before answering the phone.

### Acceptance Criteria
- **Given** an active conversation with Charlotte,
- **When** the caller requests a transfer to a department or person,
- **Then** Charlotte must ask for their Name and the Purpose of their call.
- **When** the caller provides this information,
- **Then** Charlotte invokes `update_customer_name` to update the CRM `Customer` entity.
- **And** Charlotte invokes `transfer_call(department, caller_name, purpose)`.
- **And** the database `CallSession` entity is updated with `callerName` and `callerPurpose` fields before the WebSocket stream terminates.

### Engineering Scope & Implementation Guidelines
- **DB/ORM:** Update `CallSession` and `Customer` entities using Mikro-ORM. Ensure MegaLinter compliance.
- **Core Backend:** Implement/update `transfer_call` and `update_customer_name` AI function calls within the Gemini registry.
- **Testing:** Integration tests for function execution and database updates with at least 80% coverage.

---

## Story 2: Dynamic Whisper Handoff
**Title:** Dynamic Whisper Handoff to Destination
**As a** destination receiver,
**I want to** hear the caller's name and purpose before accepting the transfer,
**So that** I can make an informed decision on whether to accept the call.

### Acceptance Criteria
- **Given** a `<Dial>` request initiated by the backend,
- **When** the destination picks up the call,
- **Then** Twilio requests the `/transfer-whisper` webhook.
- **And** the webhook fetches the `CallSession` via `sessionId` to retrieve `callerName` and `callPurpose`.
- **And** Twilio plays a dynamic `<Say>` prompt incorporating the Name and Purpose (e.g., "You have an incoming call from [Name] regarding [Purpose]. Press 1 to accept").
- **When** the destination presses 1,
- **Then** the call is bridged.

### Engineering Scope & Implementation Guidelines
- **Telecom Integration:** Implement the `/transfer-whisper` endpoint using the Twilio Node SDK.
- **Testing:** Unit tests for the webhook routing logic and database reads, ensuring 80% test coverage.

---

## Story 3: Conversational Message Kickback
**Title:** Conversational Message Kickback on Failed Transfer
**As a** caller,
**I want to** be reconnected to Charlotte if the destination doesn't answer,
**So that** I can leave a conversational message instead of dealing with a standard voicemail.

### Acceptance Criteria
- **Given** a failed transfer attempt (ignored, declined, or timed out),
- **When** Twilio executes the `/transfer-decision` webhook,
- **Then** Twilio receives TwiML to `<Connect>` back to the AI WebSocket with `resumed=true` and `sessionId`.
- **When** the WebSocket reconnects,
- **Then** the backend injects a high-priority system prompt: "The transfer failed. The caller's name is [Name]. Immediately apologize, tell them no one is available, and ask if you can take a message. Do not wait for them to speak first."
- **When** the caller leaves a message,
- **Then** Charlotte invokes `save_message(summary)`.
- **And** a new `Message` entity is created in the database containing the summary, securely bound to the `CallSession` and `tenantId`.

### Engineering Scope & Implementation Guidelines
- **DB/ORM:** Create the `Message` entity via Mikro-ORM with `tenant_id` isolation constraint (`REFERENCES tenants(id) ON DELETE CASCADE`).
- **Telecom Integration:** Implement `/transfer-decision` webhook to generate TwiML for WebSocket reconnection.
- **ADK Streaming:** Modify WebSocket handler to intercept `resumed` flag and inject the context prompt.
- **Core Backend:** Implement `save_message` function call.
- **Testing:** E2E mock simulation for the `resumed` connection flow and message saving.

---

## Story 4: Standard Voicemail Fallback
**Title:** Standard Voicemail Fallback for System Failures
**As a** caller,
**I want to** be able to leave a standard audio voicemail if the AI system fails to reconnect,
**So that** my message is still recorded and delivered to the destination.

### Acceptance Criteria
- **Given** a failed transfer attempt and a subsequent failure to reconnect to the AI WebSocket,
- **When** the `<Connect>` TwiML fails or falls through sequentially,
- **Then** Twilio executes a standard `<Record>` block for fallback voicemail.
- **When** the voicemail is recorded,
- **Then** the `/voicemail-fallback` webhook captures the Twilio `RecordingUrl`.
- **And** the `RecordingUrl` is saved to the respective `Message` record in the database.
- **And** a background job or offline process transcribes the audio to generate a standard message summary.

### Engineering Scope & Implementation Guidelines
- **Telecom Integration:** Ensure sequential fallback TwiML includes the `<Record>` block pointing to `/voicemail-fallback`.
- **Core Backend:** Implement `/voicemail-fallback` webhook and update the `Message` entity.
- **Testing:** Test the fallback mechanism by simulating a WebSocket connection failure.

---

## Story 5: Inbox UI Dashboard
**Title:** Message Inbox and Summary Dashboard UI
**As a** business user,
**I want to** view and read the summarized messages taken by Charlotte in a dashboard,
**So that** I can follow up with callers efficiently.

### Acceptance Criteria
- **Given** an authenticated user logged into the dashboard,
- **When** the user navigates to the "Inbox",
- **Then** they see a List View of messages displaying: Status, Date/Time, Caller Name, Purpose, Summary Snippet, and Phone Number.
- **And** the user can filter by status and search by Name/Phone.
- **When** the user clicks on a message row,
- **Then** a Detail View displays the full message summary and action buttons ("Mark as Read", "View Customer Profile").

### Engineering Scope & Implementation Guidelines
- **Frontend:** Build `frontend/src/components/Inbox.tsx` using React/Next.js and existing design system.
- **Core Backend:** Implement API endpoints to fetch paginated messages for the dashboard.
- **Testing/Linting:** UI component tests and MegaLinter compliance.
