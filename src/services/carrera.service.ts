import * as repo from '../repositories/carrera.repository.js';
import { CrearCarreraDTO, ActualizarCarreraDTO } from '../schemas/carrera.schema.js';
import * as facultadRepo from '../repositories/facultad.repository.js';
import * as directorRepo from '../repositories/director.repository.js';
import { HttpError } from '../utils/httpError.js';
import { institucionObligatoria } from '../utils/institucion.js';

export async function listarCarrera(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerCarrera(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ?? null;
}

async function validarReferencias(data: CrearCarreraDTO | ActualizarCarreraDTO, institucionId: number) {
  if (data.fk_id_facultad !== undefined && data.fk_id_facultad !== null
      && !(await facultadRepo.findById(data.fk_id_facultad, institucionId))) {
    throw new HttpError(422, 'La facultad indicada no pertenece a tu institución.');
  }
  if (data.fk_id_director !== undefined && data.fk_id_director !== null
      && !(await directorRepo.findById(data.fk_id_director, institucionId))) {
    throw new HttpError(422, 'El director indicado no pertenece a tu institución.');
  }
}

export async function crearCarrera(data: CrearCarreraDTO, institucionId?: number) {
  const tenant = institucionObligatoria(institucionId);
  await validarReferencias(data, tenant);
  return repo.create(data, tenant);
}

export async function actualizarCarrera(id: number, data: ActualizarCarreraDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;
  if (institucionId !== undefined) await validarReferencias(data, institucionId);
  return repo.update(id, data, institucionId);
}

export async function eliminarCarrera(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;
  return repo.remove(id, institucionId);
}
