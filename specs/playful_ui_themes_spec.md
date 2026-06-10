# Charlotte Playful UI Themes Spec

**UX Architect:** Trinity
**Goal:** Address the "empty right-side" syndrome in the widescreen SaaS layout with playful, engaging, and friendly theme concepts that align with Charlotte's "Friendly Helper" philosophy.

## System Tech Stack & Constraints

- **Stack:** Vite + React + TypeScript + Vanilla CSS
- **Core Orchestration:** Google ADK + Gemini Live API
- **Telecom:** Twilio REST APIs (Multi-tenant)
- **Compliance:** US/Canada numbers only

## Design Tokens: The "Warm Space" Palette

```css
:root {
  /* Light Mode (The "Bright Office") */
  --bg-primary-light: hsl(30, 20%, 98%); /* #fcfbfa */
  --accent-light: hsl(172, 80%, 35%); /* #0d9488 */
  --cta-gradient-light: linear-gradient(135deg, #0d9488, #0ea5e9);
  --card-bg-light: rgba(255, 254, 252, 0.8);
  --card-border-light: rgba(224, 218, 208, 0.4);
  --text-primary-light: #1e293b;
  --text-secondary-light: #64748b;

  /* Dark Mode (The "Deep Sky" - Default) */
  --bg-primary-dark: hsl(232, 39%, 7%); /* #0b0d19 */
  --accent-dark: hsl(172, 77%, 42%); /* #14b8a6 */
  --cta-gradient-dark: linear-gradient(135deg, #14b8a6, #6366f1);
  --card-bg-dark: rgba(21, 23, 42, 0.6);
  --card-border-dark: rgba(20, 184, 166, 0.15);
  --text-primary-dark: #f8fafc;
  --text-secondary-dark: #94a3b8;

  /* Typography */
  --font-heading: 'Outfit', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

---

## Shared User Flow: Twilio Number Provisioning

1. **Idle State:** User views dashboard. Action required: Add Number.
2. **Intent:** User clicks "Get New Number" (Primary CTA).
3. **Wizard Step 1:** Select Area Code (US/CA only constraint applied).
4. **Wizard Step 2:** Choose from list of available Twilio numbers.
5. **Loading State:** Provisioning indicator spins up. `POST /api/twilio/provision`
6. **Success State:** Number assigned to active project tenant (`Option B`). Confetti/warm success feedback.
7. **Next Steps:** Prompt routing setup.

---

## Theme 1: The "Office Desktop" Theme

### Conceptual Overview

A literal skeuomorphic desk metaphor. Instead of a sterile left-hand sidebar, the navigation items are represented as manila folders, sticky notes, and a notepad scattered across a desk mat. It feels deeply personal and approachable.

### Using the "Empty Space"

The right side of the screen is occupied by a "Corkboard Widget" displaying dynamic visual elements: missed calls represented as pinned notes, a calendar of upcoming Twilio renewals, and a coffee cup that doubles as a quick link to account settings.

### ASCII Wireframe

```text
+---------------------------------------------------------------------------------+
|                                                                                 |
|  [Notepad] (Active Setup Wizard)               [Corkboard]                      |
|  +---------------------------------+           +--------------------------+     |
|  | Provision Twilio Number         |           | * Missed Call: Bob       |     |
|  |                                 |           | * Billing Auto-renews    |     |
|  | > Area Code: [ 415 ]            |           +--------------------------+     |
|  |                                 |                                            |
|  | [ Search Available Numbers ]    |           [Sticky Note]                    |
|  +---------------------------------+           +-----------+                    |
|                                                | Finish    |                    |
|  /Folder 1/ (Numbers)                          | prompt    |                    |
|  /Folder 2/ (Flows)                            | setup!    |                    |
|                                                +-----------+                    |
|                                                                                 |
|                                                [Coffee Cup] (Settings)          |
+---------------------------------------------------------------------------------+
```

### Component Breakdown

- **DeskMat (Container):** Handles the background ivory/indigo gradient.
- **FolderTab (Nav):** Replaces traditional vertical sidebar items.
- **NotepadWizard (Main Content):** A glassmorphic card shaped like a notepad for multi-step flows.
- **CorkboardWidget (Right Column):** Displays alerts.
- **CoffeeCupSettings (Floating FAB):** Playful settings access point.

---

## Theme 2: The Retro Switchboard

### Conceptual Overview

A nostalgic 1950s operator switchboard experience. Charlotte is the "operator", and the UI reflects brass dials, tactile toggle switches, and satisfying mechanical feedback. This fits perfectly with the virtual receptionist persona.

### Using the "Empty Space"

The right empty space is transformed into a massive "Patch Bay". Users don't just assign prompts to phone numbers via a dropdown; they visually drag a "Patch Cable" from an active Twilio number on the left, to a glowing Prompt/Agent jack on the right.

### ASCII Wireframe

```text
+---------------------------------------------------------------------------------+
|  [DIALS: Vol, Tone]                  THE SWITCHBOARD                   [PWR]    |
|---------------------------------------------------------------------------------|
|  +-------------------------+      +------------------------------------------+  |
|  | ACTIVE LINES            |      |   CALL FLOW PATCH BAY                    |  |
|  |                         |      |                                          |  |
|  | (o) +1 (415) 555-0199   |====Cable====> [JACK] Standard Receptionist      |  |
|  |                         |      |                                          |  |
|  | ( ) +1 (212) 555-0200   |      |        [JACK] After-Hours Escalation     |  |
|  |                         |      |                                          |  |
|  | [ + Add New Line ]      |      |                                          |  |
|  +-------------------------+      +------------------------------------------+  |
+---------------------------------------------------------------------------------+
```

### Component Breakdown

- **SwitchboardChassis (Layout):** The main dark-mode indigo wrapper with subtle metallic highlights.
- **LineIndicatorLED (Status):** Glowing teal (`var(--accent-dark)`) indicator for active numbers.
- **PatchCableSVG (Interactive Tool):** An SVG canvas layer that draws a cubic bezier curve connecting two DOM elements.
- **PromptJack (Drop Target):** A stylized socket receiving the patch cable.
- **ToggleSwitch (Input):** Replaces standard checkboxes for settings.

---

## Theme 3: Holographic Assistant (Dynamic Companion)

### Conceptual Overview

This theme relies heavily on our premium "Warm Space" glassmorphism tokens but brings Charlotte to life as a dynamic, interactive presence. A stylized, glowing orb or friendly abstract shape (Holographic Charlotte) resides permanently in the UI.

### Using the "Empty Space"

The right column becomes the "Charlotte Companion Hub". While the user navigates complex tasks on the left, Charlotte hangs out on the right, providing conversational tips, displaying real-time audio visualizers when a call is happening, and offering to automate tasks ("Should I buy that number for you?").

### ASCII Wireframe

```text
+---------------------------------------------------------------------------------+
|  ~ Charlotte AI Console ~                                        [Profile]      |
|---------------------------------------------------------------------------------|
|  +---------------------------------+  +--------------------------------------+  |
|  | Quick Actions                   |  |          .  *  .                     |  |
|  | > Buy Twilio Number             |  |        *         *                   |  |
|  | > Edit Receptionist Prompt      |  |       .  (Charlotte) .               |  |
|  |                                 |  |        *         *                   |  |
|  | Recent Call Logs                |  |          '  *  '                     |  |
|  | - +1 (415) 555-1234 (2 min ago) |  |                                      |  |
|  | - +1 (212) 555-9876 (1 hr ago)  |  |  +--------------------------------+  |  |
|  +---------------------------------+  |  | "Hi! You have 2 missed calls.  |  |  |
|                                       |  |  Should I summarize them?"     |  |  |
|                                       |  +--------------------------------+  |  |
|                                       +--------------------------------------+  |
+---------------------------------------------------------------------------------+
```

### Component Breakdown

- **GlassCard (Wrapper):** `backdrop-filter: blur(12px)` on translucent warm cream.
- **OrbVisualizer (Canvas/WebGL):** A breathing animation representing Charlotte's state (Idle, Listening, Thinking, Speaking).
- **CompanionChatBubble (Contextual Help):** Dynamic micro-copy that updates based on the user's route or active step.
- **ActionList (Left Menu):** Clean, spacious list items for core functionalities.

---

## API Touchpoints

- `POST /api/twilio/provision` (Spins up Sub-Account Option B, buys number)
- `GET /api/twilio/available` (Fetches available numbers based on constraints)
- `PUT /api/prompts/update` (Updates the Gemini Live instructions)
- `GET /api/calls/logs` (Populates right-side widgets like Corkboard or Companion feed)

## State Requirements (Client-Side)

- `ThemeContext`: Toggles Light/Dark and active playful theme override.
- `useTwilioProvisioning()`: Manages the wizard step index (0-3), area code search term, selected number, and loading states.
- `useCharlotteCompanion()` (Theme 3 specific): Manages the conversational state, active contextual tip, and animation state of the orb.
- `usePatchBay()` (Theme 2 specific): Manages dragged coordinate states, active source (number ID), and target (prompt ID).
