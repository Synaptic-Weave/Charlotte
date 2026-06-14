import { EntityManager } from '@mikro-orm/postgresql';
import { Department } from '../domain/entities/Department.js';
import { Tenant } from '../domain/entities/Tenant.js';
import { runInTenantTransaction } from '../db/context.js';

export class VoiceToolService {
  constructor(private readonly em: EntityManager) {}

  async lookupDepartmentRoutingNumber(tenantId: string, departmentName: string): Promise<string | null> {
    return runInTenantTransaction(this.em, async (txEm) => {
      const dept = await txEm.findOne(Department, {
        name: { $ilike: departmentName } as unknown as string
      });
      return dept?.routingNumber || null;
    });
  }

  async listCalendarEvents(tenantId: string, timeMin: string, timeMax: string): Promise<unknown[]> {
    return runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (tenant && tenant.googleRefreshToken && tenant.googleCalendarId) {
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID || 'mock_client_id',
          process.env.GOOGLE_CLIENT_SECRET || 'mock_client_secret'
        );
        oauth2Client.setCredentials({ refresh_token: tenant.googleRefreshToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const response = await calendar.events.list({
          calendarId: tenant.googleCalendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
        });
        return response.data.items || [];
      }
      return [];
    });
  }
}
