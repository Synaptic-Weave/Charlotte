# Feature Specification: Business Directory and Call Transfer

## 1. Problem Statement
Callers need a reliable way to be seamlessly routed to specific individuals or departments within a business without requiring manual intervention. At the same time, businesses must protect their employee rosters and internal structures from being exposed to unauthorized or malicious callers.

## 2. Affected Personas
- **Michael (Business Owner)** — Needs to configure routing destinations for his team and expects incoming calls to be screened professionally before being transferred.
- **Caller (End Customer)** — Needs to reach a specific person or department and expects a natural, polite handoff where they are asked for their name.
- **Recipient (Employee/Department)** — Receives the transferred call, expecting a seamless connection without having to answer basic triage questions.

## 3. Requirements
1. The system MUST maintain a private directory mapping entity names (individuals or departments) to their respective destination phone numbers. This data must be strictly scoped to the tenant/workspace.
2. The voice agent MUST support recognizing requests to speak to an entity and matching it against the internal directory.
3. The agent MUST NOT disclose the contents of the directory (e.g., list of names, departments, or numbers) under any circumstances, even if explicitly asked by the caller.
4. When a caller requests an entity present in the directory, the agent MUST prompt the caller with: "May I ask who is calling?" before initiating any transfer.
5. After successfully capturing the caller's name, the agent MUST initiate a call transfer (via Twilio/Google ADK integration) to the mapped destination number.

## 4. Acceptance Criteria
- **Given** a caller asks to speak to "Michael", and "Michael" is in the directory, **When** the agent processes the request, **Then** the agent responds with "May I ask who is calling?".
- **Given** the caller has provided their name for a transfer, **When** the agent processes the name, **Then** the agent initiates a SIP/Twilio call transfer to Michael's mapped phone number.
- **Given** a caller asks "Who works there?" or "Can you list the departments?", **When** the agent responds, **Then** the agent politely declines to provide a list and does not disclose any directory information.
- **Given** a caller asks for an entity not in the directory, **When** the agent processes the request, **Then** the agent gracefully handles the failure (e.g., offering to take a message instead) without confirming or denying the existence of other directory entries.

## 5. Resolved Design Decisions
1. **Transfer Mechanism:** The system MUST execute a warm transfer (the agent announces the caller's name to the destination before connecting the call).
2. **Name Capture Validation:** If the caller remains silent or refuses to provide a name, the agent MUST prompt them one additional time. If they still refuse, the call MUST be sent to voicemail.
3. **No Answer / Voicemail:** A built-in voicemail feature MUST be implemented for recording and storing voice messages if the destination number does not answer or if the caller refuses to provide their name.
4. **Directory Management:** The business owner will manage and update the directory via the Admin UI.
