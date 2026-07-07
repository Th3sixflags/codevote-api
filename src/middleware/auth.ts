import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub:   string;
  email: string;
  rol:   'estudiante' | 'admin';
}

declare global {
  namespace Express {
    interface Request { user?: JwtPayload; }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado.' });
    return;
  }
  try {
    const token   = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol admin.' });
    return;
  }
  next();
}
