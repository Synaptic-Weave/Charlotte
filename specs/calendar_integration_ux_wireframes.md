# UX Specification: Charlotte Google Calendar Integration

## 1. Design System Tokens (The "Warm Space" Palette)

```css
:root {
  /* Light Mode (The "Bright Office") */
  --charlotte-bg-primary: hsl(30, 20%, 98%); /* #fcfbfa */
  --charlotte-accent: hsl(172, 80%, 35%); /* #0d9488 */
  --charlotte-cta-gradient: linear-gradient(135deg, #0d9488, #0ea5e9);
  --charlotte-card-bg: rgba(255, 254, 252, 0.8);
  --charlotte-card-border: rgba(224, 218, 208, 0.4);
  --charlotte-text-primary: #1e293b;
  --charlotte-text-secondary: #64748b;
  --charlotte-backdrop-blur: blur(12px);
  --charlotte-font-heading: 'Outfit', sans-serif;
  --charlotte-font-body: 'Inter', sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Dark Mode (The "Deep Sky") - Default */
    --charlotte-bg-primary: hsl(232, 39%, 7%); /* #0b0d19 */
    --charlotte-accent: hsl(172, 77%, 42%); /* #14b8a6 */
    --charlotte-cta-gradient: linear-gradient(135deg, #14b8a6, #6366f1);
    --charlotte-card-bg: rgba(21, 23, 42, 0.6);
    --charlotte-card-border: rgba(20, 184, 166, 0.15);
    --charlotte-text-primary: #f8fafc;
    --charlotte-text-secondary: #94a3b8;
  }
}
```

## 2. User Flow

1. **Discovery:** User navigates to the Settings > **Integrations** page via the main dashboard sidebar.
2. **Review Integration:** User locates the "Google Calendar" card (marked as "Not Connected").
3. **Initiate Connection:** User clicks the "Connect Calendar" CTA button.
4. **OAuth Redirect:** User is securely redirected to the Google Accounts OAuth 2.0 consent screen.
5. **Authorization:** User selects their Google account and grants Charlotte permission to view and edit events.
6. **Return & Configuration:** User is redirected back to the Charlotte Integrations page. A warm, friendly modal opens automatically.
7. **Calendar Selection:** The modal fetches available calendars. User selects the specific calendar (e.g., "Client Appointments") Charlotte should read/write to from a smooth dropdown menu.
8. **Confirmation:** User clicks "Save Setup". The modal transitions to a success state with a green checkmark, then fades out. The Google Calendar card now shows "Connected".

## 3. Wireframes

### View A: Integrations Dashboard
```text
+--------------------------------------------------------------------------+
|  +----------------+  Integrations                                        |
|  | Dashboard      |  Expand Charlotte's capabilities by connecting your  |
|  | Receptionist   |  favorite tools.                                     |
|  | Integrations ● |                                                      |
|  | Billing        |  +------------------------------------------------+  |
|  +----------------+  | [Icon: Google Calendar]                        |  |
|                      | Google Workspace Calendar                      |  |
|                      | Allow Charlotte to check your availability     |  |
|                      | and book appointments directly.                |  |
|                      |                                                |  |
|                      | Status: Not Connected                          |  |
|                      |                                                |  |
|                      |  [ Connect Google Calendar ] <--- CTA Gradient |  |
|                      +------------------------------------------------+  |
|                                                                          |
|                      +------------------------------------------------+  |
|                      | [Icon: Twilio]                                 |  |
|                      | Voice Provider                                 |  |
|                      | ...                                            |  |
|                      +------------------------------------------------+  |
+--------------------------------------------------------------------------+
```

### View B: Post-OAuth Configuration Modal (Glassmorphism Overlay)
```text
+--------------------------------------------------------------------------+
|                                                                          |
|       +----------------------------------------------------------+       |
|       |  ✨ Google Calendar Connected!                           |       |
|       |                                                          |       |
|       |  Welcome back! Charlotte is almost ready to help manage  |       |
|       |  your schedule.                                          |       |
|       |                                                          |       |
|       |  Which calendar should Charlotte use for appointments?   |       |
|       |  +----------------------------------------------------+  |       |
|       |  |  Client Appointments (me@business.com)           v |  |       |
|       |  +----------------------------------------------------+  |       |
|       |                                                          |       |
|       |               [ Cancel ]      [ Complete Setup ]         |       |
|       |                                                          |       |
|       +----------------------------------------------------------+       |
|                                                                          |
+--------------------------------------------------------------------------+
```

## 4. Component Hierarchy Tree

```text
IntegrationsPage
├── PageHeader
│   ├── Title
│   └── Subtitle (Warm micro-copy)
├── IntegrationsGrid
│   ├── IntegrationCard (Google Calendar)
│   │   ├── CardHeader (Icon + Title)
│   │   ├── CardDescription
│   │   ├── StatusBadge (Connected/Disconnected)
│   │   └── ConnectButton (Primary CTA)
│   └── IntegrationCard (Twilio)
└── CalendarConfigModal (Conditionally rendered on OAuth return)
    ├── ModalBackdrop (Glassmorphism)
    ├── ModalHeader
    ├── ModalBody
    │   ├── FriendlyGreeting
    │   └── CalendarSelectDropdown (Native select or custom listbox)
    └── ModalFooter
        ├── CancelButton (Ghost)
        └── SubmitButton (Primary Gradient CTA)
```

## 5. State Requirements

- `hasGoogleAuth`: Boolean (derived from user profile / auth token)
- `isOAuthLoading`: Boolean (disables the Connect button while redirecting)
- `showConfigModal`: Boolean (triggers the configuration modal upon successful redirect return with OAuth query params)
- `availableCalendars`: Array of Objects `[{ id: string, name: string, isPrimary: boolean }]` (fetched from backend once OAuth succeeds)
- `isFetchingCalendars`: Boolean (shows a subtle loading skeleton in the modal while calendars fetch)
- `selectedCalendarId`: String (stores the user's dropdown choice)
- `isSavingConfig`: Boolean (shows loading spinner on the "Complete Setup" button)

## 6. API Touchpoints

1. `GET /api/v1/integrations/google/auth-url`
   - **Purpose:** Fetches the secure OAuth 2.0 authorization URL for the user to be redirected to Google.
2. `GET /api/v1/integrations/google/callback?code=...`
   - **Purpose:** Handled on the backend when the user returns. Exchanges the code for access/refresh tokens and saves them to the tenant's profile.
3. `GET /api/v1/integrations/google/calendars`
   - **Purpose:** Retrieves the list of calendars accessible by the newly linked Google account so the user can choose one.
4. `POST /api/v1/integrations/google/preferences`
   - **Payload:** `{ selectedCalendarId: "..." }`
   - **Purpose:** Saves the chosen calendar ID so Charlotte knows exactly where to read/write appointments.
