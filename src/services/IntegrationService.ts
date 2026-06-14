import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../domain/entities/Tenant.js';
import { runInTenantTransaction } from '../db/context.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-123';

export class IntegrationService {
  private getOauth2Client() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID || 'mock_client_id',
      process.env.GOOGLE_CLIENT_SECRET || 'mock_client_secret',
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google/callback'
    );
  }

  generateAuthUrl(tenantId: string): string {
    const oauth2Client = this.getOauth2Client();
    const token = jwt.sign({ tenantId }, JWT_SECRET, { expiresIn: '15m' });
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
      state: token,
    });
  }

  async exchangeToken(code: string, state: string): Promise<void> {
    const decoded = jwt.verify(state, JWT_SECRET) as { tenantId: string };
    const tenantId = decoded.tenantId;

    const oauth2Client = this.getOauth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      await this.updateGoogleRefreshToken(tenantId, tokens.refresh_token);
    }
  }

  async getCalendars(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant.googleRefreshToken) {
      throw new Error('Google Calendar not connected');
    }

    const oauth2Client = this.getOauth2Client();
    oauth2Client.setCredentials({ refresh_token: tenant.googleRefreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.calendarList.list();
    return response.data.items || [];
  }

  constructor(private readonly em: EntityManager) {}

  async updateGoogleRefreshToken(tenantId: string, refreshToken: string): Promise<void> {
    await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant not found');
      
      tenant.googleRefreshToken = refreshToken;
      txEm.persist(tenant);
      await txEm.flush();
    });
  }

  async getTenant(tenantId: string): Promise<Tenant> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant not found');
      return tenant;
    });
  }

  async updateGoogleCalendarId(tenantId: string, calendarId: string): Promise<void> {
    await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant not found');
      
      tenant.googleCalendarId = calendarId;
      txEm.persist(tenant);
      await txEm.flush();
    });
  }
}
