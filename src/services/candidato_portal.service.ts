import * as listaRepo      from '../repositories/lista_candidata.repository.js';
import * as candidatoRepo  from '../repositories/candidato.repository.js';
import * as planRepo       from '../repositories/plan_trabajo.repository.js';
import * as procesoRepo    from '../repositories/proceso_electoral.repository.js';
import * as votacionRepo   from '../repositories/votacion.repository.js';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import * as asignacionRepo from '../repositories/asignacion_candidatura.repository.js';
import { HttpError } from '../utils/httpError.js';
import { verificarPropuestasCompletas } from '../utils/propuestasCompletas.js';
import { CARGO_PRESIDENTE } from '../schemas/common.js';
import { obtenerConfiguracionInstitucion, validarRequisitosCandidato } from './reglas_electorales.service.js';
import { institucionObligatoria } from '../utils/institucion.js';
import {
  CrearListaCandidatoDTO, ActualizarListaCandidatoDTO,
  AgregarCandidatoDTO, ActualizarCandidatoPortalDTO,
  AgregarPlanDTO, ActualizarPlanDTO,
} from '../schemas/candidato_portal.schema.js';

/**
 * Portal del candidato.
 *
 * Solo el RESPONSABLE de la candidatura (rol 'candidato' + asignación activa)
 * entra aquí y es, a la vez, el Presidente de su lista. Los demás integrantes
 * se registran en la tabla `candidato` pero conservan rol 'estudiante': no
 * reciben asignación ni pueden llamar a /api/candidato/*.
 */

// Contexto mínimo (lista o candidato/plan con datos de su lista) para las
// verificaciones de dueño y de estados.
interface Contexto {
  fk_cedula_responsable: string | null;
  estado_revision: string;
  estado_proceso: string;
}

/**
 * La lista debe pertenecer al candidato autenticado: se compara la cédula del
 * token (req.user.sub) con lista_candidata.fk_cedula_responsable. Otro candidato
 * —o un integrante que conociera el ID— recibe 403.
 */
