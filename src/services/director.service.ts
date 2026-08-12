import * as repo from '../repositories/director.repository.js';
import { CrearDirectorDTO, ActualizarDirectorDTO } from '../schemas/director.schema.js';
import { institucionObligatoria } from '../utils/institucion.js';

export async function listarDirector(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerDirector(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ?? null;
}

export async function crearDirector(data: CrearDirectorDTO, institucionId?: number) {
  return repo.create(data, institucionObligatoria(institucionId));
}

export async function actualizarDirector(id: number, data: ActualizarDirectorDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;
  return repo.update(id, data, institucionId);
}

export async function eliminarDirector(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;
  return repo.remove(id, institucionId);
}
