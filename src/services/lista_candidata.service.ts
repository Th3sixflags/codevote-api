import * as repo from '../repositories/lista_candidata.repository.js';
import type { FiltroCarrera } from '../repositories/lista_candidata.repository.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
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

export async function crearLista(data: CrearListaDTO) {
  return repo.create(data);
}

export async function actualizarLista(id: number, data: ActualizarListaDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
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
