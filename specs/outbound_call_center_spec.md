# Feature Spec: Outbound Call Center

## Problem Statement

Michael (Business Owner) needs a way to proactively reach out to customers for tasks such as appointment reminders, follow-ups, or proactive support. Currently, Charlotte operates exclusively as an inbound virtual receptionist. By introducing an outbound capability, Charlotte can act as a proactive outbound agent, automating a new dimension of customer engagement and increasing business automation.

## Affected Personas

* **Michael (Business Owner)** — Wants an automated way to trigger calls via API, configure the outbound behavior, and have these calls seamlessly sync outcomes to his CRM/calendar without human intervention.
* **Caller (End Customer)** — Receives an unexpected but helpful call. Needs a natural, ultra-low latency conversational experience from the exact moment they pick up the phone, avoiding awkward silences or robotic delays.

## Requirements

1. **Programmatic Call Initiation**: Provide a secured API endpoint to initiate outbound calls programmatically via the Twilio REST API.
2. **WebSocket Streaming**: Configure the TwiML application so that upon the user answering, the call connects directly to a Twilio Media Stream WebSocket, bridging the audio to the ADK agent.
3. **Outbound Persona Configuration**: The ADK agent must be configurable to use an "Outbound Persona" distinct from the standard "Receptionist" persona, tailored for proactive communication.
4. **Synthetic Initialization Prompt**: Upon successful WebSocket connection, the system must immediately send a synthetic prompt to the agent (e.g., "The user picked up, introduce yourself"). This ensures the agent speaks first, establishing the context of the outbound call instantly.
5. **Data Isolation**: Ensure strict tenant/workspace ID boundaries. Outbound calls must only be initiated within the context of a valid, authenticated custom API key and secure session tied to the specific workspace.
6. **Answering Machine Detection (AMD)**: AMD handling (e.g., leaving a voicemail vs. hanging up) MUST be configurable by the client via the admin portal.
7. **Dynamic Context Injection**: The system MUST provide a templatable script editor for outbound calls. This editor should potentially include an AI assistant to help build scripts by linking to a database or spreadsheet containing the call information.
8. **Retry Policies**: Behavior for busy or unanswered lines MUST be configurable by the client.
9. **Billing and Usage Limits**: Outbound minute tracking and enforcement MUST be configurable on the admin account, driven by the overarching GTM strategy.

## Acceptance Criteria

**Scenario 1: Successful Outbound Call Initiation**

* **Given** a valid authenticated API request with a target phone number and valid Workspace ID,
* **When** the system processes the request,
* **Then** it should trigger an outbound call via the Twilio REST API to the target number.

**Scenario 2: WebSocket Bridging and Agent Greeting**

* **Given** an initiated outbound call is answered by the customer,
* **When** the Twilio Media Stream WebSocket connects to the backend,
* **Then** the system successfully routes the stream to the ADK agent configured with the "Outbound Persona",
* **And** the system immediately injects a synthetic prompt instructing the agent to greet the user.

**Scenario 3: Strict Tenant Security Enforcement**

* **Given** an API request to initiate an outbound call,
* **When** the request contains a Workspace ID that does not match the authenticated API key or session,
* **Then** the system rejects the request with a `403 Forbidden` error and no call is placed.

## Resolved Design Decisions

* **Answering Machine Detection (AMD)**: Will be fully configurable by the client.
* **Dynamic Context Injection**: Will be handled via a templatable script editor (with AI-assisted mapping to databases/spreadsheets).
* **Retry Policies**: Will be configurable.
* **Billing and Usage Limits**: Will be configurable via the admin account based on GTM strategy.
