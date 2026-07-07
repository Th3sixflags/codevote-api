import * as repo from '../repositories/lista_candidata.repository';
import { CrearListaDTO, ActualizarListaDTO } from '../schemas/lista_candidata.schema';

export async function listarListas() {
  return repo.findAll();
}

export async function obtenerLista(id: number) {
  const lista = await repo.findById(id);
  return lista ?? null;
}

export async function listarPorProceso(procesoId: number) {
  return repo.findByProceso(procesoId);
}

export async function crearLista(data: CrearListaDTO) {
  return repo.create(data);
}

export async function actualizarLista(id: number, data: ActualizarListaDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
