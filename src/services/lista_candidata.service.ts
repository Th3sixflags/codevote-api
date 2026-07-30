import * as repo from '../repositories/lista_candidata.repository.js';
import * as votacionRepo from '../repositories/votacion.repository.js';
import * as borradoRepo from '../repositories/borrado.repository.js';
import type { FiltroCarrera } from '../repositories/lista_candidata.repository.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
import { HttpError } from '../utils/httpError.js';
import { CrearListaDTO, ActualizarListaDTO } from '../schemas/lista_candidata.schema.js';

// Las listas de un proceso de carrera solo se devuelven a estudiantes de esa
// carrera; la administración las ve todas.
export async function listarListas(filtro: FiltroCarrera = undefined) {
  return repo.findAll(filtro);
}

export async function obtenerLista(id: number, filtro: FiltroCarrera = undefined) {
  const lista = await repo.findById(id);
  if (!lista) return null;
  if (!procesoVisible(lista.carrera_proceso, filtro)) return null;
  return lista;
}

export async function listarPorProceso(procesoId: number, filtro: FiltroCarrera = undefined) {
  return repo.findByProceso(procesoId, filtro);
}

/**
 * Crea una lista dentro de una papeleta. El proceso se deriva de la votación,
 * así la lista nunca queda asociada a un proceso que no corresponde.
 */
export async function crearLista(data: CrearListaDTO) {
  const votacion = await votacionRepo.findById(data.fk_id_votacion);
  if (!votacion) throw new HttpError(404, 'La votación indicada no existe.');
  return repo.create(data, votacion.id_proceso);
}

/** Listas que compiten en una papeleta (filtradas por carrera de quien consulta). */
export async function listarPorVotacion(votacionId: number, filtro: FiltroCarrera = undefined) {
  return repo.findByVotacion(votacionId, filtro);
}

export async function actualizarLista(id: number, data: ActualizarListaDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

/**
 * Elimina la lista definitivamente, pero SOLO si es un borrador sin votos.
 * Si ya recibió votos se rechaza con 409: es evidencia electoral y corresponde
 * retirarla. Si es borrador, se limpian en una transacción sus dependencias de
 * preparación: validaciones de requisitos, candidatos y planes de trabajo.
 */
export async function eliminarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;

  if (!existente.puede_eliminar) {
    throw new HttpError(409, `No se puede eliminar la lista. ${existente.motivo_bloqueo}`);
  }

  await borradoRepo.eliminarListaEnCascada(id);
  return true;
}

// --- Revisión administrativa ----------------------------------------------
// Una lista relacionada (candidatos, planes, votos, auditoría) nunca se borra
// físicamente: se retira (soft-delete) para conservar el historial. El DELETE
// físico solo prospera para listas nuevas sin relaciones (si tiene relaciones,
// el errorHandler traduce la FK a 409).

export async function aprobarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.setEstadoRevision(id, 'aprobada', null);
}

export async function rechazarLista(id: number, motivo: string) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.setEstadoRevision(id, 'rechazada', motivo);
}

export async function retirarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.setEstadoRevision(id, 'retirada', existente.motivo_rechazo ?? null);
}
