import * as repo from '../repositories/notificacion.repository.js';

export async function listarDeEstudiante(cedula: string) {
  return repo.findByEstudiante(cedula);
}

export async function marcarLeida(id: number, cedula: string) {
  const cambiada = await repo.marcarLeida(id, cedula);
  if (!cambiada) return null;
  return repo.findByIdYEstudiante(id, cedula);
}

// Las funciones que generan notificaciones son "best-effort": si fallan, se
// registra el error pero NO se interrumpe el flujo principal (votar, cerrar
// proceso), que es lo importante.

/** Recorta a `limite` caracteres dejando puntos suspensivos si sobra texto. */
function recortar(texto: string, limite: number) {
  return texto.length <= limite ? texto : `${texto.slice(0, limite - 1)}…`;
}

export async function notificar(cedula: string, tipo: string, titulo: string, mensaje: string) {
  try {
    await repo.crear(cedula, tipo, titulo, mensaje);
  } catch (err) {
    console.error('[notificacion] no se pudo crear la notificación', err);
  }
}

/**
 * Avisa al responsable de una lista de que la junta la resolvió. En el rechazo
 * se incluye el motivo para que sepa qué corregir sin tener que entrar a
 * buscarlo.
 *
 * No hace nada si la lista no tiene responsable (las que creó la
 * administración sin dueño). Repetir la petición no duplica el aviso: la
 * transición de estado exige partir de 'en_revision', así que el segundo
 * intento se corta con 409 antes de llegar aquí.
 */
export async function notificarResolucionDeLista(
  cedulaResponsable: string | null | undefined,
  nombreLista: string,
  resolucion: 'aprobada' | 'rechazada',
  motivo?: string | null
) {
  if (!cedulaResponsable) return;

  const mensaje = resolucion === 'aprobada'
    ? `Tu lista "${nombreLista}" fue aprobada por la junta electoral y competirá en la papeleta.`
    : `Tu lista "${nombreLista}" fue rechazada por la junta electoral.${motivo ? ` Motivo: ${motivo}` : ''}`;

  await notificar(
    cedulaResponsable,
    'candidatura',
    resolucion === 'aprobada' ? 'Lista aprobada' : 'Lista rechazada',
    // `mensaje` es VARCHAR(255) y el motivo admite hasta 250 caracteres: el
    // texto de rechazo puede pasarse. Se recorta aquí en vez de dejar que la
    // base lo trunque o falle en modo estricto.
    recortar(mensaje, 255)
  );
}

export async function notificarResultadosDeProceso(procesoId: number, nombreProceso: string) {
  try {
    await repo.crearParaVotantesDeProceso(
      procesoId,
      'resultados',
      'Resultados disponibles',
      `El proceso "${nombreProceso}" ha finalizado. Ya puedes consultar los resultados.`
    );
  } catch (err) {
    console.error('[notificacion] no se pudo notificar resultados', err);
  }
}
