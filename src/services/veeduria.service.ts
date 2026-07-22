import * as repo from '../repositories/veeduria.repository';
import { CrearVeeduriaDTO, ActualizarVeeduriaDTO } from '../schemas/veeduria.schema';

export async function listarVeeduria() {
  return repo.findAll();
}

export async function obtenerVeeduria(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorVotacion(id: number) {
  return repo.findByVotacion(id);
}

export async function crearVeeduria(data: CrearVeeduriaDTO) {
  return repo.create(data);
}

export async function actualizarVeeduria(id: number, data: ActualizarVeeduriaDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarVeeduria(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
