# Product Requirements Document (PRD)
# Inbound Call Handling with Twilio and Google Agent Development Kit (ADK)

## 1. Problem Statement
For an AI-powered virtual receptionist to be viable, it must feel like talking to a real, professional assistant. Existing voice platforms (like Vapi.ai) provide this as a high-cost middle-tier service. To achieve high operating margins, enterprise-grade data isolation, and deep integration with proprietary business workflows, Charlotte must connect **Twilio's telephony streams directly to Google's Agent Development Kit (ADK)**. 

The primary user need is an **ultra-low latency, highly conversational voice interface** that answers inbound calls, understands voice inputs natively, speaks with natural intonation, handles user interruptions (barge-in) instantly, and maintains a durable, stateful memory of the conversation.

---

## 2. Affected Personas

### Michael (Business Owner)
*   **Needs:** A reliable receptionist that doesn't drop calls, sounds highly professional, accurately represents his brand, can answer FAQs, and operates cost-effectively without expensive middle-tier voice platforms.
*   **Impact:** Lower per-minute operating costs, higher reliability, and reassurance that customers are greeted instantly by an intelligent, brand-aligned voice.

### Caller (End Customer)
*   **Needs:** A natural, low-latency conversation. They want to speak without long delays (under 1 second), interrupt the agent if they hear what they need, and get their questions answered without repeat-prompts or mechanical-sounding pauses.
*   **Impact:** A frictionless, pleasing calling experience that feels like speaking with a human receptionist.

---

## 3. System Architecture

To bypass intermediate voice aggregators (reducing latency and costs), the Charlotte backend acts as a direct real-time bridge between Twilio and Google ADK / Gemini Live API:

```mermaid
sequenceDiagram
    autonumber
    actor Caller
    participant Twilio as Twilio Telephony
    participant Server as Charlotte Backend (Node.js/TS)
    participant ADK as Google ADK (SessionService)
    participant Gemini as Gemini Live API (WebSocket)

    Caller->>Twilio: Places inbound phone call
    Twilio->>Server: HTTP POST /api/webhook/twilio/inbound-call
    Note over Server: Validate Twilio Signature
    Server->>ADK: Create/Retrieve Session (keyed by CallSid)
    ADK-->>Server: Return Session Context (History, System Instructions)
    Server-->>Twilio: Return TwiML with <Connect><Stream url="wss://..."/>
    Twilio->>Server: Establish WebSocket (wss://.../api/streams/twilio)
    Twilio->>Server: Send "start" event (CallSid, StreamSid)
    
    rect rgb(230, 245, 255)
        note over Server, Gemini: Establish Bi-Directional Stream
        Server->>Gemini: Connect to Live API WebSocket (rehydrated from ADK Session)
    end

    rect rgb(240, 240, 240)
        note over Caller, Gemini: Inbound Audio Path (Twilio -> Gemini)
        Twilio->>Server: Stream "media" (8kHz 8-bit μ-law)
        Server->>Server: Transcode: μ-law -> 16-bit PCM -> Upsample to 16kHz
        Server->>Gemini: Stream audio chunk (audio/pcm;rate=16000)
    end

    rect rgb(240, 255, 240)
        note over Gemini, Caller: Outbound Audio Path (Gemini -> Twilio)
        Gemini->>Server: Stream response chunk (24kHz 16-bit PCM)
        Server->>Server: Transcode: Downsample to 8kHz -> G.711 μ-law
        Server->>Twilio: Send "media" event (base64 μ-law)
        Twilio->>Caller: Plays audio to user
    end

    rect rgb(255, 230, 230)
        note over Caller, Server: User Interruption (Barge-In)
        Caller->>Twilio: Speaks while agent is speaking
        Twilio->>Server: Inbound speech audio stream
        Server->>Gemini: Inbound audio chunk
        Gemini->>Server: Interruption Signal (VAD trigger)
        Server->>Twilio: Send "clear" event (purges Twilio playback buffer)
        Server->>Server: Discard queued outbound audio chunks
    end

    Caller->>Twilio: Hangs up call
    Twilio->>Server: Send "stop" event & close WebSocket
    Server->>ADK: Commit complete conversation & state changes
    ADK->>ADK: Save Session (durable store)
    Server->>Gemini: Terminate Live Session
```

---

## 4. Technical Requirements

