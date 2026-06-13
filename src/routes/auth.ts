import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { UserApplicationService } from '../services/UserApplicationService.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantName: z.string().min(1),
  destinationNumber: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyDestinationSchema = z.object({
  pin: z.string().min(1),
});

const updateSettingsSchema = z.object({
  name: z.string().min(1),
  destinationNumber: z.string().min(1),
});

export function createAuthRouter(userService: UserApplicationService): Router {
  const router = Router();

  /**
   * POST /api/auth/signup
   * Multi-Tenant Onboarding Endpoint
   */
  router.post('/signup', async (req, res) => {
    try {
      const parseResult = signupSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Missing required onboarding parameters: email, password, tenantName, and destinationNumber are required.' });
        return;
      }

      const result = await userService.createUser(parseResult.data);
      res.status(201).json({
        message: 'Onboarding registration completed successfully.',
        ...result
      });
    } catch (error: unknown) {
      console.error('Error during onboarding registration:', error);
      const status = error.status || (error.message.includes('exists') ? 400 : 500);
      res.status(status).json({ error: error.message || 'Internal server error occurred during tenant onboarding.' });
    }
  });

  /**
   * POST /api/auth/login
   * Multi-Tenant Secure Sign In
   */
  router.post('/login', async (req, res) => {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Missing email or password credentials.' });
        return;
      }

      const result = await userService.authenticateUser(parseResult.data);
      res.status(200).json({
        message: 'Authentication successful.',
        ...result
      });
    } catch (error: unknown) {
      console.error('Error during login authentication:', error);
      const status = error.status || (error.message.includes('Invalid') ? 401 : 500);
      res.status(status).json({ error: error.message || 'Internal server error occurred during login.' });
    }
  });

  /**
   * POST /api/auth/verify-destination
   * Verified Forwarding Telephone Number SMS PIN (Guarded by authenticateToken)
   */
  router.post('/verify-destination', authenticateToken, async (req, res) => {
    try {
      const parseResult = verifyDestinationSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Verification PIN is required.' });
        return;
      }

      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized: missing tenant context.' });
        return;
      }

      const result = await userService.verifyDestination(tenantId, parseResult.data.pin);
      res.status(200).json({
        message: 'Forwarding destination phone number verified successfully.',
        tenant: result
      });
    } catch (error: unknown) {
      console.error('Error during destination verification:', error);
      const status = error.status || (error.message.includes('Incorrect') ? 400 : 500);
      res.status(status).json({ error: error.message || 'Internal server error occurred.' });
    }
  });

  /**
   * GET /api/auth/settings
   * Retrieve Tenant and User configurations
   */
  router.get('/settings', authenticateToken, async (req, res) => {
    try {
      const tenantId = req.context?.tenantId;
      const userId = req.context?.userId;
      
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Unauthorized: missing context.' });
        return;
      }

      const result = await userService.getSettings(tenantId, userId);
      res.status(200).json(result);
    } catch (error: unknown) {
      console.error('Error fetching tenant settings:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred.' });
    }
  });

  /**
   * PUT /api/auth/settings
   * Update Tenant configurations (name, destinationNumber)
   */
  router.put('/settings', authenticateToken, async (req, res) => {
    try {
      const parseResult = updateSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Tenant name and destination number are required.' });
        return;
      }

      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized: missing tenant context.' });
        return;
      }

      const result = await userService.updateSettings(tenantId, parseResult.data);
      res.status(200).json({
        message: 'Tenant settings updated successfully.',
        tenant: result
      });
    } catch (error: unknown) {
      console.error('Error updating tenant settings:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred.' });
    }
  });

  return router;
}
