import { ahoraEnEcuador } from './zonaHoraria.js';

/**
 * Estado EFECTIVO de una papeleta: el que vale ahora mismo, no el que quedó
 * guardado la última vez que alguien lo escribió.
 *
 * El problema que resuelve: el cierre automático corre cada minuto, así que
 * entre que pasa la hora final y la tarea la cierra hay una ventana en la que
 * `votacion.estado` todavía dice 'abierta'. Durante ese rato la API afirmaba que
 * se podía votar en una elección terminada. Peor: si la tarea fallaba o el
 * servidor estaba apagado, la ventana duraba indefinidamente.
 *
 * Aquí la fecha manda sobre el estado guardado. La misma regla la usan las
 * consultas (para responder `estado_efectivo`) y `POST /votos` (para rechazar el
 * voto), de modo que lo que la API muestra y lo que acepta nunca se contradicen.
 *
 * Todas las comparaciones son de TEXTO sobre 'YYYY-MM-DD HH:mm:ss' en hora de
 * Ecuador: el formato es de ancho fijo y ordena igual que la fecha, y
 * `ahoraEnEcuador()` produce exactamente ese formato. Así no interviene ninguna
 * conversión de zona horaria (ver dateStrings en config/database.ts).
 */

export type EstadoEfectivo = 'pendiente' | 'abierta' | 'cerrada';

export interface DatosDePapeleta {
  /** Estado guardado en `votacion.estado`. */
  estado?: string | null;
  fecha_apertura?: string | Date | null;
  fecha_cierre?: string | Date | null;
  /** Fin del periodo de votación del proceso: es el plazo que manda. */
  fecha_fin_votacion?: string | Date | null;
  estado_proceso?: string | null;
  archivado?: boolean | number | null;
}

export interface DisponibilidadDeVoto {
  estado_efectivo: EstadoEfectivo;
  puede_votar: boolean;
  motivo_no_disponible: string | null;
}

/** Normaliza a 'YYYY-MM-DD HH:mm:ss' en hora de Ecuador, o null. */
function comoTexto(valor: string | Date | null | undefined): string | null {
  if (valor == null || valor === '') return null;
  // Con dateStrings ya llega como texto; se admite Date por si alguna consulta
  // no pasa por el pool (pruebas, o una conexión configurada aparte).
  if (valor instanceof Date) return ahoraEnEcuador(valor);
  return String(valor).replace('T', ' ').slice(0, 19);
}

/** ¿Ya pasó ese momento? Un valor ausente nunca vence. */
function yaPaso(momento: string | Date | null | undefined, ahora: string): boolean {
  const texto = comoTexto(momento);
  return texto !== null && texto <= ahora;
}

/**
 * ¿La papeleta debería estar cerrada por fecha, con independencia de lo que
 * diga `votacion.estado`?
 *
 * Vence con el plazo del proceso o con el cierre propio de la papeleta, lo que
 * ocurra primero: son dos plazos distintos y ninguno de los dos debería poder
 * saltarse.
 */
export function estaVencida(papeleta: DatosDePapeleta, ahora = ahoraEnEcuador()): boolean {
  return yaPaso(papeleta.fecha_fin_votacion, ahora) || yaPaso(papeleta.fecha_cierre, ahora);
}

/**
 * Estado efectivo, si se puede votar y por qué no.
 *
 * El orden de las comprobaciones importa: se responde el motivo más específico
 * y definitivo primero (archivado, cancelado, vencido) y solo al final lo
 * transitorio (todavía no abre).
 */
export function disponibilidadDeVoto(
  papeleta: DatosDePapeleta, ahora = ahoraEnEcuador()
): DisponibilidadDeVoto {
  const cerrada = (motivo: string): DisponibilidadDeVoto =>
    ({ estado_efectivo: 'cerrada', puede_votar: false, motivo_no_disponible: motivo });

  if (Number(papeleta.archivado ?? 0) === 1 || papeleta.archivado === true) {
    return cerrada('Este proceso electoral está archivado: es historial y no admite votos.');
  }

  const estadoProceso = String(papeleta.estado_proceso ?? '').toLowerCase();
  if (estadoProceso === 'cancelado') {
    return cerrada('El proceso electoral fue cancelado.');
  }

  // La fecha manda sobre el estado guardado: aunque la tarea de cierre no haya
  // pasado todavía, aquí la votación ya está terminada.
  if (estaVencida(papeleta, ahora)) {
    return cerrada('La votación ha finalizado.');
  }

  const estado = String(papeleta.estado ?? '').toLowerCase();
  if (estado === 'cerrada') {
    return cerrada('La votación ha finalizado.');
  }

  if (estado === 'pendiente' || !yaPaso(papeleta.fecha_apertura, ahora)) {
    return {
      estado_efectivo: 'pendiente',
      puede_votar: false,
      motivo_no_disponible: 'La votación todavía no ha abierto.',
    };
  }

  // Un proceso finalizado no admite votos aunque la papeleta siguiera abierta.
  if (estadoProceso === 'finalizado') {
    return cerrada('El proceso electoral ya finalizó.');
  }

  return { estado_efectivo: 'abierta', puede_votar: true, motivo_no_disponible: null };
}
