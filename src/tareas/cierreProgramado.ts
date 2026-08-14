import { cerrarPapeletasVencidas } from '../services/cierre_votacion.service.js';
import { abrirPapeletasProgramadas } from '../services/apertura_votacion.service.js';
import { avanzarEtapasPrevias } from '../services/etapas_proceso.service.js';
import { reconciliarArchivados } from '../repositories/archivado.repository.js';

/**
 * Ciclo de vida automático de las papeletas: APERTURA y CIERRE.
 * También avanza las etapas previas del proceso electoral.
 *
 * Se comprueba cada minuto, que es la granularidad con la que se programan las
 * votaciones. Se usa `setInterval` en vez de una librería de cron porque no
 * hace falta una expresión horaria: es un intervalo fijo, y una dependencia
 * menos en un sistema electoral es una superficie menos que auditar. La zona
 * horaria no la decide el planificador sino la comparación, que se hace
 * siempre en hora de Ecuador (ver utils/zonaHoraria.ts).
 *
 * Las dos mitades van en la MISMA pasada y en este orden —primero abrir, luego
 * cerrar— porque el cierre solo recoge papeletas que ya están abiertas. Con dos
 * temporizadores distintos, una papeleta cuya ventana entera cupiera entre dos
 * pasadas podría abrirse y quedarse sin cerrar hasta el minuto siguiente.
 *
 * Al arrancar se ejecuta una reconciliación: si el servidor estuvo apagado
 * mientras una votación tenía que abrir o cerrar, se corrige en cuanto vuelve.
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
    // 0. Avanzar etapas tempranas del proceso
    await avanzarEtapasPrevias();

    // Primero abrir: el cierre solo recoge papeletas ya abiertas.
    const abiertas = await abrirPapeletasProgramadas();
    if (abiertas.length > 0) {
      console.info(
        `[apertura] (${motivo}) ${abiertas.length} papeleta(s) abierta(s): ` +
        abiertas.map((a) => a.titulo_papeleta).join(', ')
      );
    } else if (motivo === 'arranque') {
      console.info('[apertura] (arranque) no había papeletas pendientes de abrir');
    }

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
    console.error('[papeletas] la comprobación falló', err);
  } finally {
    enCurso = false;
  }
}

/** Arranca la reconciliación inicial y la comprobación periódica (apertura y cierre). */
export function iniciarCierreProgramado() {
  if (temporizador) return;

  void pasada('arranque');
  void reconciliarCandidaturasArchivadas();

  temporizador = setInterval(() => void pasada('programada'), CADA_UN_MINUTO);
  // No mantiene vivo el proceso por sí solo: si Node no tiene nada más que
  // hacer, debe poder terminar (importante para las pruebas y para un apagado
  // ordenado).
  temporizador.unref?.();

  console.info('[papeletas] apertura y cierre automáticos activos (cada minuto, hora de Ecuador)');
}

/**
 * Repara, una sola vez al arrancar, los procesos que se archivaron antes de que
 * el archivado liberase la candidatura: quedaban asignaciones en 'activa' y
 * responsables con rol 'candidato', y esas personas no podían volver a
 * postularse. No toca listas, votos, comprobantes ni actas.
 */
async function reconciliarCandidaturasArchivadas() {
  try {
    const reparados = await reconciliarArchivados();
    if (reparados.length === 0) return;
    for (const p of reparados) {
      console.info(
        `[archivado] reconciliado "${p.nombre_proceso}" (proceso ${p.id_proceso}): ` +
        `${p.asignacionesRetiradas} asignación(es) retirada(s), ` +
        `${p.responsablesLiberados.length} responsable(s) liberado(s)`
      );
    }
  } catch (err) {
    console.error('[archivado] la reconciliación de archivados falló', err);
  }
}

/** Detiene la comprobación periódica. Se usa en pruebas y al apagar. */
export function detenerCierreProgramado() {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}
