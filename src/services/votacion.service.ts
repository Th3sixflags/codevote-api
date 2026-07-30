import * as repo from '../repositories/votacion.repository.js';
import type { FiltroCarrera } from '../repositories/votacion.repository.js';
import { HttpError } from '../utils/httpError.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
import { CrearVotacionDTO, ActualizarVotacionDTO } from '../schemas/votacion.schema.js';

export async function listarVotaciones() {
  return repo.findAll();
}

/** Devuelve la votación solo si su papeleta corresponde a quien consulta. */
export async function obtenerVotacion(id: number, filtro: FiltroCarrera = undefined) {
  const votacion = await repo.findById(id);
  if (!votacion) return null;
  if (!procesoVisible(votacion.fk_id_carrera, filtro)) return null;
  return votacion;
}

/** Papeletas del proceso visibles para quien consulta (ver FiltroCarrera). */
export async function listarPorProceso(procesoId: number, filtro: FiltroCarrera = undefined) {
  return repo.findByProceso(procesoId, filtro);
}

export async function crearVotacion(data: CrearVotacionDTO) {
  // No puede haber dos papeletas de la misma carrera en un mismo proceso.
  if (data.fk_id_carrera != null) {
    if (await repo.existeCarreraEnProceso(data.fk_id_proceso, data.fk_id_carrera)) {
      throw new HttpError(409, 'Ya existe una votación de esa carrera en este proceso electoral.');
    }
  }
  return repo.create(data);
}

export async function actualizarVotacion(id: number, data: ActualizarVotacionDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;

  // Al cambiar la carrera (o el proceso) se vuelve a comprobar la unicidad.
  const carreraFinal = data.fk_id_carrera !== undefined ? data.fk_id_carrera : existente.fk_id_carrera;
  const procesoFinal = data.fk_id_proceso ?? existente.id_proceso;
  if (carreraFinal != null) {
    if (await repo.existeCarreraEnProceso(procesoFinal, carreraFinal, id)) {
      throw new HttpError(409, 'Ya existe una votación de esa carrera en este proceso electoral.');
    }
  }

  return repo.update(id, data);
}

/**
 * Elimina la votación solo si no tiene actividad electoral. Con votos,
 * comprobantes, actas o veedurías se rechaza con 409 y el motivo: esa evidencia
 * debe conservarse (el proceso puede cancelarse o archivarse en su lugar).
 */
export async function eliminarVotacion(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;

  if (!existente.puede_eliminar) {
    throw new HttpError(409, `No se puede eliminar la votación. ${existente.motivo_bloqueo}`);
  }

  await repo.remove(id);
  return true;
}
