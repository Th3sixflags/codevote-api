import * as listaRepo      from '../repositories/lista_candidata.repository.js';
import * as candidatoRepo  from '../repositories/candidato.repository.js';
import * as planRepo       from '../repositories/plan_trabajo.repository.js';
import * as procesoRepo    from '../repositories/proceso_electoral.repository.js';
import * as votacionRepo   from '../repositories/votacion.repository.js';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import { HttpError } from '../utils/httpError.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
import { PROMEDIO_MINIMO_POSTULACION } from '../config/reglas.js';
import {
  CrearListaCandidatoDTO, ActualizarListaCandidatoDTO,
  AgregarCandidatoDTO, ActualizarCandidatoPortalDTO,
  AgregarPlanDTO, ActualizarPlanDTO,
} from '../schemas/candidato_portal.schema.js';

// Contexto mínimo (lista o candidato/plan con datos de su lista) para las
// verificaciones de dueño y de estados.
interface Contexto {
  fk_cedula_responsable: string | null;
  estado_revision: string;
  estado_proceso: string;
}

/** La lista debe pertenecer al candidato autenticado. */
function verificarDueno(ctx: Contexto, cedula: string) {
  if (ctx.fk_cedula_responsable !== cedula) {
    throw new HttpError(403, 'Esta lista no te pertenece.');
  }
}

/** Solo se puede modificar durante el periodo de inscripción del proceso. */
function verificarInscripcion(ctx: Contexto) {
  if (ctx.estado_proceso !== 'inscripcion') {
    throw new HttpError(409, 'El proceso no está en periodo de inscripción.');
  }
}

/** Una lista aprobada (o retirada) ya no puede editarla el candidato. */
function verificarEditable(ctx: Contexto) {
  if (ctx.estado_revision === 'aprobada') {
    throw new HttpError(409, 'No se puede modificar una lista ya aprobada.');
  }
  if (ctx.estado_revision === 'retirada') {
    throw new HttpError(409, 'No se puede modificar una lista retirada.');
  }
}

// ---------------------------------------------------------------------------

/** Lista del candidato con sus candidatos y planes (o null si no tiene). */
export async function obtenerMiLista(cedula: string) {
  const lista = await listaRepo.findByResponsable(cedula);
  if (!lista) return null;

  const [candidatos, planes] = await Promise.all([
    candidatoRepo.findByLista(lista.id_lista),
    planRepo.findByLista(lista.id_lista),
  ]);
  return { ...lista, candidatos, planes };
}

/**
 * Crea la lista del candidato dentro de una papeleta. El proceso y la carrera se
 * derivan de la votación elegida; además la papeleta debe corresponder a la
 * carrera del candidato (una global o la suya).
 */
export async function crearLista(cedula: string, data: CrearListaCandidatoDTO) {
  const votacion = await votacionRepo.findById(data.fk_id_votacion);
  if (!votacion) throw new HttpError(404, 'La votación indicada no existe.');

  const carreraEstudiante = await estudianteRepo.findCarreraId(cedula);
  if (!procesoVisible(votacion.fk_id_carrera, carreraEstudiante)) {
    throw new HttpError(403, 'Esa votación corresponde a otra carrera.');
  }

  const proceso = await procesoRepo.findById(votacion.id_proceso);
  if (!proceso) throw new HttpError(404, 'Proceso electoral no encontrado.');
  if (proceso.estado !== 'inscripcion') {
    throw new HttpError(409, 'El proceso no está en periodo de inscripción.');
  }
  if (await listaRepo.existeResponsableEnProceso(cedula, votacion.id_proceso)) {
    throw new HttpError(409, 'Ya tienes una lista registrada en este proceso.');
  }
  // La lista nace en 'pendiente' (borrador editable) hasta que se envía a revisión.
  return listaRepo.createDeCandidato(
    data.fk_id_votacion, votacion.id_proceso, data.nombre_lista, data.lema ?? null,
    'pendiente', cedula, data.foto_url ?? null
  );
}

export async function actualizarLista(cedula: string, listaId: number, data: ActualizarListaCandidatoDTO) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista);
  return listaRepo.updateDatos(listaId, {
    nombre_lista: data.nombre_lista,
    lema: data.lema,
    foto_url: data.foto_url,
  });
}

