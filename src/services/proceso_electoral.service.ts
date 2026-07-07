import * as repo from '../repositories/proceso_electoral.repository';
import { CrearProcesoDTO, ActualizarProcesoDTO } from '../schemas/proceso_electoral.schema';

export async function listarProcesos() {
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
  return repo.update(id, data);
}

export async function eliminarProceso(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
