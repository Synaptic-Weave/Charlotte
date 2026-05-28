# Charlotte — Test Coverage Plan

## Goal: 80% Coverage

The CI pipeline enforces 80% line coverage via `@vitest/coverage-v8`. The coverage scope is all
`src/**/*.ts` files excluding `src/db/migrations/**` and `src/mikro-orm.config.ts` (see
`vitest.config.ts`). `src/server.ts` is **explicitly included** — it is the application entry point
and must not be excluded.

---

## Current State

| File | Lines | Current Coverage | Notes |
|---|---|---|---|
| `src/server.ts` | 98 | 0% | Entry point — requires `app.ts` extraction |
| `src/services/transcoder.ts` | 202 | 0% | Pure math, zero deps — easiest win |
| `src/routes/auth.ts` | 238 | 0% | Needs DB mock or Postgres |
| `src/routes/webhooks.ts` | 259 | 0% | Needs DB mock or Postgres |
| `src/routes/streams.ts` | 380 | 0% | WebSocket + Gemini ADK — hardest |
| `src/routes/numbers.ts` | 165 | 0% | Needs DB mock or Postgres |
| `src/middleware/auth.ts` | 60 | 0% | Pure JWT logic — easy win |
| `src/db/context.ts` | 46 | 0% | AsyncLocalStorage — easy win |
| `src/domain/entities/Tenant.ts` | ~50 | 85.7% | Missing `updateDestination`, `updateName` |
| `src/domain/entities/User.ts` | ~54 | 88.7% | Missing `updatePassword`, `updateRole` |
| `src/domain/entities/Organization.ts` | ~41 | 92.5% | Missing `updateName` |
| `src/domain/entities/TwilioPhoneNumber.ts` | 44 | 0% | Missing all — `create`, `updateFriendlyName` |
| `src/domain/entities/CallSession.ts` | 55 | 0% | Missing all — `create`, `updateStreamSid`, `updateStatus` |

**Overall baseline:** ~10% (integration test suite zeroes out without a Postgres connection).

Total measured source lines (approximate): ~1,692 lines across all in-scope files.

---

## Approach: server.ts Refactor (app extraction)

`server.ts` mixes two concerns: application wiring (testable) and process bootstrap (untestable in
unit tests). The refactor splits them cleanly.

### What moves to `src/app.ts`

Extract a `createApp(em: EntityManager, wss: WebSocketServer)` factory function that:

1. Creates the Express `Application` instance
2. Registers CORS and `express.json()` middleware
3. Attaches the `/api/health` route (calling `orm.isConnected()`)
4. Registers `createAuthRouter(em)` at `/api/auth`
5. Registers `createNumbersRouter(em)` at `/api/tenants/numbers`
6. Registers `createWebhooksRouter(em)` at `/api/webhook`
7. Calls `registerStreamHandler(wss, em)`
8. Registers the global error handler

`createApp` returns the `express.Application` instance. No `server.listen` call, no signal
handlers, no `MikroORM.init`.

### What stays in `server.ts` (bootstrap-only, intentionally not unit-tested)

- `MikroORM.init(config)` and `orm.getMigrator().up()`
- `http.createServer(app)` + `new WebSocketServer({ server })`
- `server.listen(PORT, ...)`
- `process.on('SIGTERM', ...)` / `process.on('SIGINT', ...)`
- The `bootstrap()` outer function and its `.catch` handler

These lines (~35–40 lines) remain in `server.ts` and are bootstrapping noise that cannot be
meaningfully unit-tested without spawning a real process. They are documented here as intentionally
uncovered. The remaining ~60 lines that move into `app.ts` will be covered by the `createApp`
tests.

---

## Phase 1: Quick Wins (No DB Required)

These tests have zero external dependencies and can run in the CI environment today (once MegaLinter
and build issues are resolved).

### 1a. `tests/transcoder.test.ts` — `src/services/transcoder.ts`

**Mock strategy:** None. All functions are pure math operating on `Buffer` / `Int16Array`.

**Test cases:**

