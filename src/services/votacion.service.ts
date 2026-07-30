import * as repo from '../repositories/votacion.repository.js';
import { HttpError } from '../utils/httpError.js';
import { CrearVotacionDTO, ActualizarVotacionDTO } from '../schemas/votacion.schema.js';

export async function listarVotaciones() {
  return repo.findAll();
}

export async function obtenerVotacion(id: number) {
  const votacion = await repo.findById(id);
  return votacion ?? null;
}

export async function listarPorProceso(procesoId: number) {
  return repo.findByProceso(procesoId);
}

export async function crearVotacion(data: CrearVotacionDTO) {
  return repo.create(data);
}

export async function actualizarVotacion(id: number, data: ActualizarVotacionDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
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
