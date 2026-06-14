import { Router, Request, Response } from 'express';
import { IntegrationService } from '../services/IntegrationService.js';
import { authenticateToken } from '../middleware/auth.js';

export function createIntegrationsRouter(integrationService: IntegrationService): Router {
  const router = Router();

  router.get('/google/auth', authenticateToken, (req: Request, res: Response) => {
    const context = req.context;
    if (!context?.tenantId) {
      res.status(401).json({ error: 'Tenant context is missing.' });
      return;
    }
    
    try {
      const url = integrationService.generateAuthUrl(context.tenantId);
      res.json({ url });
    } catch (error: unknown) {
      console.error('Error generating Google auth URL:', error);
      res.status(500).json({ error: 'Failed to generate auth URL.' });
    }
  });

  router.post('/google/callback', async (req: Request, res: Response) => {
    const { code, state } = req.body;
    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state' });
      return;
    }

    try {
      await integrationService.exchangeToken(code as string, state as string);
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Google OAuth callback error', error);
      res.status(500).json({ error: 'OAuth callback failed' });
    }
  });

  router.get('/google/calendars', authenticateToken, async (req: Request, res: Response) => {
    try {
      const context = req.context;
      if (!context?.tenantId) {
        res.status(401).json({ error: 'Tenant context is missing.' });
        return;
      }
      
      const calendars = await integrationService.getCalendars(context.tenantId);
      res.json({ calendars });
    } catch (error: unknown) {
      console.error('Failed to fetch calendars', error);
      if (error instanceof Error && error.message === 'Google Calendar not connected') {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to fetch calendars' });
      }
    }
  });

  router.post('/google/calendars', authenticateToken, async (req: Request, res: Response) => {
    try {
      const { calendarId } = req.body;
      const context = req.context;
      
      if (!context?.tenantId) {
        res.status(401).json({ error: 'Tenant context is missing.' });
        return;
      }
      
      const tenantId = context.tenantId;
      
      if (!calendarId) {
        res.status(400).json({ error: 'Missing calendarId' });
        return;
      }
      
      await integrationService.updateGoogleCalendarId(tenantId, calendarId);
      
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Failed to update calendar', error);
      res.status(500).json({ error: 'Failed to update calendar' });
    }
  });

  return router;
}
