import * as repo from '../repositories/plan_trabajo.repository.js';
import { CrearPlanTrabajoDTO, ActualizarPlanTrabajoDTO } from '../schemas/plan_trabajo.schema.js';

export async function listarPlanTrabajo() {
  return repo.findAll();
}

export async function obtenerPlanTrabajo(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorLista(id: number) {
  return repo.findByLista(id);
}

export async function crearPlanTrabajo(data: CrearPlanTrabajoDTO) {
  return repo.create(data);
}

export async function actualizarPlanTrabajo(id: number, data: ActualizarPlanTrabajoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarPlanTrabajo(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
