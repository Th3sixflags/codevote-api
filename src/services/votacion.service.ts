import * as repo from '../repositories/votacion.repository.js';
import type { FiltroCarrera } from '../repositories/votacion.repository.js';
import { HttpError } from '../utils/httpError.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
import { cerrarPapeleta } from './cierre_votacion.service.js';
import * as avisos from './avisos_electorales.service.js';
import { CrearVotacionDTO, ActualizarVotacionDTO } from '../schemas/votacion.schema.js';

export async function listarVotaciones() {
  return repo.findAll();
}

/** Devuelve la votación solo si su papeleta corresponde a quien consulta. */
export async function obtenerVotacion(id: number, filtro: FiltroCarrera = undefined) {
  const votacion = await repo.findById(id);
  if (!votacion) return null;
  if (!procesoVisible(votacion.fk_id_carrera, filtro)) return null;
  return votacion;
}

/** Papeletas del proceso visibles para quien consulta (ver FiltroCarrera). */
export async function listarPorProceso(procesoId: number, filtro: FiltroCarrera = undefined) {
  return repo.findByProceso(procesoId, filtro);
}

export async function crearVotacion(data: CrearVotacionDTO) {
  // No puede haber dos papeletas de la misma carrera en un mismo proceso.
  if (data.fk_id_carrera != null) {
    if (await repo.existeCarreraEnProceso(data.fk_id_proceso, data.fk_id_carrera)) {
      throw new HttpError(409, 'Ya existe una votación de esa carrera en este proceso electoral.');
    }
  }
  const votacion = await repo.create(data);

  // Convocatoria: se avisa por correo al padrón que le corresponde esta papeleta
  // (global o de una carrera). Va aquí y no al crear el proceso porque la
  // carrera vive en la papeleta: hasta este momento no se sabe a quién le toca.
  //
  // Best-effort: es un aviso, no parte del acto de crear la papeleta. Si el
  // correo falla, la papeleta queda creada igual y el fallo queda en el log.
  if (votacion?.id_votacion) {
    void avisos.avisarConvocatoria(Number(votacion.id_votacion))
      .catch((err) => console.error('[avisos] no se pudo enviar la convocatoria', err));
  }

  return votacion;
}

export async function actualizarVotacion(id: number, data: ActualizarVotacionDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;

  // Al cambiar la carrera (o el proceso) se vuelve a comprobar la unicidad.
  const carreraFinal = data.fk_id_carrera !== undefined ? data.fk_id_carrera : existente.fk_id_carrera;
  const procesoFinal = data.fk_id_proceso ?? existente.id_proceso;
  if (carreraFinal != null) {
    if (await repo.existeCarreraEnProceso(procesoFinal, carreraFinal, id)) {
      throw new HttpError(409, 'Ya existe una votación de esa carrera en este proceso electoral.');
    }
  }

  // Cierre manual: es el respaldo por si hay que cerrar antes de tiempo, y pasa
  // por la MISMA función que el cierre automático, para que emita el acta,
  // avise a la administración y registre el escrutinio igual que aquel. Si no,
  // una papeleta cerrada a mano quedaría sin acta ni aviso.
  const cierraAhora = data.estado === 'cerrada' && existente.estado === 'abierta';

  if (cierraAhora) {
    // El orden importa: `cerrarPapeleta` cierra con un UPDATE condicionado a
    // que la papeleta siga abierta. Si se guardara antes el estado 'cerrada',
    // esa condición no se cumpliría y se saltaría el acta y los avisos.
    await cerrarPapeleta({
      id_votacion: id,
      titulo_papeleta: existente.titulo_papeleta,
      nombre_proceso: existente.nombre_proceso ?? 'Proceso electoral',
      nombre_carrera: existente.nombre_carrera ?? null,
    });

    // El resto de campos que vinieran en la misma petición, ya sin el estado.
    const { estado, ...resto } = data;
    if (Object.keys(resto).length > 0) await repo.update(id, resto);
    return repo.findById(id);
  }

  return repo.update(id, data);
}

/**
 * Elimina la votación solo si no tiene actividad electoral. Con votos,
 * comprobantes, actas o veedurías se rechaza con 409 y el motivo: esa evidencia
 * debe conservarse (el proceso puede cancelarse o archivarse en su lugar).
 */
export async function eliminarVotacion(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;

  if (!existente.puede_eliminar) {
    throw new HttpError(409, `No se puede eliminar la votación. ${existente.motivo_bloqueo}`);
  }

  await repo.remove(id);
  return true;
}
