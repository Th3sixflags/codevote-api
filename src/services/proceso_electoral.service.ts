import * as repo from '../repositories/proceso_electoral.repository.js';
import * as notificaciones from './notificacion.service.js';
import { HttpError } from '../utils/httpError.js';
import { CrearProcesoDTO, ActualizarProcesoDTO } from '../schemas/proceso_electoral.schema.js';

// Un proceso solo puede archivarse cuando ya no está activo.
const ARCHIVABLES = ['finalizado', 'cancelado'];

export async function listarProcesos(estado?: string) {
  if (estado === 'actuales') return repo.findActuales();
  if (estado === 'finalizados') return repo.findFinalizados();
  if (estado === 'archivados') return repo.findArchivados();
  return repo.findAll();
}

export async function obtenerProceso(id: number) {
  const proceso = await repo.findById(id);
  return proceso ?? null;
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

export async function eliminarProceso(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
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
