import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/AuthService.js';
import { authenticateToken } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-123';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/auth/register
   * Multi-Tenant Registration Onboarding
   */
  router.post('/register', async (req, res) => {
    try {
      const { tenantName, destinationNumber, email, password } = req.body;

      if (!tenantName || !destinationNumber || !email || !password) {
        res.status(400).json({ error: 'All fields are required.' });
        return;
      }

      // Check if user already exists
      const existingUser = await authService.findUserByEmail(email.toLowerCase().trim());
      if (existingUser) {
        res.status(400).json({ error: 'An account with this email already exists.' });
        return;
      }

      // Hash user password
      const passwordHash = await bcrypt.hash(password, 12);

      const { tenant, token } = await authService.registerUser(
        tenantName.trim(),
        destinationNumber.trim(),
        email.toLowerCase().trim(),
        passwordHash
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
    } catch (error: unknown) {
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

      // Find user globally
      const user = await authService.findUserByEmail(email.toLowerCase().trim());
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
    } catch (error: unknown) {
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

      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const result = await authService.verifyDestination(tenantId);

      res.status(200).json({
        message: 'Forwarding destination phone number verified successfully.',
        tenant: {
          id: result.id,
          name: result.name,
          destinationNumber: result.destinationNumber,
          destinationVerified: result.destinationVerified
        }
      });
    } catch (error: unknown) {
      console.error('Error during destination verification:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred.' });
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
        res.status(401).json({ error: 'Missing context' });
        return;
      }

      const result = await authService.getSettings(tenantId, userId);

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
          role: result.user.role
        } : null
      });
    } catch (error: unknown) {
      console.error('Error fetching tenant settings:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred.' });
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

      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const result = await authService.updateSettings(tenantId, name.trim(), destinationNumber.trim());

      res.status(200).json({
        message: 'Tenant settings updated successfully.',
        tenant: {
          id: result.id,
          name: result.name,
          destinationNumber: result.destinationNumber,
          destinationVerified: result.destinationVerified
        }
      });
    } catch (error: unknown) {
      console.error('Error updating tenant settings:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred.' });
    }
  });

  return router;
}
