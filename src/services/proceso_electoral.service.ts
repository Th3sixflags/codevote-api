import * as repo from '../repositories/proceso_electoral.repository.js';
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
  if (estado === 'actuales') return repo.findActuales(filtro);
  if (estado === 'finalizados') return repo.findFinalizados(filtro);
  if (estado === 'archivados') return repo.findArchivados(filtro);
  return repo.findAll(filtro);
}

/** Devuelve el proceso solo si es visible para quien consulta. */
export async function obtenerProceso(id: number, filtro: FiltroCarrera = undefined) {
  const proceso = await repo.findById(id);
  if (!proceso) return null;
  if (!procesoVisible(proceso.fk_id_carrera, filtro)) return null;
  return proceso;
}

export async function crearProceso(data: CrearProcesoDTO) {
  return repo.create(data);
}

export async function actualizarProceso(id: number, data: ActualizarProcesoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;

  // El esquema valida la regla de carrera cuando el body trae `tipo_proceso`.
  // En una actualización parcial hay que comprobarla contra el estado real:
  // p. ej. asignar carrera a un proceso de consejo, o quitársela a uno de
  // representante de carrera.
  const tipoFinal = data.tipo_proceso ?? existente.tipo_proceso;
  const carreraFinal = data.fk_id_carrera !== undefined ? data.fk_id_carrera : existente.fk_id_carrera;
  if (tipoFinal === 'representante_carrera' && carreraFinal == null) {
    throw new HttpError(422, 'Un proceso de representante de carrera requiere indicar la carrera.');
  }
  if (tipoFinal !== 'representante_carrera' && carreraFinal != null) {
    throw new HttpError(422, 'Un proceso global (consejo estudiantil o referéndum) no debe tener carrera.');
  }

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

  return repo.archivar(id);
}
