import * as repo from '../repositories/facultad.repository';
import { CrearFacultadDTO, ActualizarFacultadDTO } from '../schemas/facultad.schema';

export async function listarFacultad() {
  return repo.findAll();
}

export async function obtenerFacultad(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function crearFacultad(data: CrearFacultadDTO) {
  return repo.create(data);
}

export async function actualizarFacultad(id: number, data: ActualizarFacultadDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarFacultad(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
