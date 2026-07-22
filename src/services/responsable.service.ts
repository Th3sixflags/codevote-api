import * as repo from '../repositories/responsable.repository';
import { CrearResponsableDTO, ActualizarResponsableDTO } from '../schemas/responsable.schema';

export async function listarResponsable() {
  return repo.findAll();
}

export async function obtenerResponsable(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function crearResponsable(data: CrearResponsableDTO) {
  return repo.create(data);
}

export async function actualizarResponsable(id: number, data: ActualizarResponsableDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarResponsable(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