function verificarDueno(ctx: Contexto, cedula: string) {
  if (ctx.fk_cedula_responsable !== cedula) {
    throw new HttpError(403, 'Esta lista no te pertenece: solo su responsable puede modificarla.');
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

/**
 * Arma la respuesta que espera el frontend: además de la lista, el bloque
 * `responsable` y el arreglo `integrantes` con la bandera `es_responsable`.
 * Se conserva `candidatos` (mismo contenido que `integrantes`) por
 * compatibilidad con los clientes que ya lo consumen.
 */
export function componerLista(lista: any, integrantes: any[], planes: any[]) {
  const presidente = integrantes.find((i) => i.es_responsable) ?? null;
  return {
    ...lista,
    responsable: presidente
      ? {
          cedula:    presidente.fk_cedula_estudiante,
          nombres:   presidente.nombres,
          apellidos: presidente.apellidos,
        }
      : null,
    integrantes,
    candidatos: integrantes,
    planes,
  };
}

/** Lista del candidato con sus integrantes y planes (o null si no tiene). */
export async function obtenerMiLista(cedula: string) {
  const lista = await listaRepo.findByResponsable(cedula);
  if (!lista) return null;

  const [integrantes, planes] = await Promise.all([
    candidatoRepo.findByLista(lista.id_lista),
    planRepo.findByLista(lista.id_lista),
  ]);
  return componerLista(lista, integrantes, planes);
}

/**
 * Crea la lista del candidato dentro de una papeleta. El proceso y la carrera se
 * derivan de la votación elegida; además la papeleta debe corresponder a la
 * carrera del candidato (una global o la suya).
 */
export async function crearLista(cedula: string, data: CrearListaCandidatoDTO) {
  // La papeleta viene de la asignación hecha por el administrador: el candidato
  // no la elige. Sin asignación no puede crear lista.
  const asignacion = await asignacionRepo.findActivaDeEstudiante(cedula);
  if (!asignacion) {
    throw new HttpError(409, 'Todavía no tienes una papeleta asignada. La administración electoral debe asignarte una antes de inscribir tu lista.');
  }

  const votacion = await votacionRepo.findById(asignacion.fk_id_votacion);
  if (!votacion) throw new HttpError(404, 'La papeleta asignada ya no existe.');

  const proceso = await procesoRepo.findById(votacion.id_proceso);
  if (!proceso) throw new HttpError(404, 'Proceso electoral no encontrado.');
  if (proceso.estado !== 'inscripcion') {
    throw new HttpError(409, 'El proceso no está en periodo de inscripción.');
  }
  if (await listaRepo.existeResponsableEnProceso(cedula, votacion.id_proceso)) {
    throw new HttpError(409, 'Ya tienes una lista registrada en este proceso.');
  }
  // Tampoco puede integrar la lista de otra persona: una sola candidatura activa.
  const activa = await candidatoRepo.candidaturaActiva(cedula);
  if (activa) {
    throw new HttpError(409, `Ya participas en la lista "${activa.nombre_lista}" de "${activa.nombre_proceso}". Solo se permite una candidatura a la vez.`);
  }

  // La lista nace en 'pendiente' (borrador editable) hasta que se envía a
  // revisión. El responsable queda registrado en fk_cedula_responsable y, en la
  // misma transacción, como integrante con cargo 'Presidente'.
  return listaRepo.crearListaConPresidente(
    asignacion.fk_id_votacion, votacion.id_proceso, data.nombre_lista, data.lema ?? null,
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

/**
 * Agrega un integrante a la lista (vicepresidente, secretario, tesorero,
 * vocales). El integrante NO cambia de rol, NO recibe asignación de candidatura
 * y NO obtiene acceso al portal: solo se crea su fila en la tabla `candidato`
 * con su cargo dentro de la lista.
 */
export async function agregarCandidato(cedula: string, listaId: number, data: AgregarCandidatoDTO, institucionId?: number) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista);

  // El cargo de Presidente está reservado al responsable, que ya se registró al
  // crear la lista: no puede haber un segundo presidente.
  if (data.cargo === CARGO_PRESIDENTE) {
    throw new HttpError(409, 'El cargo de Presidente corresponde al responsable de la lista y ya está asignado.');
  }
  if (data.fk_cedula_estudiante === cedula) {
    throw new HttpError(409, 'Ya formas parte de tu lista como Presidente.');
  }

  const estudiante = await estudianteRepo.findByCedula(data.fk_cedula_estudiante);
  if (!estudiante) {
    throw new HttpError(404, 'El estudiante indicado no existe.');
  }
  
  const votacionLista = await votacionRepo.findById(lista.fk_id_votacion);
  const carreraExigida = votacionLista?.fk_id_carrera == null ? null : Number(votacionLista.fk_id_carrera);
  const nombrePapeleta = votacionLista?.nombre_carrera;
  
  const config = await obtenerConfiguracionInstitucion(institucionId);
  validarRequisitosCandidato(estudiante, config, carreraExigida, nombrePapeleta);

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
  // Quien tiene asignación activa es responsable de su propia candidatura: no
  // puede ser a la vez integrante de esta.
  const asignacionAjena = await asignacionRepo.findActivaDeEstudiante(data.fk_cedula_estudiante);
  if (asignacionAjena) {
    throw new HttpError(409, 'Esa persona es responsable de otra candidatura y no puede integrar esta lista.');
  }
  // El integrante conserva su rol 'estudiante': aquí solo se crea su registro
  // como integrante de la lista, sin tocar `estudiante.rol` ni crear asignación.
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

  // El cargo del responsable no se toca desde el portal: cambiarlo equivaldría
  // a transferir la presidencia, que es una operación de administración
  // (PATCH /api/listas-candidatas/:id/responsable).
  if (ctx.es_responsable && data.cargo && data.cargo !== CARGO_PRESIDENTE) {
    throw new HttpError(409, 'No puedes cambiar el cargo del responsable de la lista. La presidencia solo se transfiere desde la administración.');
  }
  if (!ctx.es_responsable && data.cargo === CARGO_PRESIDENTE) {
    throw new HttpError(409, 'El cargo de Presidente corresponde al responsable de la lista y ya está asignado.');
  }
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
  // El responsable no puede eliminarse a sí mismo de su lista: dejaría la
  // candidatura sin presidente. Cambiarlo es una operación de administración.
  if (ctx.es_responsable) {
    throw new HttpError(409, 'No puedes eliminar al responsable de la lista. Para cambiarlo, la administración debe transferir la responsabilidad.');
  }
  await candidatoRepo.remove(candidatoId);
}

export async function agregarPlan(cedula: string, listaId: number, data: AgregarPlanDTO) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista);
  // Nace sin documento: el PDF se adjunta después con
  // POST /api/candidato/listas/:listaId/planes/archivo, la única vía que puede
  // escribir `archivo_url`.
  return planRepo.create({
    area: data.area,
    propuesta: data.propuesta,
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

export async function enviarARevision(cedula: string, listaId: number, institucionId?: number) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista); // aprobada/retirada no pueden reenviarse

  // Validar a todos los integrantes con las reglas vigentes. Si las reglas cambiaron
  // desde que se agregaron los candidatos, la lista no pasará a revisión.
  const config = await obtenerConfiguracionInstitucion(institucionId);
  const votacionLista = await votacionRepo.findById(lista.fk_id_votacion);
  const carreraExigida = votacionLista?.fk_id_carrera == null ? null : Number(votacionLista.fk_id_carrera);
  
  const integrantes = await candidatoRepo.findByLista(listaId);
  if (integrantes.filter((i) => !i.es_responsable).length === 0) {
    throw new HttpError(409, 'Agrega al menos un integrante además del presidente antes de enviar la lista a revisión.');
  }

  // Validar todos
  for (const integrante of integrantes) {
    const estudiante = await estudianteRepo.findByCedula(integrante.fk_cedula_estudiante);
    if (estudiante) {
      try {
        validarRequisitosCandidato(estudiante, config, carreraExigida, votacionLista?.nombre_carrera);
      } catch (err: any) {
        throw new HttpError(409, `El integrante ${integrante.nombres} (${integrante.cargo}) ya no cumple los requisitos: ${err.message || 'Regla no satisfecha'}`);
      }
    }
  }

  // El programa tiene que estar completo: al menos una propuesta y cada una con
  // su área, su resumen y su PDF subido a CodeVote. Si falta algo, el 409 dice
  // qué propuestas están incompletas.
  const planes = await planRepo.findByLista(listaId);
  verificarPropuestasCompletas(planes, 'enviar la lista a revisión');

  return listaRepo.setEstadoRevision(listaId, 'en_revision', null);
}

/**
 * Posibles integrantes para la lista del candidato: solo estudiantes
 * compatibles con la carrera de su papeleta asignada y sin candidatura activa.
 * Devuelve únicamente cédula, nombres, apellidos y carrera.
 */
export async function buscarIntegrantes(cedula: string, texto: string, institucionId?: number) {
  const tenant = institucionObligatoria(institucionId);
  const asignacion = await asignacionRepo.findActivaDeEstudiante(cedula, tenant);
  if (!asignacion) {
    throw new HttpError(409, 'Todavía no tienes una papeleta asignada, así que no puedes buscar integrantes.');
  }
  
  const config = await obtenerConfiguracionInstitucion(institucionId);
  const carreraCompatible = (!config.requiere_carrera || asignacion.carrera_votacion == null) ? null : Number(asignacion.carrera_votacion);
  
  // Buscar en BD
  const encontrados = await estudianteRepo.buscarPosiblesIntegrantes(carreraCompatible, texto, tenant);
  
  // Filtrar los que no cumplen los demás requisitos en memoria (promedio, membresia, etc.)
  const filtrados = encontrados.filter(estudiante => {
    try {
      validarRequisitosCandidato(estudiante, config, carreraCompatible, undefined);
      return true;
    } catch {
      return false;
    }
  });

  // Solo devolver los datos públicos
  return filtrados.map(e => ({
    cedula: e.cedula,
    nombres: e.nombres,
    apellidos: e.apellidos,
    nombre_carrera: e.nombre_carrera,
  }));
}

/**
 * Guarda la URL del PDF subido en el plan de trabajo indicado.
 * Valida que la lista sea del candidato, que siga editable y que el plan
 * pertenezca a esa lista. Si no se indica plan y la lista tiene exactamente uno,
 * se usa ese; con varios se exige indicar cuál.
 */
export async function guardarArchivoDePlan(
  cedula: string, listaId: number, archivoUrl: string, planId?: number
) {
  const lista = await listaRepo.findById(listaId);
  if (!lista) throw new HttpError(404, 'Lista no encontrada.');
  verificarDueno(lista, cedula);
  verificarInscripcion(lista);
  verificarEditable(lista);

  const planes = await planRepo.findByLista(listaId);
  if (planes.length === 0) {
    throw new HttpError(409, 'Primero crea un plan de trabajo y luego adjunta su PDF.');
  }

  let destino = planId
    ? planes.find((p: any) => Number(p.id_plan) === Number(planId))
    : (planes.length === 1 ? planes[0] : undefined);

  if (planId && !destino) {
    throw new HttpError(404, 'El plan de trabajo indicado no pertenece a esta lista.');
  }
  if (!destino) {
    throw new HttpError(422, 'La lista tiene varios planes de trabajo: indica id_plan para saber a cuál adjuntar el PDF.');
  }

  const actualizado = await planRepo.update(destino.id_plan, { archivo_url: archivoUrl });
  return { archivo_url: archivoUrl, plan: actualizado };
}
