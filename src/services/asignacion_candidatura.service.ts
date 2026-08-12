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
export async function obtenerDeEstudiante(cedula: string, institucionId?: number) {
  return repo.findByEstudiante(cedula, institucionId);
}

/** Asignación activa del candidato autenticado (null si no tiene). */
export async function obtenerActiva(cedula: string, institucionId?: number) {
  return repo.findActivaDeEstudiante(cedula, institucionId);
}

/**
 * Comprueba que la persona y la papeleta permitan la asignación:
 *  - la persona existe y tiene rol candidato;
 *  - la papeleta existe y su proceso está en periodo de inscripción;
 *  - si la papeleta es de una carrera, el candidato debe ser de esa carrera.
 */
async function validarAsignacion(cedula: string, votacionId: number, institucionId?: number) {
  const estudiante = await estudianteRepo.findByCedula(cedula, institucionId);
  if (!estudiante) throw new HttpError(404, 'El estudiante indicado no existe.');
  if (String(estudiante.rol).toLowerCase() !== 'candidato') {
    throw new HttpError(409, 'Solo una cuenta con rol candidato puede recibir una asignación de candidatura.');
  }

  const votacion = await votacionRepo.findById(votacionId, institucionId);
  if (!votacion) throw new HttpError(404, 'La papeleta (votación) indicada no existe.');

  const proceso = await procesoRepo.findById(votacion.id_proceso, institucionId);
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
async function verificarSinListaComprometida(cedula: string, accion: string, institucionId?: number) {
  const lista = await repo.listaQueBloquea(cedula, institucionId);
  if (!lista) return;

  // El mensaje anterior pedía "retirar o rechazar esa lista", que no es la
  // salida correcta: una lista con votos NO debe retirarse, es evidencia
  // electoral. Lo que corresponde es cerrar y archivar su proceso; al hacerlo,
  // la candidatura se libera sola.
  throw new HttpError(
    409,
    `No se puede ${accion} la asignación: la candidatura "${lista.nombre_lista}" pertenece a un proceso vigente` +
    `${lista.nombre_proceso ? ` ("${lista.nombre_proceso}")` : ''}. ` +
    'Finalice y archive ese proceso antes de realizar una nueva asignación.'
  );
}

/** Crea la asignación. Falla con 409 si ya tiene una. */
export async function asignar(cedula: string, votacionId: number, institucionId?: number) {
  // Solo bloquea una asignación ACTIVA de un proceso vigente. Antes bastaba con
  // que existiera cualquier fila —incluida una ya retirada por haberse
  // archivado su proceso—, así que quien había sido candidato una vez no podía
  // volver a serlo. La fila anterior se reutiliza (ver repo.create).
  const activa = await repo.findActivaDeEstudiante(cedula, institucionId);
  if (activa) {
    throw new HttpError(409, `El candidato ya tiene una asignación activa (papeleta "${activa.titulo_papeleta}"). Modifícala o retírala antes de crear otra.`);
  }

  await validarAsignacion(cedula, votacionId, institucionId);
  return repo.create(cedula, votacionId, institucionId);
}

/** Cambia la papeleta asignada. */
export async function reasignar(cedula: string, votacionId: number, institucionId?: number) {
  const existente = await repo.findByEstudiante(cedula, institucionId);
  if (!existente) return null;

  await verificarSinListaComprometida(cedula, 'cambiar', institucionId);
  await validarAsignacion(cedula, votacionId, institucionId);
  return repo.updateVotacion(cedula, votacionId, institucionId);
}

/** Retira (elimina) la asignación. */
export async function retirar(cedula: string, institucionId?: number) {
  const existente = await repo.findByEstudiante(cedula, institucionId);
  if (!existente) return false;

  await verificarSinListaComprometida(cedula, 'retirar', institucionId);
  return repo.remove(cedula, institucionId);
}
