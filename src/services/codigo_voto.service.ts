import * as repo from '../repositories/codigo_voto.repository.js';
import { CrearCodigoVotoDTO, ActualizarCodigoVotoDTO } from '../schemas/codigo_voto.schema.js';

export async function listarCodigoVoto() {
  return repo.findAll();
}

export async function obtenerCodigoVoto(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorVotacion(id: number) {
  return repo.findByVotacion(id);
}

export async function listarPorEstudiante(cedula: string) {
  return repo.findByEstudiante(cedula);
}

export async function crearCodigoVoto(data: CrearCodigoVotoDTO) {
  return repo.create(data);
}

export async function actualizarCodigoVoto(id: number, data: ActualizarCodigoVotoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarCodigoVoto(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
