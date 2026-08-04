import * as repo from '../repositories/proceso_electoral.repository.js';
import * as archivadoRepo from '../repositories/archivado.repository.js';
import * as borradoRepo from '../repositories/borrado.repository.js';
import type { FiltroCarrera } from '../repositories/proceso_electoral.repository.js';
import * as notificaciones from './notificacion.service.js';
import { HttpError } from '../utils/httpError.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
import { CrearProcesoDTO, ActualizarProcesoDTO } from '../schemas/proceso_electoral.schema.js';

// Un proceso solo puede archivarse cuando ya no está activo.
const ARCHIVABLES = ['finalizado', 'cancelado'];

/**
 * Lista los procesos visibles para quien consulta: la administración ve todos y
 * el estudiante solo los globales y los de su propia carrera (ver FiltroCarrera).
 */
export async function listarProcesos(estado?: string, filtro: FiltroCarrera = undefined) {
  // Se admiten singular y plural: ?estado=archivado y ?estado=archivados.
  const clave = String(estado ?? '').toLowerCase().replace(/s$/, '');
  if (clave === 'actuale') return repo.findActuales(filtro);
  if (clave === 'finalizado') return repo.findFinalizados(filtro);
  if (clave === 'archivado') return repo.findArchivados(filtro);
  // Sin filtro: solo los NO archivados. El historial se pide expresamente.
  return repo.findAll(filtro);
}

/**
 * Devuelve el proceso solo si es visible para quien consulta: debe contener al
 * menos una papeleta global o de su carrera.
 */
export async function obtenerProceso(id: number, filtro: FiltroCarrera = undefined) {
  const proceso = await repo.findById(id);
  if (!proceso) return null;
  if (!(await repo.tieneVotacionVisible(id, filtro))) return null;
  return proceso;
}

export async function crearProceso(data: CrearProcesoDTO) {
  return repo.create(data);
}

export async function actualizarProceso(id: number, data: ActualizarProcesoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;

  const actualizado = await repo.update(id, data);

  // Si el proceso acaba de pasar a 'finalizado', se notifica a quienes votaron
  // que los resultados ya están disponibles.
  if (existente.estado !== 'finalizado' && actualizado?.estado === 'finalizado') {
    await notificaciones.notificarResultadosDeProceso(id, actualizado.nombre_proceso);
  }

  return actualizado;
}

/**
 * Elimina un proceso definitivamente, pero SOLO si sigue siendo un borrador.
 * Si ya tiene actividad electoral (votos, comprobantes, actas o veedurías) se
 * rechaza con 409 y el motivo, porque es evidencia que debe conservarse: en ese
 * caso corresponde cancelar o archivar.
 *
 * Si es borrador, se limpian en una transacción sus dependencias de
 * preparación: validaciones, candidatos, planes, listas, votaciones y
 * cronogramas.
 */
export async function eliminarProceso(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;

  if (!existente.puede_eliminar) {
    throw new HttpError(409, `No se puede eliminar el proceso. ${existente.motivo_bloqueo}`);
  }

  await borradoRepo.eliminarProcesoEnCascada(id);
  return true;
}

/** Marca el proceso como cancelado (no borra nada). */
export async function cancelarProceso(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return null;

  if (existente.estado === 'cancelado') {
    throw new HttpError(409, 'El proceso ya está cancelado.');
  }
  if (existente.estado === 'finalizado') {
    throw new HttpError(409, 'Un proceso finalizado no puede cancelarse; puede archivarse.');
  }

  return repo.cancelar(id);
}

/**
 * Archiva un proceso (soft): solo si está finalizado o cancelado. No borra
 * votos, comprobantes, actas, candidatos ni auditorías; solo lo saca de las
 * consultas activas dejándolo disponible para historial.
 */
export async function archivarProceso(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return null;

  if (existente.archivado_at) {
    throw new HttpError(409, 'El proceso ya está archivado.');
  }
  if (!ARCHIVABLES.includes(existente.estado)) {
    throw new HttpError(409, 'Solo se pueden archivar procesos finalizados o cancelados. No se permite archivar un proceso activo.');
  }

  // Archivar no borra nada: el historial completo (papeletas, listas,
  // integrantes, propuestas, votos, comprobantes y actas) se conserva. Lo que
  // sí termina es la candidatura: se retiran las asignaciones del proceso y
  // quien lo presidía recupera su rol de estudiante, de modo que pueda
  // postularse de nuevo en un proceso futuro. Todo en una transacción.
  await archivadoRepo.archivarYLiberar(id);
  return repo.findById(id);
}
