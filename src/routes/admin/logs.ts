import { Router, Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { Logging } from '@google-cloud/logging';

export function createAdminLogsRouter(em: EntityManager): Router {
  const router = Router();
  const logging = new Logging();

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    // Establish Server-Sent Events (SSE) connection
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send an initial keep-alive comment to ensure connection is open
    res.write(':\n\n');

    // Keep-alives to bypass Cloud Run connection timeout limits
    const keepAliveInterval = setInterval(() => {
      res.write(':\n\n');
    }, 30000);

    let stream: NodeJS.ReadableStream | any;

    try {
      // Stream all logs, or filter by specific resources if needed
      stream = logging.tailEntries({
        // For example, you can add filters here:
        // filter: 'resource.type="cloud_run_revision"'
      });

      stream.on('data', (entry: any) => {
        res.write(`event: log\n`);
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      });

      stream.on('error', (err: any) => {
        console.error('TailEntries error:', err);
        // Do not necessarily close the connection, maybe just log it.
        // If it's a fatal error, close:
        if (!res.closed) {
          res.end();
        }
      });

      stream.on('end', () => {
        if (!res.closed) {
          res.end();
        }
      });

    } catch (err) {
      console.error('Error starting log stream:', err);
      if (!res.closed) {
        res.end();
      }
    }

    req.on('close', () => {
      clearInterval(keepAliveInterval);
      if (stream && typeof stream.destroy === 'function') {
        stream.destroy();
      } else if (stream && stream.end) {
        stream.end();
      }
    });
  });

  return router;
}
