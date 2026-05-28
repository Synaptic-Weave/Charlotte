# UX Design System & Page Flow Specifications
## Charlotte AI Virtual Receptionist — Multi-Tenant SaaS Console

**Role:** Trinity — UX Architect for Charlotte  
**Status:** Approved Specification  
**Default Theme:** Dark Mode ("Deep Sky") with support for Light Mode ("Bright Office")

---

## 1. Visual Identity & Design Tokens (The "Friendly Helper")

Charlotte is not a sterile enterprise machine; she is a friendly, supportive, and polite virtual receptionist. The user interface must feel approachably warm, premium, and frictionless.

### 1.1. Personality & Tone Guidelines
*   **Approachably Warm:** Soft borders, gentle curves, friendly micro-copy, and intuitive helper tooltips.
*   **Premium & High-Fidelity:** Clean modern typography, glassmorphism backdrops, glowing subtle gradient borders, and smooth transition states.
*   **Frictionless & Fast:** Complex telecom provisioning actions are streamlined into step-by-step wizard guides with active progress feedback.

### 1.2. Core Design Tokens (CSS Variables)

Our core design tokens are codified in standard CSS variables inside [index.css](file:///Users/michaelbrown/Documents/Gemini/projects/Charlotte/frontend/src/index.css). They define our two central themes:

| Token Category | Dark Mode (Default: "Deep Sky") | Light Mode ("Bright Office") | Usage |
| :--- | :--- | :--- | :--- |
| **Primary Background** | `hsl(232, 39%, 7%)` (Deep Indigo-Black) | `hsl(30, 20%, 98%)` (Warm Ivory) | Global app canvas backdrop |
| **Secondary Background**| `hsl(232, 39%, 10%)` (Deep Indigo-Gray) | `hsl(30, 15%, 94%)` (Warm Soft-Gray) | Sidebars, tables, and headers |
| **Accent / Focus** | `hsl(172, 77%, 42%)` (Electric Aqua-Teal) | `hsl(172, 80%, 35%)` (Emerald-Teal) | Active state indicators, focus borders |
| **CTA Gradient** | `linear-gradient(135deg, Teal, Indigo)` | `linear-gradient(135deg, Teal, Sky-Blue)` | Primary trigger buttons, active items |
| **Glass Containers** | `hsla(232, 33%, 12%, 0.6)` (Blur: `12px`) | `hsla(30, 100%, 99%, 0.8)` (Blur: `12px`) | Glassmorphic dashboards and popup cards |
| **Glowing Border** | `hsla(172, 77%, 42%, 0.15)` | `hsla(30, 20%, 80%, 0.4)` | Subtle neon outline for high visual fidelity |
| **Text Primary** | `hsl(210, 40%, 98%)` (Crisp Chalk) | `hsl(215, 28%, 17%)` (Slate-Ink) | Primary text, titles, headings |
| **Text Secondary** | `hsl(215, 16%, 65%)` (Muted Indigo) | `hsl(215, 16%, 47%)` (Muted Charcoal) | Helper texts, table column names |

---

## 2. Onboarding User Flow (The 5-Minute Setup Journey)

This flowchart details how a new business owner registers, instantly boots up a secure tenant sub-account, searches and provisions a phone line, configures Charlotte's brain instructions, and enters the active live dashboard.

```mermaid
graph TD
    %% Define styles matching design system
    classDef default fill:#0b0d19,stroke:#14b8a6,stroke-width:2px,color:#f8fafc;
    classDef highlight fill:#14b8a6,stroke:#6366f1,stroke-width:2px,color:#ffffff;
    classDef external fill:#15172a,stroke:#94a3b8,stroke-width:1px,color:#94a3b8;

    A[Visitor on Charlotte.ai] -->|Click Get Started| B(1. Sign Up Screen)
    B -->|GCP Identity Platform / Google OAuth| C(2. Create Workspace Form)
    C -->|Generate Unique tenant_id| D[3. Subscription Plan Selection]
    D -->|Stripe Checkout Flow| E(4. Number Provisioning Wizard)
    
    subgraph Number Wizard (Local/Toll-Free US & CA only)
        E -->|Search by Area Code / Type| F[Fetch Available Twilio Numbers]
        F -->|Select Number| G[Confirm Purchase Modal]
        G -->|Click Buy & Create Sub-Account| H{Sync Twilio Pipeline}
        H -->|1. Create Sub-Account Option B| I[2. Purchase Number]
        I -->|3. Register Voice Webhook URL| J[4. Write Active Number to Postgres]
    end
    
    J --> K(5. Receptionist Brain Configuration)
    K -->|Define Greeting & Business Rules| L[Initialize Google ADK Session]
    L --> M((6. Active Dashboard Console))

    class B,C,E,G,K highlight;
    class D,H,I,J,L external;
    class M default;
```

### Flow Details:
1. **User Sign Up:** Leverages GCP Identity Platform / Google Cloud OAuth (JWT token-based). The JWT contains custom claims matching the user's role and `tenant_id`.
2. **Workspace Creation:** Creates a clean, isolated Postgres row in the `tenants` table. No database resources are shared without strict foreign key filtering.
3. **Plan Selection:** Stripe checkout links billing details to prevent invalid signups.
4. **Number Provisioning Wizard:** Standardized on US/CA numbers to bypass regulatory address verification requirements. The backend dynamically creates an isolated Twilio Sub-Account (**Option B**) to track independent logs, billing, and credentials.
5. **Brain Config:** Business owners type plain-text FAQs, operating hours, and instructions. The backend feeds these directly into Google ADK as system prompts.
6. **Live Dashboard:** Complete overview of live sessions, aggregated call logs, and call volume trends.

---

## 3. ASCII Wireframes

These blueprints define our responsive, glassmorphic grids, component layouts, and typographic hierarchies.

### 3.1. Main Dashboard Console
```
+---------------------------------------------------------------------------------------------------------+
| [C] Charlotte.ai   | (Active Tenant: Brown Consulting [v])                    [Light/Dark] [User Avatar] |
+---------------------------------------------------------------------------------------------------------+
| (o) Dashboard      |                                                                                    |
| [#] Phone Lines    |  Welcome back, Michael!                                                            |
| [*] Brain Config   |  Charlotte is online and friendly helping your callers.                            |
| [?] Live Call Logs |                                                                                    |
| [@] Settings       |  +------------------------------------------------------------------------------+  |
|                    |  | (•) Active Webhook Live Status: Connected and Listening        [Pulse Dot: Green] | |
|                    |  +------------------------------------------------------------------------------+  |
|                    |                                                                                    |
|                    |  +-- Metric Cards Grid -------------------------------------------------------+  |
|                    |  | Total Inbound Calls | Avg Call Duration | Answer Rate  | Active Lines      |  |
|                    |  |      **124**        |     **2m 14s**    |   **98.4%**  |     **2 Lines**   |  |
|                    |  |   [+12% vs Month]   |    [Muted Text]   |   [Stable]   | [1 Local/1 TF]    |  |
|                    |  +----------------------------------------------------------------------------+  |
|                    |                                                                                    |
|                    |  +-- Dashboard Workspace Grid -----------------------------------------------+  |
|                    |  | [Glass Card 1: Live Call Logs & Transcripts]                               |  |
|                    |  | +------------------------------------------------------------------------+ |  |
|                    |  | | Search logs...                                                [Filter] | |  |
|                    |  | +------------------------------------------------------------------------+ |  |
|                    |  | | Caller          | Date & Time    | Duration | Status       | Actions   | |  |
|                    |  | +-----------------+----------------+----------+--------------+-----------+ |  |
|                    |  | | (512) 555-0199  | Today, 11:34 AM| 2m 15s   | Completed    | [View]    | |  |
|                    |  | | (415) 555-0210  | Today, 10:12 AM| 1m 05s   | Active Stream| [Live]    | |  |
|                    |  | | (800) 555-1212  | May 19, 4:45 PM| 3m 40s   | Completed    | [View]    | |  |
|                    |  | +------------------------------------------------------------------------+ |  |
|                    |  +----------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

### 3.2. Twilio Provisioning & Number Purchasing Screen (Wizard Step 2)
```
+---------------------------------------------------------------------------------------------------------+
| [C] Charlotte.ai   | Step 2 of 3: Provision Your AI Phone Line                                          |
+---------------------------------------------------------------------------------------------------------+
|  <- Back to Plans  |                                                                                    |
|                    |  Select a local or toll-free number matching your company's physical region.       |
|                    |  We handle all telecom configurations and sub-account routing instantly.           |
|                    |                                                                                    |
|                    |  +-- Search Filter Bar ---------------------------------------------------------+  |
|                    |  | [ US / CA [v] ]  ( ) Local Line   (*) Toll-Free Line   [ Area Code: 512 ] [Search] |
|                    |  +------------------------------------------------------------------------------+  |
|                    |                                                                                    |
|                    |  +-- Available Numbers Grid ----------------------------------------------------+  |
|                    |  | Phone Number      | City & State        | Cost / Month | One-time Setup| Action|  |
|                    |  |-------------------+---------------------+--------------+---------------+-------|  |
|                    |  | (512) 555-0120    | Austin, TX          | $1.15 / mo   | $1.00         | [Buy] |  |
|                    |  | (512) 555-0182    | Austin, TX          | $1.15 / mo   | $1.00         | [Buy] |  |
|                    |  | (512) 555-0199    | Austin, TX          | $1.15 / mo   | $1.00         | [Buy] [C]
|                    |  | (512) 555-0244    | Austin, TX          | $1.15 / mo   | $1.00         | [Buy] |  |
|                    |  +------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+

   [C] Clicking [Buy] launches the Custom Translucent Provisioning Confirmation Modal (below)
   +------------------------------------------------------------------------------+
   |  [Modal] Purchase AI Receptionist Line                                      X|
   |  --------------------------------------------------------------------------  |
   |  You have selected: **(512) 555-0199** (Austin, TX)                          |
   |                                                                              |
   |  * One-time Setup Charge: $1.00 USD                                          |
   |  * Monthly Subscription Fee: $1.15 USD                                       |
   |                                                                              |
   |  [x] I agree to the Twilio Telecom Compliance & Fair Voice Usage Policies.   |
   |                                                                              |
   |  +------------------------------------------------------------------------+  |
   |  | [Spinner] Purchasing number & establishing isolated Twilio sub-account...|  |
   |  | (Synchronous validation pipeline takes ~6s / max 15s timeout)           |  |
   |  +------------------------------------------------------------------------+  |
   |                                                                              |
   |                                                        [Cancel] [Confirm Buy]|
   +------------------------------------------------------------------------------+
```

### 3.3. Settings & Brain Configuration Editor
```
+---------------------------------------------------------------------------------------------------------+
| [C] Charlotte.ai   | Settings & Customizations                                                          |
+---------------------------------------------------------------------------------------------------------+
| (o) Dashboard      |                                                                                    |
| [#] Phone Lines    |  Configure the knowledge, greeting style, and voice of your Virtual Assistant.     |
| [*] Brain Config   |                                                                                    |
| [?] Live Call Logs |  +-- Settings Tabs -------------------------------------------------------------+  |
| [@] Settings       |  |  [ Assistant Prompt ]   [ Business Profile ]   [ Team Members ]   [ Billing ]  |  |
|                    |  +------------------------------------------------------------------------------+  |
|                    |  | [Glass Card Content: System Prompt and Knowledge Injection]                  |  |
|                    |  |                                                                              |  |
|                    |  |  Greeting Message (What Charlotte says first):                               |  |
|                    |  |  +-------------------------------------------------------------------------+ |  |
|                    |  |  | "Hi, thank you for calling Brown Consulting. I'm Charlotte, your helper. | |  |
|                    |  |  | How can I help you support your business questions today?"              | |  |
|                    |  |  +-------------------------------------------------------------------------+ |  |
|                    |  |                                                                              |  |
|                    |  |  System Instructions & Persona (Behaviors, rules, and limits):                |  |
|                    |  |  +-------------------------------------------------------------------------+ |  |
|                    |  |  | - You are polite, approachably warm, and helpful.                       | |  |
|                    |  |  | - Answer questions using only the Business FAQs below.                      | |  |
|                    |  |  | - If a caller asks to transfer, redirect to +15125559999.               | |  |
|                    |  |  +-------------------------------------------------------------------------+ |  |
|                    |  |                                                                              |  |
|                    |  |  Business FAQs & Supporting Knowledge Context:                               |  |
|                    |  |  +-------------------------------------------------------------------------+ |  |
|                    |  |  | We provide expert cloud architecture consulting at $150/hr. Our hours   | |  |
|                    |  |  | are Monday-Friday 9AM-5PM CST. We are located in Austin, TX.             | |  |
|                    |  |  +-------------------------------------------------------------------------+ |  |
|                    |  |                                                                              |  |
|                    |  |                                                        [Reset] [Save Config] |  |
|                    |  +------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

---

## 4. Frontend Component Tree (React + TypeScript)

The modular component structure is built using standard functional elements, keeping presentation isolated from business logic.

```
frontend/src/
├── index.css (Global Design System Styles & Animation Keyframes)
├── main.tsx (Entry Point)
├── App.tsx (Root Layout & Global Providers Router)
├── context/
│   ├── AuthContext.tsx (User identity, JWT tokens, tenant mapping)
│   ├── TenantContext.tsx (Active business profile, limits, timezone)
│   └── PhoneLinesContext.tsx (Twilio provisioning triggers, search, numbers state)
├── components/
│   ├── Layout/
│   │   ├── Sidebar.tsx (SidebarNav, Active statuses, logo, avatar)
│   │   └── Header.tsx (Tenant context selector, theme toggle)
│   ├── Shared/
│   │   ├── GlassCard.tsx (Glassmorphism backdrop containers)
│   │   ├── GradientButton.tsx (Main interactive active CTAs)
│   │   ├── StatusBadge.tsx (Status indicators with pulsing connection green dots)
│   │   └── SkeletonLoader.tsx (Shimmer grids for async operations)
│   └── Wizard/
│       ├── WizardSteps.tsx (Step progress progress-bar indicators)
│       ├── NumberSearchGrid.tsx (Twilio Available Numbers results)
│       └── ProvisioningModal.tsx (Transaction agreement and progress tracking)
└── pages/
    ├── Login.tsx (GCP Identity Platform and Google OAuth)
    ├── Dashboard.tsx (Call metrics grid, Live Logs Table, active session queries)
    ├── NumberWizardPage.tsx (Onboarding multi-step phone provisioning screen)
    └── Settings.tsx (Brain Config system instructions editor, human handoff configs)
```

---

## 5. Client State Specifications

We use clean React context providers to share unified SaaS states across layout trees.

### 5.1. Authentication State (`AuthContext`)
Tracks authenticated user profile, secure claims, and API headers.
```typescript
interface AuthState {
  isAuthenticated: boolean;
  token: string | null;            // JWT Token containing tenant_id claims
  userId: string | null;
  role: 'Owner' | 'Admin' | 'Member';
  tenantId: string | null;         // Isolated database tenant identifier
}
```

### 5.2. Number Provisioning State (`PhoneLinesContext`)
Orchestrates synchronous purchasing sequences and active progress parameters.
```typescript
interface PhoneLinesState {
  searchQuery: {
    country: string;
    type: 'local' | 'tollFree';
    areaCode: string;
  };
  availableNumbers: Array<{
    phoneNumber: string;
    friendlyName: string;
    lata: string;
    rateCenter: string;
    region: string;
  }>;
  activeNumbers: Array<{
    id: string;
    phoneNumber: string;
    status: 'active' | 'suspended';
    type: 'provisioned' | 'byon_sip';
  }>;
  isSearching: boolean;
  isProvisioning: boolean;
  error: string | null;
}
```

---

## 6. API Touchpoints & Endpoint Mappings

Every user action mapped in our ASCII interfaces communicates with our isolated SaaS backend endpoints:

### 6.1. Registration & Auth Endpoints
*   `POST /api/auth/register` - Creates account and returns identity verification.
*   `POST /api/tenants` - Establishes brand new Postgres Tenant Workspace, initializing `tenant_id` and setting creator role to `Owner`.

### 6.2. Phone Number Provisioning (Twilio Programmatic Sub-Accounts Option B)
*   `GET /api/tenants/numbers/search` - Hits Twilio REST API to query 10 active phone records.
    *   **Parameters:** `country` (defaults to US/CA), `type` ('local' | 'tollFree'), `areaCode` (3 digits).
*   `POST /api/tenants/numbers/provision` - Submits transactional checkout.
    *   **Payload:** `{ phoneNumber: "+15125550199" }`
    *   **Backend Steps:**
        1. Confirms Stripe credit status.
        2. Spins up programmatically a new Twilio Sub-Account (**Option B** isolation).
        3. Invokes `/v1/Accounts/{Sub_Sid}/IncomingPhoneNumbers` to buy number.
        4. Registers our central voice webhook: `https://api.charlotte.ai/api/webhook/twilio/inbound-call` on that line.
        5. Saves row to Postgres `phone_numbers` table.

### 6.3. Receptionist Brain Configurations
*   `GET /api/tenants/receptionist/config` - Fetches active prompts, FAQs context, and escalation phone numbers.
*   `POST /api/tenants/receptionist/config` - Overwrites the active receptionist prompt. Re-initializes system parameters inside the Google ADK instance.

### 6.4. Live Call Overviews & Session Queries
*   `GET /api/tenants/dashboard/metrics` - Aggregates counts, average durations, and response rates.
*   `GET /api/tenants/calls` - Queries historical Call Logs with filters and search parameters.
*   `GET /api/tenants/calls/:call_id/transcript` - Returns complete human-readable transcript strings and voice record URLs (stored on secure Cloud Storage boundaries).

---

## Blog Entry

Designing the multi-tenant UX architecture for Charlotte felt less like constructing a standard SaaS portal and more like creating a cozy, welcoming lobby for business owners. When we set out to build her interface, my absolute focus was ensuring Charlotte’s core brand ethos—that she is a "Friendly Helper"—translated into every pixel, form field, and loading transition. We rejected the typical cold, clinical layout often found in enterprise communication setups. Instead, we crafted a dark-mode default we call "Deep Sky"—a rich, relaxing canvas of indigo tones highlighted by glowing neon-teal focus borders, translucent glassmorphism cards, and interactive buttons that scale softly on click. 

From a user journey perspective, the telecom configuration has historically been the place where software onboarding goes to die. Complex regulatory paperwork, area code mappings, and slow backend API delays usually terrify business owners. By wrapping Twilio’s programmatic sub-account provisioning pipeline into an approachable three-step wizard, we transformed a frustrating administrative task into a delightful experience. Business owners can search for local or toll-free numbers, check total costs in a glassmorphic confirmation modal, and watch a friendly micro-animated loader complete the purchase—providing a live, customized, AI-driven phone agent in under five minutes.

Under the hood, the frontend ties seamlessly into a highly modern React provider structure that respects secure tenant boundaries, utilizing the Google Agent Development Kit (ADK) and GCP Identity Platform (Google Cloud Identity). Each user flow and screen layout has been meticulously architected so that data isolation is robust and clear. The final product is a perfect fusion of aesthetic visual cues, empathetic micro-copy, and bulletproof engineering interfaces—giving business owners a premium dashboard where they feel supported, in control, and proud to have Charlotte welcoming their customers.

**— Trinity, UX Architect for Charlotte**
