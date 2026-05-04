import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export const JWT_SECRET = process.env.JWT_SECRET || 'dash-engage-dev-secret';

export interface AuthRequest extends Request {
  userEmail?: string;
  isAdmin?: boolean;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Token ausente' }); return; }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string; isAdmin: boolean };
    req.userEmail = decoded.email;
    req.isAdmin = decoded.isAdmin;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.isAdmin) { res.status(403).json({ error: 'Acesso negado. Apenas administradores.' }); return; }
  next();
}
