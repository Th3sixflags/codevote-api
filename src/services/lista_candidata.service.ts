import * as repo from '../repositories/lista_candidata.repository.js';
import * as votacionRepo from '../repositories/votacion.repository.js';
import * as borradoRepo from '../repositories/borrado.repository.js';
import * as candidatoRepo from '../repositories/candidato.repository.js';
import * as estudianteRepo from '../repositories/estudiante.repository.js';
import * as planRepo from '../repositories/plan_trabajo.repository.js';
import * as notificaciones from './notificacion.service.js';
import type { FiltroCarrera } from '../repositories/lista_candidata.repository.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
import { HttpError } from '../utils/httpError.js';
import { CARGOS } from '../schemas/common.js';
import { componerLista } from './candidato_portal.service.js';
import { CrearListaDTO, ActualizarListaDTO } from '../schemas/lista_candidata.schema.js';

// Las listas de un proceso de carrera solo se devuelven a estudiantes de esa
// carrera; la administración las ve todas.
export async function listarListas(filtro: FiltroCarrera = undefined) {
  return repo.findAll(filtro);
}

/**
 * Detalle de una lista para la administración: incluye `responsable`,
 * `integrantes` (con la bandera `es_responsable`) y sus planes de trabajo, con
 * la misma forma que devuelve GET /api/candidato/mi-lista.
 */
export async function obtenerLista(id: number, filtro: FiltroCarrera = undefined) {
  const lista = await repo.findById(id);
  if (!lista) return null;
  if (!procesoVisible(lista.carrera_votacion, filtro)) return null;

  const [integrantes, planes] = await Promise.all([
    candidatoRepo.findByLista(id),
    planRepo.findByLista(id),
  ]);
  return componerLista(lista, integrantes, planes);
}

export async function listarPorProceso(procesoId: number, filtro: FiltroCarrera = undefined) {
  return repo.findByProceso(procesoId, filtro);
}

/**
 * Crea una lista dentro de una papeleta. El proceso se deriva de la votación,
 * así la lista nunca queda asociada a un proceso que no corresponde.
 */
export async function crearLista(data: CrearListaDTO) {
  const votacion = await votacionRepo.findById(data.fk_id_votacion);
  if (!votacion) throw new HttpError(404, 'La votación indicada no existe.');
  return repo.create(data, votacion.id_proceso);
}

/** Listas que compiten en una papeleta (filtradas por carrera de quien consulta). */
export async function listarPorVotacion(votacionId: number, filtro: FiltroCarrera = undefined) {
  return repo.findByVotacion(votacionId, filtro);
}

export async function actualizarLista(id: number, data: ActualizarListaDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

/**
 * Elimina la lista definitivamente, pero SOLO si es un borrador sin votos.
 * Si ya recibió votos se rechaza con 409: es evidencia electoral y corresponde
 * retirarla. Si es borrador, se limpian en una transacción sus dependencias de
 * preparación: validaciones de requisitos, candidatos y planes de trabajo.
 */
export async function eliminarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;

  if (!existente.puede_eliminar) {
    throw new HttpError(409, `No se puede eliminar la lista. ${existente.motivo_bloqueo}`);
  }

  await borradoRepo.eliminarListaEnCascada(id);
  return true;
}

// --- Revisión administrativa ----------------------------------------------
// Una lista relacionada (candidatos, planes, votos, auditoría) nunca se borra
// físicamente: se retira (soft-delete) para conservar el historial. El DELETE
// físico solo prospera para listas nuevas sin relaciones (si tiene relaciones,
// el errorHandler traduce la FK a 409).

/**
 * Transiciones válidas del estado de revisión de una lista.
 *
 *   pendiente ──(el candidato envía)──> en_revision ──> aprobada | rechazada
 *   aprobada  ──(la administración retira)──────────> retirada
 *
 * Antes cada acción escribía el estado directamente, así que se podía aprobar
 * un borrador que el candidato nunca envió, o reactivar una lista retirada. El
 * envío a revisión lo controla el portal del candidato (verificarEditable).
 */
const TRANSICIONES: Record<string, string[]> = {
  aprobada:  ['en_revision'],
  rechazada: ['en_revision'],
  retirada:  ['aprobada'],
};

const COMO_LLEGAR: Record<string, string> = {
  aprobada:  'Solo se puede aprobar una lista que esté en revisión.',
  rechazada: 'Solo se puede rechazar una lista que esté en revisión.',
  retirada:  'Solo se puede retirar una lista aprobada.',
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente:   'en preparación',
  en_revision: 'en revisión',
  aprobada:    'aprobada',
  rechazada:   'rechazada',
  retirada:    'retirada',
};

