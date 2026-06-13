import { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../domain/entities/Tenant.js';
import { CallSession } from '../domain/entities/CallSession.js';
import { runInTenantTransaction } from '../db/context.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcastDashboardUpdate } from './streams.js';

function formatTime(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const d = new Date(date);
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (d >= today) {
    return `Today, ${timeStr}`;
  } else if (d >= yesterday) {
    return `Yesterday, ${timeStr}`;
  } else {
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  }
}

function formatDuration(createdAt: Date, updatedAt: Date, status: string): string {
  if (status === 'initiated' || status === 'active') {
    return 'Streaming';
  }
  const ms = updatedAt.getTime() - createdAt.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 1) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

export function createCallsRouter(em: EntityManager): Router {
  const router = Router();

  /**
   * GET /api/tenants/calls/
   * Guarded by authenticateToken
   * Retrieve all historical and active call sessions for the tenant
   */
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant context is missing from token session.' });
        return;
      }

      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 15;
      const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;

      const result = await runInTenantTransaction(em, async (txEm) => {
        const [callSessions, count] = await txEm.findAndCount(
          CallSession,
          { tenant: { id: tenantId } },
          {
            orderBy: { createdAt: 'DESC' },
            limit: isNaN(limit) ? 15 : limit,
            offset: isNaN(offset) ? 0 : offset,
          }
        );

        const mapped = callSessions.map((session) => ({
          id: session.id,
          caller: session.callerNumber,
          phone: session.callerNumber,
          time: formatTime(session.createdAt),
          duration: formatDuration(session.createdAt, session.updatedAt, session.status),
          status: session.status === 'active' || session.status === 'initiated' ? 'active' : 'completed',
          messages: session.messages || [],
        }));

        return {
          calls: mapped,
          total: count,
          hasMore: (isNaN(offset) ? 0 : offset) + callSessions.length < count,
        };
      });

      res.status(200).json(result);
    } catch (error: unknown) {
      console.error('Error fetching call sessions:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred fetching calls.' });
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

      const stats = await runInTenantTransaction(em, async (txEm) => {
        const callSessions = await txEm.find(CallSession, { tenant: { id: tenantId } });
        
        const totalCalls = callSessions.length;
        
        // Calculate average duration in seconds
        const completedCalls = callSessions.filter(c => c.status === 'completed');
        let totalDurationMs = 0;
        completedCalls.forEach(c => {
          totalDurationMs += c.updatedAt.getTime() - c.createdAt.getTime();
        });
        
        const avgDurationSeconds = completedCalls.length > 0 
          ? Math.round((totalDurationMs / completedCalls.length) / 1000) 
          : 0;

        // Calculate Answer Rate: percentage of connected (active/completed) calls vs total calls
        const initiatedCount = callSessions.filter(c => c.status === 'initiated').length;
        const answeredCount = totalCalls - initiatedCount;
        const answerRate = totalCalls > 0 
          ? Math.round((answeredCount / totalCalls) * 1000) / 10 
          : 100.0;

        return {
          totalCalls,
          avgDurationSeconds,
          answerRate,
        };
      });

      res.status(200).json(stats);
    } catch (error: unknown) {
      console.error('Error fetching call stats:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred fetching stats.' });
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

      const session = await runInTenantTransaction(em, async (txEm) => {
        const tenant = await txEm.findOne(Tenant, { id: tenantId } as never);
        if (!tenant) {
          throw new Error('Tenant organization not found.');
        }

        const actualCallSid = callSid || `mock-sid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const callSession = CallSession.create(tenant, actualCallSid, callerNumber || 'Unknown');
        txEm.persist(callSession);
        await txEm.flush();
        return callSession;
      });

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
      res.status(500).json({ error: error.message || 'Internal server error occurred creating call.' });
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

      const result = await runInTenantTransaction(em, async (txEm) => {
        const callSession = await txEm.findOne(CallSession, { id });
        if (!callSession) {
          throw new Error('Call session not found.');
        }

        const timeStr = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const newMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          speaker,
          text,
          timestamp: timeStr,
        };

        callSession.addMessage(newMsg);
        txEm.persist(callSession);
        await txEm.flush();
        return callSession;
      });

      broadcastDashboardUpdate(tenantId, { event: 'calls_updated' });

      res.status(200).json({
        message: 'Transcript message added successfully.',
        messages: result.messages,
      });
    } catch (error: unknown) {
      console.error('Error adding transcript message:', error);
      res.status(500).json({ error: error.message || 'Internal server error occurred adding message.' });
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

      const result = await runInTenantTransaction(em, async (txEm) => {
        const callSession = await txEm.findOne(CallSession, { id });
        if (!callSession) {
          throw new Error('Call session not found.');
        }

        if (status) {
          callSession.updateStatus(status);
        }
        if (streamSid) {
          callSession.updateStreamSid(streamSid);
        }

        txEm.persist(callSession);
        await txEm.flush();
        return callSession;
      });

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
      res.status(500).json({ error: error.message || 'Internal server error occurred updating call.' });
    }
  });

  return router;
}
