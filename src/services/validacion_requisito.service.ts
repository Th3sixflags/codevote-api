import * as repo from '../repositories/validacion_requisito.repository.js';
import { CrearValidacionRequisitoDTO, ActualizarValidacionRequisitoDTO } from '../schemas/validacion_requisito.schema.js';

export async function listarValidacionRequisito() {
  return repo.findAll();
}

export async function obtenerValidacionRequisito(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorCandidato(id: number) {
  return repo.findByCandidato(id);
}

export async function crearValidacionRequisito(data: CrearValidacionRequisitoDTO) {
  return repo.create(data);
}

export async function actualizarValidacionRequisito(id: number, data: ActualizarValidacionRequisitoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarValidacionRequisito(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
