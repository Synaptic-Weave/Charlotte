import { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Tenant } from '../domain/entities/Tenant.js';
import { User } from '../domain/entities/User.js';
import { Organization } from '../domain/entities/Organization.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';
import { authenticateToken } from '../middleware/auth.js';

import { requireEnv } from '../utils/env.js';

const JWT_SECRET = requireEnv('JWT_SECRET');

export function createAuthRouter(em: EntityManager): Router {
  const router = Router();

  /**
   * POST /api/auth/signup
   * Multi-Tenant Onboarding Endpoint
   */
  router.post('/signup', async (req, res) => {
    try {
      const { email, password, tenantName, destinationNumber } = req.body;

      if (!email || !password || !tenantName || !destinationNumber) {
        res.status(400).json({ error: 'Missing required onboarding parameters: email, password, tenantName, and destinationNumber are required.' });
        return;
      }

      const fork = em.fork();
      // Check if user already exists
      const existingUser = await fork.findOne<User>(User, { email: email.toLowerCase().trim() } as any);
      if (existingUser) {
        res.status(400).json({ error: 'An account with this email already exists.' });
        return;
      }

      // 1. Create a fresh Tenant entity (this generates a new UUID)
      const tenant = Tenant.create(tenantName.trim(), destinationNumber.trim());

      // 2. Hash user password
      const passwordHash = await bcrypt.hash(password, 12);

      // 3. Establish the thread-scoped tenant isolation context for RLS
      const context = { tenantId: tenant.id };
      
      await tenantLocalStorage.run(context, async () => {
        // 4. Run the persistence operations inside an atomic transaction enforcing RLS
        await runInTenantTransaction(em, async (txEm) => {
          // Persist the tenant
          txEm.persist(tenant);

          // Create and persist the user
          const user = User.create(tenant, email.toLowerCase().trim(), passwordHash, 'admin');
          txEm.persist(user);

          // Create and persist the organization
          const org = Organization.create(tenant, tenantName.trim());
          txEm.persist(org);
        });
      });

      // Generate credentials token for instant session onboarding
      const token = jwt.sign(
        {
          tenantId: tenant.id,
          userId: tenant.id, // User id isn't returned directly but is scoped in JWT
          role: 'admin'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

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
      res.status(500).json({ error: 'Internal server error occurred during tenant onboarding.' });
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

      const fork = em.fork();
      // Find user globally (emails are unique across the app)
      const user = await fork.findOne<User>(User, { email: email.toLowerCase().trim() } as any, { populate: ['tenant'] as any });
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password credentials.' });
        return;
      }

      // Match password credentials
      const matches = await bcrypt.compare(password, user.passwordHash);
      if (!matches) {
        res.status(401).json({ error: 'Invalid email or password credentials.' });
        return;
      }

      // Build active JWT Bearer Token
      const token = jwt.sign(
        {
          tenantId: user.tenant.id,
          userId: user.id,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

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
      res.status(500).json({ error: 'Internal server error occurred during login.' });
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
