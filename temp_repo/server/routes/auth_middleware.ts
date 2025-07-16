import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if user is authenticated
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  
  res.status(401).json({ error: 'Not authenticated' });
}