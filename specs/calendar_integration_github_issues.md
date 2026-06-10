# Charlotte Google Workspace Calendar Integration - Backlog

## Milestone 1: Data Architecture & Scaffolding

### Issue #1: Database Migrations & Entity Models for Calendar Integration
**Assignee:** Architect
**Labels:** `backend`, `database`, `mikro-orm`

**User Story:**
As a platform engineer,
I want to implement the database schema and Mikro-ORM entities for the Calendar Integration,
So that we have a secure, multi-tenant data foundation for storing connected accounts and calendar resources.

**Acceptance Criteria:**
- **Given** I am deploying the database changes,
  **When** I run the SQL migrations,
  **Then** tables for `integration_providers`, `connected_accounts`, `calendar_resources`, `booking_destinations`, `oauth_authorization_sessions`, and `connected_account_events` are created.
- **Given** the tables are created,
  **When** I inspect the schema,
  **Then** every table includes a `tenant_id` and enforces Postgres Row-Level Security (RLS) policies.
- **Given** the database is set up,
  **When** I query data via Mikro-ORM,
  **Then** the TypeScript entities strictly map to the tables and enforce tenant isolation.

**Engineering Scope & Implementation Guidelines:**
- Use the provided SQL Up/Down migrations from the `calendar_integration_domain_model.md` spec.
- Create Mikro-ORM entity classes (Blue, Green, Yellow, Pink, Orange archetypes).
- Enforce RLS policies for `tenant_id` to prevent cross-tenant data leaks.
- Ensure MegaLinter compliance across all TypeScript entity definitions.
- Write unit tests for Mikro-ORM mappings targeting 80% test coverage.

---

## Milestone 2: OAuth & Core Integration Services

### Issue #2: Google Workspace OAuth 2.0 Flow & Token Management
**Assignee:** Switch
**Labels:** `backend`, `security`, `oauth`

**User Story:**
As a Charlotte tenant administrator,
I want to securely connect my Google Workspace account,
So that Charlotte can access my calendar securely.

**Acceptance Criteria:**
- **Given** I am an admin on the integrations page,
  **When** I click to connect Google Calendar,
  **Then** the system generates an `OAuthAuthorizationSession` with a cryptographically secure `stateParameter` and returns the Google Auth URL.
- **Given** I return from the Google consent screen,
  **When** the OAuth callback is triggered with a valid code,
  **Then** the system exchanges the code for a refresh token.
- **Given** the system has retrieved a refresh token,
  **When** it stores the token in `connected_accounts`,
  **Then** the token is encrypted at rest using AES-256-GCM with `tenant_id` as Additional Authenticated Data (AAD).

**Engineering Scope & Implementation Guidelines:**
- Implement the `GET /api/v1/integrations/google/auth-url` endpoint.
- Implement the `GET /api/v1/integrations/google/callback` endpoint.
- Manage `oauth_authorization_sessions` (Pink Transaction) status updates (`PENDING` -> `COMPLETED`).
- Implement symmetric encryption/decryption logic for tokens using a managed KMS key.
- Integration tests must simulate the OAuth flow and verify token encryption, maintaining 80% minimum coverage.

---

## Milestone 3: API Endpoints for Resource Sync

### Issue #3: Calendar Resource Fetching & Booking Destination API
**Assignee:** Switch
**Labels:** `backend`, `api`, `google-api`

**User Story:**
As a Charlotte tenant administrator,
I want to retrieve a list of my available calendars and set one as my active booking destination,
So that Charlotte knows exactly where to read availability and write new appointments.

**Acceptance Criteria:**
- **Given** my Google account is successfully connected,
  **When** the frontend requests available calendars,
  **Then** the backend uses the decrypted refresh token to fetch calendars from the Google Calendar API and caches them in `calendar_resources`.
- **Given** I select a specific calendar from the list,
  **When** I submit my preference,
  **Then** the system creates or updates a `BookingDestination` (Yellow Role) record linked to that `CalendarResource`.

**Engineering Scope & Implementation Guidelines:**
- Implement `GET /api/v1/integrations/google/calendars` to list remote calendars.
- Implement `POST /api/v1/integrations/google/preferences` to save the `selectedCalendarId`.
- Integrate the official Google APIs Node.js client.
- Ensure strict database isolation—verify the selected `calendar_resource_id` belongs to the requesting `tenant_id`.
- Write API integration tests (Gherkin-style assertions) ensuring valid responses and error handling (80% coverage).
- Adhere to MegaLinter constraints.

---

## Milestone 4: Frontend Integrations UI

### Issue #4: Integrations Dashboard UI & Card Components
**Assignee:** Apoc
**Labels:** `frontend`, `ui`, `react`

**User Story:**
As a Charlotte tenant administrator,
I want to view my available integrations and initiate the Google Calendar connection,
So that I can seamlessly begin the setup process.

**Acceptance Criteria:**
- **Given** I navigate to the Settings > Integrations page,
  **When** I view the "Google Calendar" integration card,
  **Then** it displays a "Not Connected" status badge.
- **Given** I am on the integrations dashboard,
  **When** I click the "Connect Google Calendar" primary CTA,
  **Then** the button shows a loading state (`isOAuthLoading = true`) and I am securely redirected to the Google consent screen.

**Engineering Scope & Implementation Guidelines:**
- Build the `IntegrationsPage` and `IntegrationCard` React components based on the `calendar_integration_ux_wireframes.md`.
- Utilize the "Warm Space" Design System tokens (`--charlotte-bg-primary`, `--charlotte-cta-gradient`, etc.).
- Ensure dark mode compatibility using the `prefers-color-scheme: dark` tokens.
- Add accessibility (a11y) tags for screen readers on all buttons and cards.
- Implement unit tests via React Testing Library with 80% coverage.

### Issue #5: Post-OAuth Calendar Configuration Modal
**Assignee:** Apoc
**Labels:** `frontend`, `ui`, `react`

**User Story:**
As a Charlotte tenant administrator returning from the OAuth flow,
I want to be greeted by a configuration modal to select my target calendar,
So that I can finalize the setup immediately without navigating away.

**Acceptance Criteria:**
- **Given** I am redirected back to the dashboard with a success parameter,
  **When** the page loads,
  **Then** the `CalendarConfigModal` automatically appears over a blurred backdrop.
- **Given** the modal is open,
  **When** the API fetches calendars,
  **Then** a loading skeleton is shown, followed by a dropdown of `availableCalendars`.
- **Given** I select a calendar and click "Complete Setup",
  **When** the API call succeeds,
  **Then** the modal transitions to a success state with a green checkmark and gracefully fades out.

**Engineering Scope & Implementation Guidelines:**
- Implement `CalendarConfigModal` utilizing `--charlotte-backdrop-blur` for the Glassmorphism overlay.
- Manage frontend state (`showConfigModal`, `isFetchingCalendars`, `selectedCalendarId`, `isSavingConfig`).
- Connect to `GET /api/v1/integrations/google/calendars` and `POST /api/v1/integrations/google/preferences`.
- Maintain strict a11y compliance (focus trapping within the modal, keyboard navigation for the select dropdown).
- Write UI component tests asserting correct state transitions and error handling (80% coverage).
