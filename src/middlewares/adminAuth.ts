import { Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.js';

export const adminAuth = [
  authenticateToken,
  (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.context?.role;
    if (userRole !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden: SuperAdmin access required.' });
      return;
    }
    next();
  }
];