### 4.1. Twilio WebSocket & TwiML Integration
*   **REQ-4.1.1 (Webhook Web Server):** The server MUST expose an Express-based HTTP POST endpoint at `/api/webhook/twilio/inbound-call`.
*   **REQ-4.1.2 (Twilio Request Validation):** The webhook MUST validate the incoming request signature using Twilio's Node.js SDK helper (`twilio.webhook()`) to prevent unauthorized spoofing.
*   **REQ-4.1.3 (Stream Connection TwiML):** The webhook MUST return valid TwiML containing the `<Connect>` and `<Stream>` verbs. The stream URL MUST point to `wss://<host>/api/streams/twilio` using a secure WebSocket protocol.
*   **REQ-4.1.4 (WebSocket Protocol Support):** The server MUST support WebSocket connections via the `ws` library, accepting incoming streams from Twilio.
*   **REQ-4.1.5 (Twilio Event Parsing):** The server MUST parse Twilio's JSON WebSocket packets:
    *   `start`: Extract and map `CallSid` (unique ID) and `StreamSid` (for playback control).
    *   `media`: Extract the `payload` containing G.711 μ-law audio.
    *   `stop`: Handle clean termination of the call stream.

### 4.2. Google ADK & Gemini Live API Integration
*   **REQ-4.2.1 (Durable Session Management):** Upon receiving the Twilio `start` event, the server MUST initialize or retrieve a unique ADK Session via Google ADK's `SessionService`, using the `CallSid` as the session identifier.
*   **REQ-4.2.2 (Multi-Tenant Workspace Context):** The `SessionService` MUST bind the session to a Tenant/Workspace ID to enforce data isolation, loading only relevant business data, FAQs, and system instructions.
*   **REQ-4.2.3 (Gemini Live Connection):** The backend MUST open a bidirectional WebSocket connection to the Gemini Live API (via `@google/adk`'s `run_live()` or direct Live API Client) using Gemini 2.0 Flash (`gemini-2.0-flash-exp` or equivalent).
*   **REQ-4.2.4 (Context Hydration):** The backend MUST hydrate the Live API Session with system prompts, available tool definitions, and historical conversation events retrieved from the ADK Session.
*   **REQ-4.2.5 (Durable Transcript Logging):** On call completion or stream termination, the server MUST save the complete conversation transcript and updated agent state back to the durable `SessionService`.

### 4.3. High-Performance Audio Transcoding
*   **REQ-4.3.1 (Inbound Codec Conversion):** The server MUST transcode incoming Twilio audio from G.711 μ-law (PCMU) to 16-bit Linear PCM (little-endian).
*   **REQ-4.3.2 (Inbound Resampling):** The server MUST upsample the decoded 8kHz Linear PCM to 16kHz Linear PCM to meet Gemini's input requirements (`audio/pcm;rate=16000`).
*   **REQ-4.3.3 (Inbound Chunking):** Converted inbound audio MUST be sent to Gemini in fixed, low-latency frames (between 20ms and 40ms, or 320 to 640 samples per packet).
*   **REQ-4.3.4 (Outbound Resampling):** The server MUST downsample Gemini's response audio from 24kHz Linear PCM to 8kHz Linear PCM.
*   **REQ-4.3.5 (Outbound Codec Conversion):** The server MUST encode the 8kHz Linear PCM back into G.711 μ-law (PCMU) to match Twilio's requirements.
*   **REQ-4.3.6 (Non-Blocking Event Loop):** Audio transcoding MUST be performed using highly optimized bitwise operations or lightweight WebAssembly modules to avoid blocking the single-threaded Node.js event loop during high concurrent call volumes.

### 4.4. Latency, Turn, & Interruption Management
*   **REQ-4.4.1 (Voice Activity Detection):** The backend MUST leverage Gemini Live API's native bidirectional turn detection to automatically identify when the caller starts speaking.
*   **REQ-4.4.2 (Outbound Interruption Cleardown):** Upon receiving an interruption signal from Gemini:
    *   The server MUST immediately transmit a `"clear"` event to Twilio over the WebSocket (`{"event": "clear", "streamSid": "..."}`) to purge Twilio's audio playback queue.
    *   The server MUST immediately discard any buffered outbound audio chunks pending transmission to Twilio.
*   **REQ-4.4.3 (Latency Budgets):** The round-trip audio latency (from when the caller stops speaking to when the agent's synthesized response begins playing on the phone) MUST average under 1000ms, with a hard maximum of 1500ms under standard network conditions.

### 4.5. Connection Lifecycle & Resilience
*   **REQ-4.5.1 (Graceful Disconnects):** If either the Twilio WebSocket or the Gemini Live connection closes unexpectedly, the server MUST cleanly close the opposite stream, flush buffers, and release resources.
*   **REQ-4.5.2 (Gemini Connection Re-establishment):** If the Gemini Live API connection drops due to a network glitch but the phone call is still active, the server MUST attempt to re-establish the Live API session immediately, rehydrating it from the persistent ADK Session, without dropping the call.
*   **REQ-4.5.3 (Resource Leaking Prevention):** The server MUST employ strict garbage collection and clean up WebSocket listeners, audio buffers, and session contexts on stream teardown to prevent memory leaks.

---

## 5. Acceptance Criteria

### Scenario 1: Successful Inbound Call Connection
**Given** an inbound caller dials the business's Twilio phone number
**When** Twilio routes the call and triggers the HTTP POST to `/api/webhook/twilio/inbound-call`
**Then** the server MUST:
1. Validate the Twilio request signature successfully.
2. Initialize a secure ADK Session keyed by `CallSid`.
3. Return a TwiML response containing the `<Connect><Stream>` verbs targeting `wss://<domain>/api/streams/twilio`.
4. Successfully establish the WebSocket connection with Twilio.
5. Connect to the Gemini Live API, rehydrating it with the loaded ADK Session context.
6. Begin bidirectional streaming within 500ms of the WebSocket connection opening.

### Scenario 2: Bidirectional Conversational Streaming
**Given** the inbound call and Gemini Live sessions are fully established
**When** the caller speaks a sentence into their phone
**Then** the server MUST:
1. Receive continuous 8kHz μ-law audio packets from Twilio.
2. Transcode and upsample the audio to 16kHz PCM on the fly.
3. Stream the converted audio in 20-40ms chunks to the Gemini Live API.
4. Receive a real-time synthesized response from Gemini at 24kHz PCM.
5. Downsample and encode the response to 8kHz μ-law.
6. Package and transmit the audio chunks to Twilio.
7. Ensure the response begins playing on the caller's phone with a round-trip latency of <1000ms.

### Scenario 3: Caller Interrupts the Agent (Barge-In)
**Given** the agent is in the middle of speaking/playing an audio response to the caller
**When** the caller interrupts by speaking into the phone
**Then** the server MUST:
1. Receive the interruption signal from Gemini's native voice turn detection.
2. Immediately send a `clear` message to Twilio to stop playback instantly.
3. Erase all queued outbound audio buffers in the Node.js application memory.
4. Smoothly transition to listening state to capture the caller's complete utterance.

### Scenario 4: Call Clean Tear-down
**Given** a call is active and streaming
**When** either the caller hangs up the phone (triggering Twilio to send a `stop` event and close the socket) OR the call reaches a natural conclusion
**Then** the server MUST:
1. Send a clean close signal to the Gemini Live API connection.
2. Commit the complete conversation transcript and final state to the ADK `SessionService`.
3. Release all in-memory audio buffers, event listeners, and socket connections associated with that `CallSid`.
4. Verify that memory usage returns to its baseline (no memory leak).

---

## 6. Open Questions (Requires Product Owner Input)

1.  **Welcome Message Trigger:** Should Twilio trigger an initial greeting as soon as the call connects (e.g. by sending an initial text trigger or empty audio frame to Gemini to prompt it to speak first), or should we wait for the caller to speak first? (Recommended: Server sends an initial injection event to Gemini to prompt a warm, branded welcome greeting as soon as the stream is established).
2.  **Fallback Text-to-Speech (TTS) Engine:** If the Gemini Live API audio synthesis fails or is throttled, should we fall back to standard Gemini Text generation and stream the text response to a secondary TTS provider (like ElevenLabs or Deepgram)? Or should we play a static "system error, please call back" message?
3.  **Maximum Call Duration:** Do we want to enforce a maximum call duration limit (e.g., 10 minutes) to control costs and prevent runaway WebSocket sessions?
4.  **Durable Session Storage Provider:** Which storage backend should Tank set up for the ADK `SessionService` in production? (Options: Redis, PostgreSQL, or Vertex AI's managed session storage).

---

## 7. Next Steps: Technical Task Breakdown for Tank (Backend / Infra Engineer)

To unblock the team, **Tank** should proceed immediately with the following foundational development tasks:

1.  **Setup the Express server structure & Twilio Validation Middleware:**
    *   Create `/api/webhook/twilio/inbound-call` endpoint.
    *   Implement and test Twilio HTTP signature validation.
    *   Return valid TwiML for WebSocket connection.
2.  **Implement the WebSocket Server Handler:**
    *   Set up the standard WebSocket (`ws`) server handler.
    *   Add message parser for Twilio event schemas (`start`, `media`, `stop`, `mark`).
3.  **Build the High-Performance Audio Transcoder:**
    *   Write a pure-TypeScript audio utility to decode G.711 μ-law to 16-bit linear PCM and vice versa.
    *   Implement upsampling (8kHz -> 16kHz) and downsampling (24kHz -> 8kHz) using low-latency interpolation.
    *   Verify audio quality and processing latency using unit tests.
4.  **Integrate `@google/adk` and Live API:**
    *   Initialize `@google/adk` client and configure the Gemini Live API WebSocket endpoint.
    *   Implement session management leveraging `InMemorySessionService` for initial testing.
    *   Establish the bridge between the Twilio WebSocket events and the Gemini Live API stream.
5.  **Implement Turn Management & Interruption Logic:**
    *   Listen for Gemini's interruption/VAD triggers.
    *   Implement buffer clearing and send the Twilio `clear` command immediately upon interruption.
