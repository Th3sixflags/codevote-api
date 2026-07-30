import * as repo from '../repositories/candidato.repository.js';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import * as listaRepo from '../repositories/lista_candidata.repository.js';
import { HttpError } from '../utils/httpError.js';
import { PROMEDIO_MINIMO_POSTULACION } from '../config/reglas.js';
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

  // Requisito de elegibilidad: promedio mínimo para ser candidato.
  if (estudiante.promedio == null || Number(estudiante.promedio) < PROMEDIO_MINIMO_POSTULACION) {
    throw new HttpError(409, `El estudiante no cumple el promedio mínimo de ${PROMEDIO_MINIMO_POSTULACION}/100 requerido para ser candidato.`);
  }

  const lista = await listaRepo.findById(data.fk_id_lista);
  if (!lista) {
    throw new HttpError(404, 'La lista candidata no existe.');
  }

  if (await repo.existeEnLista(data.fk_cedula_estudiante, data.fk_id_lista)) {
    throw new HttpError(409, 'Este estudiante ya es candidato en esta lista.');
  }

  // Una sola candidatura activa a la vez (no puede estar en Consejo y en
  // representante de carrera simultáneamente). Misma regla que en el portal.
  const activa = await repo.candidaturaActiva(data.fk_cedula_estudiante);
  if (activa) {
    throw new HttpError(409, `Este estudiante ya tiene una candidatura activa en "${activa.nombre_proceso}" (lista "${activa.nombre_lista}"). Solo se permite una candidatura a la vez.`);
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
