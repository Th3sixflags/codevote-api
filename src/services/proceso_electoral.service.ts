import * as repo from '../repositories/proceso_electoral.repository.js';
import * as notificaciones from './notificacion.service.js';
import { CrearProcesoDTO, ActualizarProcesoDTO } from '../schemas/proceso_electoral.schema.js';

export async function listarProcesos(estado?: string) {
  if (estado === 'actuales') return repo.findActuales();
  if (estado === 'finalizados') return repo.findFinalizados();
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
