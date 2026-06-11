import { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import twilio from 'twilio';
import { Tenant } from '../domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';
import { runInTenantTransaction } from '../db/context.js';
import { authenticateToken } from '../middleware/auth.js';

// Setup Twilio Client with optional credentials check
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC') && !accountSid.startsWith('ACXX') && !accountSid.startsWith('AC000');
const twilioClient = isTwilioConfigured ? twilio(accountSid as string, authToken as string) : null;

export function createNumbersRouter(em: EntityManager): Router {
  const router = Router();

  /**
   * GET /api/tenants/numbers/
   * Guarded by authenticateToken
   * Retrieve all provisioned phone numbers for the tenant
   */
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const results = await runInTenantTransaction(em, async (txEm) => {
        const phoneNumbers = await txEm.find(TwilioPhoneNumber, { tenant: { id: tenantId } } as any);
        return phoneNumbers.map((num) => ({
          id: num.id,
          phoneNumber: num.phoneNumber,
          friendlyName: num.friendlyName,
          createdAt: num.createdAt,
          updatedAt: num.updatedAt,
        }));
      });

      res.status(200).json({ numbers: results });
    } catch (error: any) {
      console.error('Error fetching provisioned phone numbers:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred fetching numbers.' });
    }
  });

  /**
   * GET /api/tenants/numbers/search
   * Guarded by authenticateToken
   * Search for available phone numbers matching an areaCode query parameter
   */
  router.get('/search', authenticateToken, async (req, res) => {
    try {
      const areaCode = (req.query.areaCode as string) || '512';

      if (!/^\d{3}$/.test(areaCode)) {
        res.status(400).json({ error: 'Area code must be a 3-digit number.' });
        return;
      }

      if (twilioClient) {
        // Query the real Twilio API
        const availableNumbers = await twilioClient.availablePhoneNumbers('US').local.list({
          areaCode: Number(areaCode),
          limit: 10,
        });

        const results = availableNumbers.map((num) => ({
          phoneNumber: num.phoneNumber,
          friendlyName: num.friendlyName || num.phoneNumber,
          locality: num.locality || 'Unknown',
          region: num.region || 'US',
        }));

        res.status(200).json({ numbers: results, mode: 'live' });
      } else {
        // Mock fallback for sandbox/testing
        const mockResults = Array.from({ length: 10 }).map((_, index) => {
          const suffix = String(1000 + index).substring(1);
          const rawNumber = `+1${areaCode}55501${suffix}`;
          const formattedNumber = `(${areaCode}) 555-01${suffix}`;
          return {
            phoneNumber: rawNumber,
            friendlyName: formattedNumber,
            locality: 'Austin',
            region: 'TX',
          };
        });

        res.status(200).json({ numbers: mockResults, mode: 'mock' });
      }
    } catch (error: any) {
      console.error('Error searching available phone numbers:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred searching numbers.' });
    }
  });

  /**
   * POST /api/tenants/numbers/provision
   * Guarded by authenticateToken
   * Provisions a selected number, registers a Twilio web hook, and stores it in DB
   */
  router.post('/provision', authenticateToken, async (req, res) => {
    try {
      const { phoneNumber, friendlyName } = req.body;

      if (!phoneNumber) {
        res.status(400).json({ error: 'phoneNumber is required for provisioning.' });
        return;
      }

      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      // Execute database operations inside of an RLS-bound transaction
      const result = await runInTenantTransaction(em, async (txEm) => {
        // Fetch Tenant record securely
        const tenant = await txEm.findOne<Tenant>(Tenant, { id: tenantId } as any);
        if (!tenant) {
          throw new Error('Tenant organization not found.');
        }

        let actualFriendlyName = friendlyName || `Charlotte Virtual Line - ${phoneNumber}`;

        if (twilioClient) {
          // Programmatically buy the number on Twilio
          const baseUrl = process.env.CHARLOTTE_API_BASE_URL || 'https://localhost:8080';
          await twilioClient.incomingPhoneNumbers.create({
            phoneNumber,
            friendlyName: actualFriendlyName,
            voiceUrl: `${baseUrl}/api/webhook/twilio/inbound-call`,
          });
        }

        // Instantiate and persist the TwilioPhoneNumber entity
        const twilioPhone = TwilioPhoneNumber.create(tenant, phoneNumber, actualFriendlyName);
        txEm.persist(twilioPhone);
        await txEm.flush();

        return twilioPhone;
      });

      res.status(201).json({
        message: 'Phone number provisioned and registered successfully.',
        twilioPhoneNumber: {
          id: result.id,
          phoneNumber: result.phoneNumber,
          friendlyName: result.friendlyName,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        },
      });
    } catch (error: any) {
      console.error('Error provisioning phone number:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred during provisioning.' });
    }
  });

  return router;
}
