import * as repo from '../repositories/requisito.repository';
import { CrearRequisitoDTO, ActualizarRequisitoDTO } from '../schemas/requisito.schema';

export async function listarRequisito() {
  return repo.findAll();
}

export async function obtenerRequisito(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function crearRequisito(data: CrearRequisitoDTO) {
  return repo.create(data);
}

export async function actualizarRequisito(id: number, data: ActualizarRequisitoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarRequisito(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
