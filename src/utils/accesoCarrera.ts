import { Request } from 'express';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import type { FiltroCarrera } from '../repositories/proceso_electoral.repository.js';

/**
 * Roles reales del sistema: son exactamente los del ENUM de `estudiante.rol`.
 *
 * Antes esta lista incluía 'administrador' y 'junta_electoral', que la base no
 * admite y por tanto nunca podían darse. Peor aún, la comprobación no era
 * uniforme: `requireAdmin` exigía el literal 'admin', así que esos roles
 * imaginarios habrían pasado unos controles y no otros. Si algún día se añade
 * un rol nuevo, va en el ENUM y aquí, y todo el sistema lo reconoce igual.
 */
export const ROLES = ['estudiante', 'admin', 'candidato'] as const;
export type Rol = (typeof ROLES)[number];

/** Roles con visibilidad total sobre todos los procesos y listas. */
const ROLES_ADMINISTRACION: readonly string[] = ['admin'];

export function esAdministracion(rol: unknown): boolean {
  return ROLES_ADMINISTRACION.includes(String(rol ?? '').toLowerCase());
}

/**
 * Filtro de carrera que corresponde a quien hace la petición:
 *  - administración -> undefined (sin filtro, ve todo).
 *  - estudiante     -> el id de su carrera, o null si no tiene ninguna.
 *
 * Se resuelve consultando la base porque el JWT solo lleva cédula, correo y rol.
 */
export async function filtroCarreraDe(req: Request): Promise<FiltroCarrera> {
  if (esAdministracion(req.user?.rol)) return undefined;
  return estudianteRepo.findCarreraId(req.user!.sub);
}

/**
 * ¿El proceso es visible/votable para ese filtro de carrera?
 * Los procesos globales (sin carrera) son para todos; los de representante de
 * carrera solo para estudiantes de esa carrera.
 */
export function procesoVisible(procesoCarrera: unknown, filtro: FiltroCarrera): boolean {
  if (filtro === undefined) return true;              // administración
  if (procesoCarrera == null) return true;            // proceso global
  return Number(procesoCarrera) === Number(filtro);
}