```
describe('transcoder — decodeMuLawBuffer')
  it('returns Int16Array of same length as input buffer')
  it('decodes silence byte (0xFF) to zero sample')
  it('decodes max positive byte (0x7F) to positive sample')
  it('is invertible: encode(decode(x)) round-trips correctly')

describe('transcoder — encodeMuLawBuffer')
  it('returns Buffer of same length as input Int16Array')
  it('clamps samples below -32768 to valid range')
  it('clamps samples above +32767 to valid range')
  it('encodes zero sample to expected mu-law byte')

describe('transcoder — upsample8kHzTo16kHz')
  it('returns empty Int16Array for empty input (line 110 early-return branch)')
  it('returns output array of length 2× input')
  it('first sample of each pair matches original sample')
  it('interpolated sample is the average of adjacent originals')
  it('handles single-sample input without out-of-bounds access (boundary, lines 120–121)')

describe('transcoder — downsample24kHzTo8kHz')
  it('returns Math.floor(len / 3) output samples')
  it('each output sample is the rounded average of 3 input samples')
  it('ignores trailing samples that do not form a complete group of 3')

describe('transcoder — transcodeTwilioToGemini')
  it('returns a non-empty base64 string for a known mu-law payload')
  it('output length is consistent with 2× upsampled 16-bit LE encoding')

describe('transcoder — transcodeGeminiToTwilio')
  it('returns a non-empty base64 string for a known PCM payload')
  it('round-trip Twilio→Gemini→Twilio preserves approximate signal shape')

describe('transcoder — downsample24kHzTo8kHzWithCarryover')
  it('correctly combines carryover + new samples before downsampling')
  it('returns leftover samples as the next carryover when len % 3 != 0')
  it('returns empty carryover when total length is a multiple of 3')
  it('works correctly with an empty carryover (zero-length Int16Array)')
```

**Estimated test count:** ~20 tests
**Projected line coverage gain:** +202 lines (~12% of total source) — the largest single-file
gain available without any infrastructure.

---

### 1b. `tests/entities.test.ts` — extend existing entity tests

Add to the existing `entities.test.ts` describe block (or a new `describe` block at the bottom).

**Missing coverage in `Tenant.ts` (lines 39–48):**

```
describe('Tenant — mutation methods')
  it('updateDestination: sets destinationNumber, destinationVerified, and bumps updatedAt')
  it('updateName: sets name and bumps updatedAt')
```

**Missing coverage in `User.ts` (lines 44–52):**

```
describe('User — mutation methods')
  it('updatePassword: sets passwordHash and bumps updatedAt')
  it('updateRole: sets role and bumps updatedAt')
```

**Missing coverage in `Organization.ts` (lines 36–39):**

```
describe('Organization — mutation methods')
  it('updateName: sets name and bumps updatedAt')
```

**New `TwilioPhoneNumber.ts` coverage (all 44 lines):**

```
describe('TwilioPhoneNumber — factory and mutations')
  it('create: returns instance with generated UUID, correct tenant ref, phoneNumber, friendlyName')
  it('create: sets createdAt and updatedAt to the same Date value')
  it('create: phoneNumber and friendlyName are stored as provided')
  it('updateFriendlyName: updates friendlyName and bumps updatedAt (lines 40–43)')
```

**New `CallSession.ts` coverage (all 55 lines):**

```
describe('CallSession — factory and mutations')
  it('create: returns instance with generated UUID, correct tenant ref, callSid')
  it('create: initialises streamSid to null and status to "initiated" (lines 33–44)')
  it('updateStreamSid: sets streamSid and bumps updatedAt (lines 46–49)')
  it('updateStatus: transitions to "active" and bumps updatedAt')
  it('updateStatus: transitions to "completed" and bumps updatedAt')
  it('updateStatus: transitions to "failed" and bumps updatedAt')
```

**Estimated new test count:** ~14 tests
**Projected line coverage gain:** ~+140 lines (~8%) — completes the entity layer to ~100%.

---

### 1c. `tests/context.test.ts` — `src/db/context.ts`

**Mock strategy:** Mock `EntityManager` with `vi.fn()`. No Postgres needed because
`runInTenantTransaction` can be exercised by injecting a mock `em` whose `fork()` and
`transactional()` resolve synchronously. `getTenantContext` needs no mock at all — it is a
direct read from `AsyncLocalStorage`.

**Test cases:**

```
describe('getTenantContext')
  it('returns undefined when called outside a tenantLocalStorage.run() scope')
  it('returns the stored TenantContext when called inside tenantLocalStorage.run()')

describe('runInTenantTransaction')
  it('throws if no tenant context is active (line 34–36 guard)')
  it('throws if context.tenantId is falsy (empty string)')
  it('forks the EntityManager and calls fork.transactional()')
  it('executes SET LOCAL app.current_tenant_id inside the transaction (line 43)')
  it('resolves with the return value of the callback')
  it('propagates errors thrown inside the callback')
```

