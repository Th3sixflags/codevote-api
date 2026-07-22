import * as repo from '../repositories/carrera.repository';
import { CrearCarreraDTO, ActualizarCarreraDTO } from '../schemas/carrera.schema';

export async function listarCarrera() {
  return repo.findAll();
}

export async function obtenerCarrera(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function crearCarrera(data: CrearCarreraDTO) {
  return repo.create(data);
}

export async function actualizarCarrera(id: number, data: ActualizarCarreraDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarCarrera(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
