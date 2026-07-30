import * as repo from '../repositories/asignacion_candidatura.repository.js';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import * as votacionRepo from '../repositories/votacion.repository.js';
import * as procesoRepo from '../repositories/proceso_electoral.repository.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Asignación administrativa de candidaturas.
 *
 * El candidato NO elige proceso, carrera ni papeleta: el administrador le asigna
 * una única papeleta y el portal del candidato trabaja solo con ella.
 */

/** Consulta la asignación de un estudiante (null si no tiene). */
export async function obtenerDeEstudiante(cedula: string) {
  return repo.findByEstudiante(cedula);
}

/** Asignación activa del candidato autenticado (null si no tiene). */
export async function obtenerActiva(cedula: string) {
  return repo.findActivaDeEstudiante(cedula);
}

/**
 * Comprueba que la persona y la papeleta permitan la asignación:
 *  - la persona existe y tiene rol candidato;
 *  - la papeleta existe y su proceso está en periodo de inscripción;
 *  - si la papeleta es de una carrera, el candidato debe ser de esa carrera.
 */
async function validarAsignacion(cedula: string, votacionId: number) {
  const estudiante = await estudianteRepo.findByCedula(cedula);
  if (!estudiante) throw new HttpError(404, 'El estudiante indicado no existe.');
  if (String(estudiante.rol).toLowerCase() !== 'candidato') {
    throw new HttpError(409, 'Solo una cuenta con rol candidato puede recibir una asignación de candidatura.');
  }

  const votacion = await votacionRepo.findById(votacionId);
  if (!votacion) throw new HttpError(404, 'La papeleta (votación) indicada no existe.');

  const proceso = await procesoRepo.findById(votacion.id_proceso);
  if (!proceso) throw new HttpError(404, 'El proceso de la papeleta no existe.');
  if (proceso.estado !== 'inscripcion') {
    throw new HttpError(409, 'El proceso de esa papeleta no está en periodo de inscripción.');
  }

  // Papeleta de carrera: el candidato debe pertenecer a esa misma carrera.
  if (votacion.fk_id_carrera != null) {
    const carreraEstudiante = estudiante.id_carrera == null ? null : Number(estudiante.id_carrera);
    if (carreraEstudiante !== Number(votacion.fk_id_carrera)) {
      throw new HttpError(409, `Esa papeleta corresponde a la carrera "${votacion.nombre_carrera}" y el candidato no pertenece a ella.`);
    }
  }

  return votacion;
}

/** Impide mover o retirar la asignación si ya hay una lista que debe conservarse. */
async function verificarSinListaComprometida(cedula: string, accion: string) {
  const lista = await repo.listaQueBloquea(cedula);
  if (!lista) return;

  const motivo = Number(lista.tiene_votos) === 1
    ? 'ya recibió votos'
    : `está en estado "${lista.estado_revision}"`;
  throw new HttpError(409, `No se puede ${accion} la asignación: su lista "${lista.nombre_lista}" ${motivo}. Primero hay que retirar o rechazar esa lista.`);
}

/** Crea la asignación. Falla con 409 si ya tiene una. */
export async function asignar(cedula: string, votacionId: number) {
  const existente = await repo.findByEstudiante(cedula);
  if (existente) {
    throw new HttpError(409, `El candidato ya tiene una asignación (papeleta "${existente.titulo_papeleta}"). Modifícala o retírala antes de crear otra.`);
  }

  await validarAsignacion(cedula, votacionId);
  return repo.create(cedula, votacionId);
}

/** Cambia la papeleta asignada. */
export async function reasignar(cedula: string, votacionId: number) {
  const existente = await repo.findByEstudiante(cedula);
  if (!existente) return null;

  await verificarSinListaComprometida(cedula, 'cambiar');
  await validarAsignacion(cedula, votacionId);
  return repo.updateVotacion(cedula, votacionId);
}

/** Retira (elimina) la asignación. */
export async function retirar(cedula: string) {
  const existente = await repo.findByEstudiante(cedula);
  if (!existente) return false;

  await verificarSinListaComprometida(cedula, 'retirar');
  return repo.remove(cedula);
}
