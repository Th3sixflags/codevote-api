import * as repo from '../repositories/votacion.repository.js';
import { CrearVotacionDTO, ActualizarVotacionDTO } from '../schemas/votacion.schema.js';

export async function listarVotaciones() {
  return repo.findAll();
}

export async function obtenerVotacion(id: number) {
  const votacion = await repo.findById(id);
  return votacion ?? null;
}

export async function listarPorProceso(procesoId: number) {
  return repo.findByProceso(procesoId);
}

export async function crearVotacion(data: CrearVotacionDTO) {
  return repo.create(data);
}

export async function actualizarVotacion(id: number, data: ActualizarVotacionDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarVotacion(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
