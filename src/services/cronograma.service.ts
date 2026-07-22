import * as repo from '../repositories/cronograma.repository';
import { CrearCronogramaDTO, ActualizarCronogramaDTO } from '../schemas/cronograma.schema';

export async function listarCronograma() {
  return repo.findAll();
}

export async function obtenerCronograma(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorProceso(id: number) {
  return repo.findByProceso(id);
}

export async function crearCronograma(data: CrearCronogramaDTO) {
  return repo.create(data);
}

export async function actualizarCronograma(id: number, data: ActualizarCronogramaDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarCronograma(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
