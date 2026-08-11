import * as repo from '../repositories/candidato.repository.js';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import * as listaRepo from '../repositories/lista_candidata.repository.js';
import { HttpError } from '../utils/httpError.js';
import { CrearCandidatoDTO, ActualizarCandidatoDTO } from '../schemas/candidato.schema.js';
import { obtenerConfiguracionInstitucion, validarRequisitosCandidato } from './reglas_electorales.service.js';
import * as votacionRepo from '../repositories/votacion.repository.js';

export async function listarCandidato(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerCandidato(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ?? null;
}

export async function listarPorLista(id: number, institucionId?: number) {
  return repo.findByLista(id, institucionId);
}

export async function crearCandidato(data: CrearCandidatoDTO, institucionId?: number) {
  // El cargo ya lo valida Zod (enum). Aquí validamos las referencias y el duplicado
  // para responder mensajes claros en lugar de un 500 por clave foránea.
  const estudiante = await estudianteRepo.findByCedula(data.fk_cedula_estudiante);
  if (!estudiante) {
    throw new HttpError(404, 'El estudiante con esa cédula no existe.');
  }

  const lista = await listaRepo.findById(data.fk_id_lista, institucionId);
  if (!lista) {
    throw new HttpError(404, 'La lista candidata no existe o pertenece a otra institución.');
  }

  // Requisitos de elegibilidad
  const config = await obtenerConfiguracionInstitucion(institucionId);
  const votacionLista = await votacionRepo.findById(lista.fk_id_votacion);
  const carreraExigida = votacionLista?.fk_id_carrera == null ? null : Number(votacionLista.fk_id_carrera);
  
  validarRequisitosCandidato(estudiante, config, carreraExigida, votacionLista?.nombre_carrera);

  if (await repo.existeEnLista(data.fk_cedula_estudiante, data.fk_id_lista)) {
    throw new HttpError(409, 'Este estudiante ya es candidato en esta lista.');
  }

  // Una sola candidatura activa a la vez (no puede estar en Consejo y en
  // representante de carrera simultáneamente). Misma regla que en el portal.
  const activa = await repo.candidaturaActiva(data.fk_cedula_estudiante, 0, institucionId);
  if (activa) {
    throw new HttpError(409, `Este estudiante ya tiene una candidatura activa en "${activa.nombre_proceso}" (lista "${activa.nombre_lista}"). Solo se permite una candidatura a la vez.`);
  }

  return repo.create(data);
}

export async function actualizarCandidato(id: number, data: ActualizarCandidatoDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarCandidato(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