**Estimated test count:** 8 tests
**Projected line coverage gain:** +46 lines (~2.7%).

---

### 1d. `tests/auth-middleware.test.ts` — `src/middleware/auth.ts`

This file was already authored by Mouse (8 tests). Verify it covers:
- No `Authorization` header → 401
- Malformed / expired token → 403
- Token missing `tenantId` claim → 403
- Token missing `userId` claim → 403
- Valid token → `req.context` populated, `tenantLocalStorage.run()` called, `next()` invoked

If any of the above cases are missing, add them. The auth middleware is 60 lines (lines 1–60 in
`src/middleware/auth.ts`). Key branches:

- Line 24: `if (!token)` → 401
- Line 29: `jwt.verify` error callback → 403
- Line 41–43: missing claims guard → 403
- Lines 46–59: happy path — context construction and `tenantLocalStorage.run()`

**Estimated test count:** 8 (existing) + up to 2 additions = 10 tests max
**Projected line coverage gain:** +60 lines (~3.5%) once these tests are confirmed passing.

---

## Phase 2: Integration Tests (Requires Postgres)

These tests require a running Postgres instance with the Charlotte schema applied. They are already
partially written (`rls.test.ts`, `streams.test.ts`, `transfers.test.ts`) but currently fail due to
no DB in the CI environment. This phase is about completing them once Postgres is available.

**Pre-condition:** A `TEST_DATABASE_URL` environment variable pointing to a seeded test database, or
a Docker Compose service added to the CI workflow.

### 2a. `tests/auth-routes.test.ts` — `src/routes/auth.ts` (238 lines)

**Mock strategy:** Use `supertest` against `createApp(mockEm, mockWss)` (from Phase 3's
`app.ts` extraction). Mock the `EntityManager` with `vi.fn()` stubs for `em.fork()`,
`fork.findOne()`, `fork.transactional()`. For full integration, use real Postgres.

**Test cases:**

```
describe('POST /api/auth/signup')
  it('returns 400 when required fields are missing')
  it('returns 400 when email already exists')
  it('returns 201 with JWT and tenantId on successful registration')
  it('hashes the password (bcrypt) before persisting')

describe('POST /api/auth/login')
  it('returns 401 when email not found')
  it('returns 401 when password does not match hash')
  it('returns 200 with JWT and tenantId on valid credentials')
  it('JWT payload contains tenantId, userId, and role claims')

describe('GET /api/auth/me')
  it('returns 401 without Authorization header')
  it('returns 200 with user profile when authenticated')

describe('PUT /api/auth/me/destination')
  it('returns 401 when unauthenticated')
  it('returns 400 when destinationNumber is missing')
  it('returns 200 and updates destination on valid request')
```

**Estimated test count:** ~13 tests
**Projected line coverage gain:** +238 lines (~14%) — largest single-file gain in this phase.

---

### 2b. `tests/numbers-routes.test.ts` — `src/routes/numbers.ts` (165 lines)

**Mock strategy:** Mock Twilio client via `vi.mock('twilio', ...)`. Inject mock `EntityManager`.
For full integration paths, use real Postgres.

**Test cases:**

```
describe('GET /api/tenants/numbers/')
  it('returns 401 without valid JWT')
  it('returns 200 with empty array when no numbers are provisioned')
  it('returns 200 with list of provisioned numbers for authenticated tenant')

describe('GET /api/tenants/numbers/search')
  it('returns 401 without JWT')
  it('returns 400 when query param is absent')
  it('returns available numbers from Twilio API when configured')
  it('returns 503 when Twilio is not configured (isTwilioConfigured = false)')

describe('POST /api/tenants/numbers/provision')
  it('returns 401 without JWT')
  it('returns 400 when phoneNumber is missing in body')
  it('provisions the number, persists TwilioPhoneNumber entity, returns 201')
  it('handles Twilio API error gracefully (500)')
```

**Estimated test count:** ~11 tests
**Projected line coverage gain:** +165 lines (~9.8%).

---

### 2c. `tests/webhooks-routes.test.ts` — `src/routes/webhooks.ts` (259 lines)

**Mock strategy:** Twilio webhook requests do not require auth JWT but require Twilio request
validation. Mock `twilio.validateRequest()` or set `TWILIO_AUTH_TOKEN` to a test value with
matching signatures.

**Test cases:**

