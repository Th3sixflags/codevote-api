import { cerrarPapeletasVencidas } from '../services/cierre_votacion.service.js';

/**
 * Cierre automático de papeletas vencidas.
 *
 * Se comprueba cada minuto, que es la granularidad con la que se programan las
 * votaciones. Se usa `setInterval` en vez de una librería de cron porque no
 * hace falta una expresión horaria: es un intervalo fijo, y una dependencia
 * menos en un sistema electoral es una superficie menos que auditar. La zona
 * horaria no la decide el planificador sino la comparación, que se hace
 * siempre en hora de Ecuador (ver utils/zonaHoraria.ts).
 *
 * Al arrancar se ejecuta una reconciliación: si el servidor estuvo apagado
 * mientras vencía una votación, se cierra en cuanto vuelve.
 */

const CADA_UN_MINUTO = 60_000;

let temporizador: NodeJS.Timeout | null = null;
/** Evita que dos pasadas se solapen si una tarda más de un minuto. */
let enCurso = false;

async function pasada(motivo: 'arranque' | 'programada') {
  if (enCurso) {
    console.warn('[cierre] la pasada anterior sigue en curso; se omite esta');
    return;
  }
  enCurso = true;
  try {
    const cerradas = await cerrarPapeletasVencidas();
    if (cerradas.length > 0) {
      console.info(
        `[cierre] (${motivo}) ${cerradas.length} papeleta(s) cerrada(s): ` +
        cerradas.map((c) => c.titulo_papeleta).join(', ')
      );
    } else if (motivo === 'arranque') {
      console.info('[cierre] (arranque) no había papeletas vencidas pendientes de cerrar');
    }
  } catch (err) {
    // Nunca se propaga: un fallo puntual no debe tumbar el proceso ni impedir
    // que la siguiente pasada lo intente de nuevo.
    console.error('[cierre] la comprobación falló', err);
  } finally {
    enCurso = false;
  }
}

/** Arranca la reconciliación inicial y la comprobación periódica. */
export function iniciarCierreProgramado() {
  if (temporizador) return;

  void pasada('arranque');

  temporizador = setInterval(() => void pasada('programada'), CADA_UN_MINUTO);
  // No mantiene vivo el proceso por sí solo: si Node no tiene nada más que
  // hacer, debe poder terminar (importante para las pruebas y para un apagado
  // ordenado).
  temporizador.unref?.();

  console.info('[cierre] comprobación de papeletas vencidas activa (cada minuto, hora de Ecuador)');
}

/** Detiene la comprobación periódica. Se usa en pruebas y al apagar. */
export function detenerCierreProgramado() {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}
