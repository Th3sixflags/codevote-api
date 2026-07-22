import * as repo from '../repositories/candidato.repository';
import { CrearCandidatoDTO, ActualizarCandidatoDTO } from '../schemas/candidato.schema';

export async function listarCandidato() {
  return repo.findAll();
}

export async function obtenerCandidato(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorLista(id: number) {
  return repo.findByLista(id);
}

export async function crearCandidato(data: CrearCandidatoDTO) {
  return repo.create(data);
}

export async function actualizarCandidato(id: number, data: ActualizarCandidatoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarCandidato(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
