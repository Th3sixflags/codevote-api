import * as repo from '../repositories/veedor.repository.js';
import { CrearVeedorDTO, ActualizarVeedorDTO } from '../schemas/veedor.schema.js';

export async function listarVeedor() {
  return repo.findAll();
}

export async function obtenerVeedor(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function crearVeedor(data: CrearVeedorDTO) {
  return repo.create(data);
}

export async function actualizarVeedor(id: number, data: ActualizarVeedorDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarVeedor(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
