import { Router } from 'express';
import { EntityManager } from '@mikro-orm/core';
import { google } from 'googleapis';
import { Tenant } from '../domain/entities/Tenant.js';
import { authenticateToken } from '../middleware/auth.js';

export function createIntegrationsRouter(em: EntityManager): Router {
  const router = Router();

  const getOauth2Client = () => {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID || 'mock_client_id',
      process.env.GOOGLE_CLIENT_SECRET || 'mock_client_secret',
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google/callback'
    );
  };

  router.get('/google/auth', authenticateToken, (req, res) => {
    const context = req.context;
    const oauth2Client = getOauth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
      state: context!.tenantId,
    });
    res.json({ url });
  });

  router.post('/google/callback', async (req, res) => {
    const { code, state } = req.body;
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    try {
      const tenantId = state;
      const oauth2Client = getOauth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      
      if (tokens.refresh_token) {
        const tenant = await em.findOne(Tenant, { id: tenantId });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        
        tenant.googleRefreshToken = tokens.refresh_token;
        await em.flush();
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Google OAuth callback error', error);
      res.status(500).json({ error: 'OAuth callback failed' });
    }
  });

  router.get('/google/calendars', authenticateToken, async (req, res) => {
    const context = req.context;
    const tenantId = context!.tenantId;
    const tenant = await em.findOne(Tenant, { id: tenantId });
    if (!tenant || !tenant.googleRefreshToken) {
      return res.status(400).json({ error: 'Google Calendar not connected' });
    }

    try {
      const oauth2Client = getOauth2Client();
      oauth2Client.setCredentials({ refresh_token: tenant.googleRefreshToken });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const response = await calendar.calendarList.list();
      res.json({ calendars: response.data.items || [] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch calendars' });
    }
  });

  router.post('/google/calendars', authenticateToken, async (req, res) => {
    const { calendarId } = req.body;
    const context = req.context;
    const tenantId = context!.tenantId;
    
    if (!calendarId) return res.status(400).json({ error: 'Missing calendarId' });
    
    const tenant = await em.findOne(Tenant, { id: tenantId });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    
    tenant.googleCalendarId = calendarId;
    await em.flush();
    res.json({ success: true });
  });

  return router;
}
