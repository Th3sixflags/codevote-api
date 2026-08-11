import * as repo from '../repositories/veeduria.repository.js';
import { CrearVeeduriaDTO, ActualizarVeeduriaDTO } from '../schemas/veeduria.schema.js';

export async function listarVeeduria(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerVeeduria(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ?? null;
}

export async function listarPorVotacion(id: number, institucionId?: number) {
  return repo.findByVotacion(id, institucionId);
}

export async function crearVeeduria(data: CrearVeeduriaDTO) {
  return repo.create(data);
}

export async function actualizarVeeduria(id: number, data: ActualizarVeeduriaDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarVeeduria(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
