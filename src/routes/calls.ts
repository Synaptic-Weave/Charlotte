import { Router } from 'express';
import { CallSessionService } from '../services/CallSessionService.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcastDashboardUpdate } from './streams.js';

// Helper to format timestamps gracefully
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(date);
}

// Helper to calculate call duration gracefully
function formatDuration(start: Date, end: Date, status: string): string {
  if (status === 'active' || status === 'initiated') return 'Streaming';
  const durationMs = end.getTime() - start.getTime();
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function createCallsRouter(callSessionService: CallSessionService): Router {
  const router = Router();

  /**
   * GET /api/tenants/calls
   * Guarded by authenticateToken
   * Retrieve tenant-scoped call history
   */
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const limit = parseInt(req.query.limit as string, 10);
      const offset = parseInt(req.query.offset as string, 10);
      
      const queryLimit = isNaN(limit) ? 15 : limit;
      const queryOffset = isNaN(offset) ? 0 : offset;

      const { callSessions, count } = await callSessionService.getCalls(tenantId, queryLimit, queryOffset);

      const mapped = callSessions.map((session) => ({
        id: session.id,
        caller: session.callerNumber,
        phone: session.callerNumber,
        time: formatTime(session.createdAt),
        duration: formatDuration(session.createdAt, session.updatedAt, session.status),
        status: session.status === 'active' || session.status === 'initiated' ? 'active' : 'completed',
        messages: session.messages || [],
      }));

      res.status(200).json({
        calls: mapped,
        total: count,
        hasMore: queryOffset + callSessions.length < count,
      });
    } catch (error: unknown) {
      console.error('Error fetching call sessions:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred fetching calls.' });
    }
  });

  /**
   * GET /api/tenants/calls/stats
   * Guarded by authenticateToken
   * Retrieve real-time, tenant-scoped call metrics from the database
   */
  router.get('/stats', authenticateToken, async (req, res) => {
    try {
      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const stats = await callSessionService.getCallStats(tenantId);
      res.status(200).json(stats);
    } catch (error: unknown) {
      console.error('Error fetching call stats:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred fetching stats.' });
    }
  });

  /**
   * POST /api/tenants/calls/
   * Guarded by authenticateToken
   * Create a new manual/simulated call session for the tenant
   */
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const { callSid, callerNumber } = req.body;
      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const session = await callSessionService.createCall(tenantId, callSid, callerNumber);

      broadcastDashboardUpdate(tenantId, { event: 'calls_updated' });

      res.status(201).json({
        message: 'Call session created successfully.',
        call: {
          id: session.id,
          caller: session.callerNumber,
          phone: session.callerNumber,
          time: formatTime(session.createdAt),
          duration: 'Streaming',
          status: 'active',
          messages: [],
        },
      });
    } catch (error: unknown) {
      console.error('Error creating call session:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred creating call.' });
    }
  });

  /**
   * POST /api/tenants/calls/:id/messages
   * Guarded by authenticateToken
   * Append a transcription message to a call session's transcript
   */
  router.post('/:id/messages', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { speaker, text, timestamp } = req.body;
      const tenantId = req.context?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      if (!speaker || !text) {
        res.status(400).json({ error: 'speaker and text are required fields.' });
        return;
      }

      const result = await callSessionService.addMessageToSessionById(id, speaker, text, timestamp);

      broadcastDashboardUpdate(tenantId, { event: 'calls_updated' });

      res.status(200).json({
        message: 'Transcript message added successfully.',
        messages: result.messages,
      });
    } catch (error: unknown) {
      console.error('Error adding transcript message:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred adding message.' });
    }
  });

  /**
   * PUT /api/tenants/calls/:id
   * Guarded by authenticateToken
   * Update status or streamSid of an active call session
   */
  router.put('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, streamSid } = req.body;
      const tenantId = req.context?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const result = await callSessionService.updateCallSessionById(id, status, streamSid);

      broadcastDashboardUpdate(tenantId, { event: 'calls_updated' });

      res.status(200).json({
        message: 'Call session updated successfully.',
        call: {
          id: result.id,
          caller: result.callerNumber,
          phone: result.callerNumber,
          time: formatTime(result.createdAt),
          duration: formatDuration(result.createdAt, result.updatedAt, result.status),
          status: result.status === 'active' || result.status === 'initiated' ? 'active' : 'completed',
          messages: result.messages || [],
        },
      });
    } catch (error: unknown) {
      console.error('Error updating call session:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error occurred updating call.' });
    }
  });

  return router;
}