/** Lanza 409 si la lista no puede pasar a `destino` desde su estado actual. */
function verificarTransicion(actual: string, destino: string) {
  const origen = String(actual ?? '').toLowerCase();
  if (TRANSICIONES[destino].includes(origen)) return;

  const desde = ETIQUETA_ESTADO[origen] ?? origen;
  throw new HttpError(
    409,
    `La lista está ${desde} y no puede pasar a ${ETIQUETA_ESTADO[destino]}. ${COMO_LLEGAR[destino]}`
  );
}

export async function aprobarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  verificarTransicion(existente.estado_revision, 'aprobada');

  const lista = await repo.setEstadoRevision(id, 'aprobada', null);
  // El responsable se entera del resultado sin tener que entrar a mirar. Como
  // la transición exige partir de 'en_revision', repetir la petición devuelve
  // 409 y no llega aquí: no se duplican notificaciones.
  await notificaciones.notificarResolucionDeLista(
    existente.fk_cedula_responsable,
    existente.nombre_lista,
    'aprobada'
  );
  return lista;
}

export async function rechazarLista(id: number, motivo: string) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  verificarTransicion(existente.estado_revision, 'rechazada');

  const lista = await repo.setEstadoRevision(id, 'rechazada', motivo);
  await notificaciones.notificarResolucionDeLista(
    existente.fk_cedula_responsable,
    existente.nombre_lista,
    'rechazada',
    motivo
  );
  return lista;
}

export async function retirarLista(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  verificarTransicion(existente.estado_revision, 'retirada');
  return repo.setEstadoRevision(id, 'retirada', existente.motivo_rechazo ?? null);
}

// --- Transferencia de la responsabilidad ----------------------------------

/**
 * PATCH /api/listas-candidatas/:id/responsable — operación EXCLUSIVA de la
 * administración. El presidente no puede eliminarse ni cambiarse desde el
 * Portal del candidato; esta es la única vía para moverlo.
 *
 * El nuevo responsable pasa a rol 'candidato', recibe la asignación de la
 * papeleta de la lista y queda como Presidente. El anterior pierde su
 * asignación y vuelve a 'estudiante' si no administra otra candidatura. Todo
 * ocurre dentro de una transacción (ver repositorio).
 */
export async function transferirResponsable(listaId: number, nuevaCedula: string) {
  const lista = await repo.findById(listaId);
  if (!lista) return null;

  if (lista.fk_id_votacion == null) {
    throw new HttpError(409, 'La lista no tiene papeleta asignada, así que no se puede transferir la responsabilidad.');
  }
  if (lista.fk_cedula_responsable === nuevaCedula) {
    throw new HttpError(409, 'Esa persona ya es la responsable de la lista.');
  }

  const nuevo = await estudianteRepo.findByCedula(nuevaCedula);
  if (!nuevo) throw new HttpError(404, 'El estudiante indicado no existe.');
  if (String(nuevo.rol).toLowerCase() === 'admin') {
    throw new HttpError(409, 'Una cuenta de administración no puede ser responsable de una candidatura.');
  }
  if (nuevo.estado_academico !== 'activo') {
    throw new HttpError(409, 'El estudiante no está activo, así que no puede ser responsable de una candidatura.');
  }

  // Papeleta de carrera: el nuevo responsable debe pertenecer a esa carrera.
  if (lista.carrera_votacion != null) {
    const carreraNuevo = nuevo.id_carrera == null ? null : Number(nuevo.id_carrera);
    if (carreraNuevo !== Number(lista.carrera_votacion)) {
      throw new HttpError(409, `Esta lista compite en la papeleta de la carrera "${lista.nombre_carrera}" y esa persona no pertenece a ella.`);
    }
  }

  // No puede estar comprometido en otra candidatura activa (salvo esta misma).
  const activa = await candidatoRepo.candidaturaActiva(nuevaCedula);
  if (activa && Number(activa.id_lista) !== Number(listaId)) {
    throw new HttpError(409, `Esa persona ya participa en la lista "${activa.nombre_lista}" de "${activa.nombre_proceso}". Solo se permite una candidatura a la vez.`);
  }

  // Si el nuevo responsable todavía no integra la lista, la presidencia le deja
  // su cargo al anterior; con los cinco cargos ocupados no queda ninguno libre
  // y la lista pasaría a tener seis integrantes.
  const integrantes = await candidatoRepo.findByLista(listaId);
  const yaIntegra   = integrantes.some((i) => i.fk_cedula_estudiante === nuevaCedula);
  if (!yaIntegra && integrantes.length >= CARGOS.length) {
    throw new HttpError(409, 'La lista ya tiene los cinco cargos ocupados: retira a un integrante antes de transferir la responsabilidad.');
  }

  await repo.transferirResponsable(
    listaId, Number(lista.fk_id_votacion), nuevaCedula, lista.fk_cedula_responsable ?? null
  );
  // Se devuelve el detalle completo (responsable + integrantes) para que el
  // frontend refresque la vista sin una segunda llamada.
  return obtenerLista(listaId);
}
