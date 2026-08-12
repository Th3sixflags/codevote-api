import * as repo from '../repositories/estudiante.repository.js';
import { CrearEstudianteDTO, ActualizarEstudianteDTO } from '../schemas/estudiante.schema.js';
import * as carreraRepo from '../repositories/carrera.repository.js';
import { HttpError } from '../utils/httpError.js';
import { institucionObligatoria } from '../utils/institucion.js';

export async function listarEstudiantes(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerEstudiante(cedula: string, institucionId?: number) {
  const estudiante = await repo.findByCedula(cedula, institucionId);
  return estudiante ?? null;
}

async function validarCarreraDeInstitucion(carreraId: number | undefined, institucionId: number) {
  if (carreraId === undefined) return;
  if (!(await carreraRepo.findById(carreraId, institucionId))) {
    throw new HttpError(422, 'La carrera indicada no pertenece a tu institución.');
  }
}

export async function crearEstudiante(data: CrearEstudianteDTO, institucionId?: number) {
  const tenant = institucionObligatoria(institucionId);
  await validarCarreraDeInstitucion(data.fk_id_carrera, tenant);
  return repo.create(data, tenant);
}

export async function actualizarEstudiante(cedula: string, data: ActualizarEstudianteDTO, institucionId?: number) {
  const existente = await repo.findByCedula(cedula, institucionId);
  if (!existente) return null;
  if (institucionId !== undefined) await validarCarreraDeInstitucion(data.fk_id_carrera, institucionId);
  return repo.update(cedula, data, institucionId);
}

export async function eliminarEstudiante(cedula: string, institucionId?: number) {
  const existente = await repo.findByCedula(cedula, institucionId);
  if (!existente) return false;
  return repo.remove(cedula, institucionId);
}
