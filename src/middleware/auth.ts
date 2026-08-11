import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { esAdministracion } from '../utils/accesoCarrera.js';
import { pool } from '../config/database.js';

export interface JwtPayload {
  sub:   string;
  email: string;
  rol:   'estudiante' | 'admin' | 'candidato' | 'superadmin';
  fk_id_institucion?: number;
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
  // Se delega en esAdministracion() para que la definición de "administración"
  // sea la misma en todo el sistema (antes aquí era un literal suelto).
  if (!esAdministracion(req.user?.rol)) {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol admin.' });
    return;
  }
  next();
}

/**
 * Restringe el acceso al portal del candidato. Un estudiante normal (o
 * cualquier otro rol) recibe 403. El candidato conserva además el acceso a
 * las rutas de votación, que solo exigen autenticación.
 */
export function requireCandidato(req: Request, res: Response, next: NextFunction) {
  if (req.user?.rol !== 'candidato') {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol candidato.' });
    return;
  }
  next();
}

/**
 * Restringe la emisión del voto al padrón: estudiantes y candidatos.
 *
 * Competir no quita el derecho al voto, así que el candidato vota como
 * cualquiera. La administración sí queda fuera: no forma parte del padrón y
 * tampoco se la cuenta en `countHabilitados`, de modo que si pudiera votar la
 * participación pasaría del 100%.
 */
export function requireVotante(req: Request, res: Response, next: NextFunction) {
  if (esAdministracion(req.user?.rol)) {
    res.status(403).json({ error: 'La administración no emite votos: no forma parte del padrón electoral.' });
    return;
  }
  next();
}

/** Resultados públicos agregados: solo los estudiantes del padrón. */
export function requireEstudiante(req: Request, res: Response, next: NextFunction) {
  if (req.user?.rol !== 'estudiante') {
    res.status(403).json({ error: 'Estos resultados están disponibles únicamente para estudiantes.' });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.rol !== 'superadmin') {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol superadmin.' });
    return;
  }
  next();
}

/**
 * Garantiza que un admin solo acceda a recursos de su propia institución.
 * Superadmin pasa siempre. Compara req.user.fk_id_institucion con el
 * parámetro de la URL o del cuerpo de la petición.
 *
 * Se usa DESPUÉS de requireAuth + requireAdmin.
 */
export async function requireInstitutionAccess(req: Request, res: Response, next: NextFunction) {
  // Superadmin accede a todo
  if (req.user?.rol === 'superadmin') {
    next();
    return;
  }

  // Para admin/estudiante/candidato: debe tener institución asignada
  if (!req.user?.fk_id_institucion) {
    res.status(403).json({ error: 'Tu cuenta no tiene una institución asignada.' });
    return;
  }

  try {
    const [rows] = await pool.query('SELECT activo FROM institucion WHERE id_institucion = ?', [req.user.fk_id_institucion]) as [any[], any];
    if (rows.length === 0) {
      res.status(403).json({ error: 'Institución no encontrada.' });
      return;
    }
    if (!rows[0].activo) {
      res.status(403).json({ error: 'La institución se encuentra suspendida. No puedes operar en sus módulos.' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
