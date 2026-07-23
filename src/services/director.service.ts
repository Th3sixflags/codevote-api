import * as repo from '../repositories/director.repository.js';
import { CrearDirectorDTO, ActualizarDirectorDTO } from '../schemas/director.schema.js';

export async function listarDirector() {
  return repo.findAll();
}

export async function obtenerDirector(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function crearDirector(data: CrearDirectorDTO) {
  return repo.create(data);
}

export async function actualizarDirector(id: number, data: ActualizarDirectorDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarDirector(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
