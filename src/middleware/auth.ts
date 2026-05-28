import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { tenantLocalStorage, TenantContext } from '../db/context.js';

// Extend Express Request interface to include context
declare global {
  namespace Express {
    interface Request {
      context?: TenantContext;
    }
  }
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} environment variable is required`);
  return val;
}
const JWT_SECRET = requireEnv('JWT_SECRET');

/**
 * Express middleware to authenticate users via JWT and scope the current execution thread
 * with the correct tenant context.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    res.status(401).json({ error: 'Authentication token is required.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired authentication token.' });
      return;
    }

    const payload = decoded as jwt.JwtPayload & {
      tenantId: string;
      userId: string;
      role: string;
    };

    if (!payload.tenantId || !payload.userId) {
      res.status(403).json({ error: 'Token is missing tenant or user claim attributes.' });
      return;
    }

    const context: TenantContext = {
      tenantId: payload.tenantId,
      userId: payload.userId,
      role: payload.role,
    };

    // Attach to Request object for easy access
    req.context = context;

    // Run the rest of the middleware chain and route inside the tenantLocalStorage scope
    tenantLocalStorage.run(context, () => {
      next();
    });
  });
}