```
describe('POST /api/webhook/voice')
  it('returns TwiML <Connect><Stream> response for inbound call')
  it('includes correct WebSocket URL in Stream noun')

describe('POST /api/webhook/voice/status')
  it('returns 204 on valid status callback')
  it('updates CallSession status to "completed" when CallStatus=completed')
  it('updates CallSession status to "failed" when CallStatus=failed')

describe('POST /api/webhook/voice/transfer')
  it('returns 400 when transferTo is missing')
  it('returns TwiML <Dial> response for a valid transfer request')

describe('POST /api/webhook/voice/recording')
  it('returns 204 on recording callback')
```

**Estimated test count:** ~9 tests
**Projected line coverage gain:** +259 lines (~15.3%) — highest impact integration test file.

---

## Phase 3: server.ts via app.ts Extraction

### Refactor: create `src/app.ts`

Create `src/app.ts` with the following signature:

```typescript
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { EntityManager } from '@mikro-orm/postgresql';
import { MikroORM } from '@mikro-orm/postgresql';
import { createAuthRouter } from './routes/auth.js';
import { createNumbersRouter } from './routes/numbers.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { registerStreamHandler } from './routes/streams.js';

export function createApp(
  em: EntityManager,
  orm: Pick<MikroORM, 'isConnected'>,
  wss: WebSocketServer
): express.Application {
  const app = express();

  registerStreamHandler(wss, em);

  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json());

  app.get('/api/health', async (req, res) => {
    const isDbConnected = await orm.isConnected();
    res.status(200).json({
      status: 'OK',
      timestamp: new Date(),
      database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
    });
  });

  app.use('/api/auth', createAuthRouter(em));
  app.use('/api/tenants/numbers', createNumbersRouter(em));
  app.use('/api/webhook', createWebhooksRouter(em));

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API Error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
  });

  return app;
}
```

Update `src/server.ts` to import and call `createApp(orm.em, orm, wss)` instead of
inlining the app setup.

### Tests: `tests/app.test.ts` — `src/app.ts`

**Mock strategy:** `vi.mock` the four route/stream modules so they return no-op routers.
Mock `orm.isConnected()` to resolve `true` or `false`. Use `supertest` to make HTTP requests
against the returned `express.Application`.

**Test cases:**

```
describe('createApp — middleware and routing')
  it('registers CORS headers on all responses')
  it('parses JSON bodies (Content-Type: application/json)')
  it('mounts auth routes at /api/auth')
  it('mounts numbers routes at /api/tenants/numbers')
  it('mounts webhook routes at /api/webhook')

describe('createApp — GET /api/health')
  it('returns 200 with status OK when DB is connected')
  it('returns 200 with database: DISCONNECTED when orm.isConnected() resolves false')
  it('response body contains a timestamp field')

describe('createApp — global error handler (lines 53–56 in server.ts)')
  it('returns err.status and err.message when next(err) is called with a typed error')
  it('falls back to 500 and "Internal server error." when err has no status')

describe('createApp — WebSocket handler registration')
  it('calls registerStreamHandler with the provided wss and em')
```

**Estimated test count:** ~11 tests
**Projected line coverage gain for `app.ts`:** ~55–60 lines (the extracted logic).
**Residual `server.ts` coverage:** bootstrap lines (~35–40) remain at 0% — acceptable and
documented. The file still appears in coverage but at ~40–45% covered (the logic that moved
to `app.ts` is now covered through `app.ts`).

---

## Phase 4: Streams & Webhooks (Hard)

`src/routes/streams.ts` (380 lines) is the most complex file. It manages the real-time
WebSocket bridge between Twilio Media Streams and the Google ADK Gemini Live session.

### 4a. Unit tests for pure helpers inside `streams.ts`

If any pure helper functions exist (message parsers, event type discriminators), extract them
to a `src/services/streams-helpers.ts` and unit-test them directly. This is the lowest-effort
coverage gain.

### 4b. Integration / E2E tests for WebSocket stream flow

**Mock strategy:** Use `ws` client in tests to connect to a `WebSocketServer` bound to a
random port. Mock the Gemini ADK `LiveSession` using `vi.mock('@google/adk', ...)` to
intercept `sendAudio`, `receive`, and session lifecycle methods.

**Test cases:**

```
describe('streams — registerStreamHandler WebSocket lifecycle')
  it('accepts a new WebSocket connection without error')
  it('closes the connection gracefully on WS close event')
  it('ignores non-JSON messages without crashing')

describe('streams — Twilio media events')
  it('handles "connected" event and logs stream initialization')
  it('handles "start" event and sets streamSid on the CallSession')
  it('handles "media" event: decodes base64 mu-law, transcodes, sends to Gemini')
  it('handles "stop" event and updates CallSession status to "completed"')

describe('streams — Gemini ADK response events')
  it('encodes Gemini audio response and sends mu-law base64 back to Twilio WS')
  it('handles Gemini session errors without crashing the WebSocket server')
```

