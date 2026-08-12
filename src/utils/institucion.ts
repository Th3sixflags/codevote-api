import { HttpError } from './httpError.js';

/**
 * Las altas administrativas deben quedar adscritas a la institución del JWT.
 * Un administrador normal siempre la tiene; el superadmin es global y debe usar
 * los flujos específicos de gestión de instituciones, no inventar un tenant en
 * el body de un CRUD institucional.
 */
export function institucionObligatoria(institucionId: number | undefined): number {
  if (!Number.isInteger(institucionId) || Number(institucionId) <= 0) {
    throw new HttpError(403, 'La operación requiere una institución asignada en la sesión.');
  }
  return Number(institucionId);
}

/** Solo el superadmin puede operar sin filtro institucional. */
export function institucionDeSesion(rol: string | undefined, institucionId: number | undefined) {
  return rol === 'superadmin' ? undefined : institucionObligatoria(institucionId);
}
