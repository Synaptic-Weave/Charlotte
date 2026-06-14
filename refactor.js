const fs = require('fs');

let content = fs.readFileSync('src/routes/streams.ts', 'utf8');

// Remove direct EM imports
content = content.replace("import { EntityManager } from '@mikro-orm/postgresql';", "");
content = content.replace("import { Tenant } from '../domain/entities/Tenant.js';", "");
content = content.replace("import { CallSession } from '../domain/entities/CallSession.js';", "");
content = content.replace("import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';", "");
content = content.replace("import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';", "import { tenantLocalStorage } from '../db/context.js';\nimport { CallSessionService } from '../services/CallSessionService.js';\nimport { VoiceToolService } from '../services/VoiceToolService.js';");

// broadcastDashboardUpdate types
content = content.replace("payload: any", "payload: unknown");

// Function signature
content = content.replace(
  "export function registerStreamHandler(wss: WebSocketServer, em: EntityManager): void {",
  "export function registerStreamHandler(wss: WebSocketServer, callSvc: CallSessionService, toolSvc: VoiceToolService): void {"
);

content = content.replace("let geminiSession: any = null;", "let geminiSession: unknown = null;");
content = content.replace("as any", "as unknown as Record<string, unknown>"); // A naive fix, we'll fix up specific `any` later.

// Wait, doing this via regex might break things horribly. Let me just write the file chunks.
