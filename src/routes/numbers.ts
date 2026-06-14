import { Router } from 'express';
import twilio from 'twilio';
import { NumberService } from '../services/NumberService.js';
import { authenticateToken } from '../middleware/auth.js';

// Setup Twilio Client with optional credentials check
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC') && !accountSid.startsWith('ACXX') && !accountSid.startsWith('AC000');
const twilioClient = isTwilioConfigured ? twilio(accountSid, authToken) : null;

export function createNumbersRouter(numberService: NumberService): Router {
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

      const results = await numberService.getProvisionedNumbers(tenantId);

      const mapped = results.map((num) => ({
        id: num.id,
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        createdAt: num.createdAt,
        updatedAt: num.updatedAt,
      }));

      res.status(200).json({ numbers: mapped });
    } catch (error: unknown) {
      console.error('Error fetching provisioned phone numbers:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred fetching numbers.' });
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

      if (!twilioClient) {
        res.status(503).json({ error: 'Real Twilio credentials (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN) are missing. Cannot assign a real number. Please update your environment variables.' });
        return;
      }

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
    } catch (error: unknown) {
      console.error('Error searching available phone numbers:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred searching numbers.' });
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

      if (!twilioClient) {
        res.status(503).json({ error: 'Real Twilio credentials (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN) are missing. Cannot assign a real number. Please update your environment variables.' });
        return;
      }

      const actualFriendlyName = friendlyName || `Charlotte Virtual Line - ${phoneNumber}`;

      // Programmatically buy the number on Twilio
      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const protocol = isSecure ? 'https' : 'http';
      const baseUrl = process.env.CHARLOTTE_API_BASE_URL || `${protocol}://${req.headers.host}`;
      
      await twilioClient.incomingPhoneNumbers.create({
        phoneNumber,
        friendlyName: actualFriendlyName,
        voiceUrl: `${baseUrl}/api/webhook/twilio/inbound-call`,
      });

      const result = await numberService.provisionNumber(tenantId, phoneNumber, actualFriendlyName);

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
    } catch (error: unknown) {
      console.error('Error provisioning phone number:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred during provisioning.' });
    }
  });

  return router;
}