**Estimated test count:** ~10 tests
**Projected line coverage gain:** +200–260 lines (~12–15%) depending on branch coverage.

Note: Phase 4 is labeled "Hard" because it requires mocking both the Twilio WebSocket protocol
and the Google ADK Live session. It should be tackled last, after the infrastructure (Postgres,
mock patterns) is stable.

---

## Priority Order

| Priority | Test File | Phase | DB Required | Est. Tests | Coverage Gain |
|---|---|---|---|---|---|
| 1 | `tests/transcoder.test.ts` (new) | 1a | No | ~20 | ~+12% |
| 2 | `tests/entities.test.ts` (extend) | 1b | No | ~14 | ~+8% |
| 3 | `tests/context.test.ts` (new) | 1c | No | 8 | ~+2.7% |
| 4 | `tests/auth-middleware.test.ts` (verify/extend) | 1d | No | 8–10 | ~+3.5% |
| 5 | `src/app.ts` refactor + `tests/app.test.ts` (new) | 3 | No | ~11 | ~+4% |
| 6 | `tests/auth-routes.test.ts` (new) | 2a | Yes | ~13 | ~+14% |
| 7 | `tests/webhooks-routes.test.ts` (new) | 2c | Yes | ~9 | ~+15.3% |
| 8 | `tests/numbers-routes.test.ts` (new) | 2b | Yes | ~11 | ~+9.8% |
| 9 | `tests/streams.test.ts` (extend) | 4b | No (mocked) | ~10 | ~+12% |

---

## Projected Coverage by Phase

Baseline total: ~1,692 measurable source lines. The 80% threshold = ~1,354 covered lines.

| After Phase | Lines Covered (est.) | Coverage % | 80% Target |
|---|---|---|---|
| Baseline | ~170 | ~10% | Not met |
| Phase 1 complete | ~618 | ~36.5% | Not met |
| Phase 1 + Phase 3 | ~686 | ~40.5% | Not met |
| Phase 1 + Phase 3 + Phase 2a | ~924 | ~54.6% | Not met |
| Phase 1 + Phase 3 + Phase 2 (all) | ~1,348 | ~79.7% | Borderline |
| All phases (incl. Phase 4) | ~1,550+ | ~91.6% | Met |

**The 80% target requires completing Phases 1, 2, and 3 in full.** Phase 4 (streams) is the
buffer that pushes coverage well past 80% and covers the highest-risk real-time code.

---

## How to Run Tests

```bash
# Run all tests (no coverage)
npm test

# Run with coverage report
npm run test:coverage

# Run only DB-free tests (Phases 1 and 3)
npx vitest run tests/transcoder.test.ts tests/entities.test.ts tests/context.test.ts tests/auth-middleware.test.ts tests/app.test.ts

# Watch mode during development
npx vitest --watch

# Run a single test file
npx vitest run tests/transcoder.test.ts
```

Coverage output is written to `coverage/` (HTML report at `coverage/index.html`, JSON at
`coverage/coverage-final.json`). The CI workflow checks the JSON summary against the 80%
threshold.

---

## Notes for Implementors

- **No `supertest` in `devDependencies` yet.** Add it before writing route tests:
  `npm install --save-dev supertest @types/supertest`
- **`vi.mock` hoisting:** Vitest hoists `vi.mock(...)` calls to the top of the file. Always
  import mocked modules after the `vi.mock` declaration, not before.
- **`JWT_SECRET` env var:** `src/routes/auth.ts` calls `requireEnv('JWT_SECRET')` at module
  load time (line 16). Set `process.env.JWT_SECRET = 'test-secret'` in a `beforeAll` or in
  `vitest.config.ts` `env` block before importing the router, otherwise the module throws on
  import.
- **`EntityManager` fork pattern:** All route handlers call `em.fork()` before touching the DB.
  The mock must return a `fork` object that also exposes `findOne`, `find`, `persist`, `flush`,
  `transactional`, and `execute` methods as `vi.fn()`.
- **Lookup table initialization:** `src/services/transcoder.ts` initializes `MU_LAW_TO_PCM_TABLE`
  and `PCM_TO_MU_LAW_TABLE` at module load time (lines 61–69). This is a feature, not a problem —
  it means the module can be imported in tests with no side-effect risk.
