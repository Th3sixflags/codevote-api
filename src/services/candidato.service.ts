import * as repo from '../repositories/candidato.repository.js';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import * as listaRepo from '../repositories/lista_candidata.repository.js';
import { HttpError } from '../utils/httpError.js';
import { CrearCandidatoDTO, ActualizarCandidatoDTO } from '../schemas/candidato.schema.js';

export async function listarCandidato() {
  return repo.findAll();
}

export async function obtenerCandidato(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorLista(id: number) {
  return repo.findByLista(id);
}

export async function crearCandidato(data: CrearCandidatoDTO) {
  // El cargo ya lo valida Zod (enum). Aquí validamos las referencias y el duplicado
  // para responder mensajes claros en lugar de un 500 por clave foránea.
  const estudiante = await estudianteRepo.findByCedula(data.fk_cedula_estudiante);
  if (!estudiante) {
    throw new HttpError(404, 'El estudiante con esa cédula no existe.');
  }

  const lista = await listaRepo.findById(data.fk_id_lista);
  if (!lista) {
    throw new HttpError(404, 'La lista candidata no existe.');
  }

  if (await repo.existeEnLista(data.fk_cedula_estudiante, data.fk_id_lista)) {
    throw new HttpError(409, 'Este estudiante ya es candidato en esta lista.');
  }

  return repo.create(data);
}

export async function actualizarCandidato(id: number, data: ActualizarCandidatoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarCandidato(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
