import { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../domain/entities/Tenant.js';
import { User } from '../domain/entities/User.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';
import { authenticateToken } from '../middleware/auth.js';
import { UserApplicationService } from '../services/UserApplicationService.js';

export function createAuthRouter(em: EntityManager): Router {
  const router = Router();
  const userService = new UserApplicationService(em);

  /**
   * POST /api/auth/signup
   * Tenant Onboarding & Registration
   */
  router.post('/signup', async (req, res) => {
    try {
      const { email, password, tenantName, destinationNumber } = req.body;

      if (!email || !password || !tenantName || !destinationNumber) {
        res.status(400).json({ error: 'Missing required onboarding parameters.' });
        return;
      }

      const { token, tenant } = await userService.registerOnboarding(email, password, tenantName, destinationNumber);

      res.status(201).json({
        message: 'Onboarding registration completed successfully.',
        token,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          destinationNumber: tenant.destinationNumber,
          destinationVerified: tenant.destinationVerified
        }
      });
    } catch (error: any) {
      console.error('Error during onboarding registration:', error);
      const status = error.status || 500;
      res.status(status).json({ error: error.message || 'Internal server error occurred during tenant onboarding.' });
    }
  });

  /**
   * POST /api/auth/login
   * Multi-Tenant Secure Sign In
   */
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Missing email or password credentials.' });
        return;
      }

      const { token, user } = await userService.authenticateUser(email, password);

      res.status(200).json({
        message: 'Authentication successful.',
        token,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          destinationNumber: user.tenant.destinationNumber,
          destinationVerified: user.tenant.destinationVerified
        }
      });
    } catch (error: any) {
      console.error('Error during login authentication:', error);
      const status = error.status || 500;
      res.status(status).json({ error: error.message || 'Internal server error occurred during login.' });
    }
  });

  /**
   * POST /api/auth/verify-destination
   * Verified Forwarding Telephone Number SMS PIN (Guarded by authenticateToken)
   */
  router.post('/verify-destination', authenticateToken, async (req, res) => {
    try {
      const { pin } = req.body;

      if (!pin) {
        res.status(400).json({ error: 'Verification PIN is required.' });
        return;
      }

      // Standard mock validation: pin "1234" is accepted for testing
      if (pin !== '1234') {
        res.status(400).json({ error: 'Incorrect verification PIN.' });
        return;
      }

      // Run query inside localized RLS-guarded transaction block
      const result = await runInTenantTransaction(em, async (txEm) => {
        const tenantId = req.context?.tenantId;
        const tenant = await txEm.findOne<Tenant>(Tenant, { id: tenantId } as any);
        
        if (!tenant) {
          throw new Error('Tenant not found.');
        }

        tenant.updateDestination(tenant.destinationNumber, true);
        await txEm.flush();
        return tenant;
      });

      res.status(200).json({
        message: 'Forwarding destination phone number verified successfully.',
        tenant: {
          id: result.id,
          name: result.name,
          destinationNumber: result.destinationNumber,
          destinationVerified: result.destinationVerified
        }
      });
    } catch (error: any) {
      console.error('Error during destination verification:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred.' });
    }
  });

  /**
   * GET /api/auth/settings
   * Retrieve Tenant and User configurations
   */
  router.get('/settings', authenticateToken, async (req, res) => {
    try {
      const result = await runInTenantTransaction(em, async (txEm) => {
        const tenantId = req.context?.tenantId;
        const tenant = await txEm.findOne<Tenant>(Tenant, { id: tenantId } as any);
        if (!tenant) throw new Error('Tenant not found.');
        
        const userId = req.context?.userId;
        const user = await txEm.findOne<User>(User, { id: userId } as any, { populate: ['role'] as any });
        return { tenant, user };
      });

      res.status(200).json({
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          destinationNumber: result.tenant.destinationNumber,
          destinationVerified: result.tenant.destinationVerified
        },
        user: result.user ? {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role ? (result.user.role as any).type : null
        } : null
      });
    } catch (error: any) {
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
      const { name, destinationNumber } = req.body;

      if (!name || !destinationNumber) {
        res.status(400).json({ error: 'Tenant name and destination number are required.' });
        return;
      }

      // Run query inside localized RLS-guarded transaction block
      const result = await runInTenantTransaction(em, async (txEm) => {
        const tenantId = req.context?.tenantId;
        const tenant = await txEm.findOne<Tenant>(Tenant, { id: tenantId } as any);
        
        if (!tenant) {
          throw new Error('Tenant not found.');
        }

        const numberChanged = tenant.destinationNumber !== destinationNumber.trim();
        tenant.updateName(name.trim());
        tenant.updateDestination(destinationNumber.trim(), !numberChanged ? tenant.destinationVerified : false);
        
        await txEm.flush();
        return tenant;
      });

      res.status(200).json({
        message: 'Tenant settings updated successfully.',
        tenant: {
          id: result.id,
          name: result.name,
          destinationNumber: result.destinationNumber,
          destinationVerified: result.destinationVerified
        }
      });
    } catch (error: any) {
      console.error('Error updating tenant settings:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred.' });
    }
  });

  return router;
}