export async function agregarCandidato(cedula: string, listaId: number, data: AgregarCandidatoDTO) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista);

  const estudiante = await estudianteRepo.findByCedula(data.fk_cedula_estudiante);
  if (!estudiante) {
    throw new HttpError(404, 'El estudiante indicado no existe.');
  }
  // Requisito de elegibilidad: promedio mínimo para postularse.
  if (estudiante.promedio == null || Number(estudiante.promedio) < PROMEDIO_MINIMO_POSTULACION) {
    throw new HttpError(409, `El estudiante no cumple el promedio mínimo de ${PROMEDIO_MINIMO_POSTULACION}/100 requerido para postularse.`);
  }
  if (await candidatoRepo.existeCargoEnLista(listaId, data.cargo)) {
    throw new HttpError(409, `Ya existe un candidato con el cargo "${data.cargo}" en esta lista.`);
  }
  if (await candidatoRepo.participaEnProceso(data.fk_cedula_estudiante, lista.id_proceso)) {
    throw new HttpError(409, 'Esa persona ya participa en otra lista de este proceso.');
  }
  // Una sola candidatura activa a la vez: no puede estar a la par en Consejo
  // Estudiantil y en representante de carrera.
  const activa = await candidatoRepo.candidaturaActiva(data.fk_cedula_estudiante);
  if (activa) {
    throw new HttpError(409, `Esa persona ya tiene una candidatura activa en "${activa.nombre_proceso}" (lista "${activa.nombre_lista}"). Solo se permite una candidatura a la vez.`);
  }
  return candidatoRepo.create({
    cargo: data.cargo,
    fk_cedula_estudiante: data.fk_cedula_estudiante,
    fk_id_lista: listaId,
    foto_url: data.foto_url,
  });
}

export async function actualizarCandidato(cedula: string, candidatoId: number, data: ActualizarCandidatoPortalDTO) {
  const ctx = await candidatoRepo.findByIdConLista(candidatoId);
  if (!ctx) throw new HttpError(404, 'Candidato no encontrado.');
  verificarDueno(ctx, cedula);
  verificarInscripcion(ctx);
  verificarEditable(ctx);

  if (data.cargo && await candidatoRepo.existeCargoEnLista(ctx.fk_id_lista, data.cargo, candidatoId)) {
    throw new HttpError(409, `Ya existe un candidato con el cargo "${data.cargo}" en esta lista.`);
  }
  return candidatoRepo.update(candidatoId, { cargo: data.cargo, foto_url: data.foto_url });
}

export async function eliminarCandidato(cedula: string, candidatoId: number) {
  const ctx = await candidatoRepo.findByIdConLista(candidatoId);
  if (!ctx) throw new HttpError(404, 'Candidato no encontrado.');
  verificarDueno(ctx, cedula);
  verificarInscripcion(ctx);
  verificarEditable(ctx);
  await candidatoRepo.remove(candidatoId);
}

export async function agregarPlan(cedula: string, listaId: number, data: AgregarPlanDTO) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista);
  return planRepo.create({
    area: data.area,
    propuesta: data.propuesta,
    archivo_url: data.archivo_url,
    fk_id_lista: listaId,
  });
}

export async function actualizarPlan(cedula: string, planId: number, data: ActualizarPlanDTO) {
  const ctx = await planRepo.findByIdConLista(planId);
  if (!ctx) throw new HttpError(404, 'Plan de trabajo no encontrado.');
  verificarDueno(ctx, cedula);
  verificarInscripcion(ctx);
  verificarEditable(ctx);
  return planRepo.update(planId, data);
}

export async function enviarARevision(cedula: string, listaId: number) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista); // aprobada/retirada no pueden reenviarse

  const candidatos = await candidatoRepo.findByLista(listaId);
  if (candidatos.length === 0) {
    throw new HttpError(409, 'Agrega al menos un candidato antes de enviar la lista a revisión.');
  }
  return listaRepo.setEstadoRevision(listaId, 'en_revision', null);
}
