import * as repo from '../repositories/estudiante.repository';
import { CrearEstudianteDTO, ActualizarEstudianteDTO } from '../schemas/estudiante.schema';

export async function listarEstudiantes() {
  return repo.findAll();
}

export async function obtenerEstudiante(cedula: string) {
  const estudiante = await repo.findByCedula(cedula);
  return estudiante ?? null;
}

export async function crearEstudiante(data: CrearEstudianteDTO) {
  return repo.create(data);
}

export async function actualizarEstudiante(cedula: string, data: ActualizarEstudianteDTO) {
  const existente = await repo.findByCedula(cedula);
  if (!existente) return null;
  return repo.update(cedula, data);
}

export async function eliminarEstudiante(cedula: string) {
  const existente = await repo.findByCedula(cedula);
  if (!existente) return false;
  await repo.remove(cedula);
  return true;
}
