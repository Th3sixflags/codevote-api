import * as repo from '../repositories/apertura_votacion.repository.js';
import * as cierreRepo from '../repositories/cierre_votacion.repository.js';
import * as notificaciones from './notificacion.service.js';
import { ahoraEnEcuador, formatearEnEcuador } from '../utils/zonaHoraria.js';

/**
 * Apertura automática de papeletas.
 *
 * Simétrica al cierre: cuando llega `fecha_apertura`, la papeleta pasa a
 * 'abierta' y su proceso a 'votacion'. Antes esto no lo hacía nadie —la papeleta
 * se creaba 'pendiente' y ahí se quedaba para siempre—, así que una votación
 * programada para las 18:00 jamás abría sola.
 *
 * IDEMPOTENTE: el UPDATE está condicionado a que la papeleta siga 'pendiente'.
 * Si otra pasada llegó antes, o si la administración la abrió a mano, esta
 * función no vuelve a notificar.
 *
 * El aviso por correo al padrón NO se manda aquí: de eso ya se encarga
 * `avisarAperturas` en tareas/avisosProgramados.ts, que trabaja sobre las
 * fechas y lleva su propio control de "enviado una sola vez". Duplicarlo
 * mandaría dos correos por la misma apertura.
 */

export interface ResultadoApertura {
  id_votacion: number;
  titulo_papeleta: string;
  nombre_proceso: string;
  abierta: boolean;
}

/**
 * Abre todas las papeletas cuya hora de apertura ya llegó y pone en 'votacion'
 * los procesos cuya jornada empezó.
 *
 * La usa tanto la tarea de cada minuto como la reconciliación del arranque: si
 * el servidor estuvo apagado cuando tocaba abrir, al levantarse lo corrige.
 */
export async function abrirPapeletasProgramadas(): Promise<ResultadoApertura[]> {
  const corte = ahoraEnEcuador();
  const porAbrir = await repo.papeletasPorAbrir(corte);

  const abiertas: ResultadoApertura[] = [];
  const procesosTocados = new Set<number>();

  // En serie: son pocas y así un fallo en una no arrastra a las demás.
  for (const papeleta of porAbrir) {
    procesosTocados.add(Number(papeleta.id_proceso));
    try {
      if (!(await repo.abrirSiSiguePendiente(papeleta.id_votacion))) continue;

      console.info(
        `[apertura] ${papeleta.titulo_papeleta} (votación ${papeleta.id_votacion}) abierta el ` +
        `${formatearEnEcuador(corte)} · cierra el ${formatearEnEcuador(papeleta.fecha_cierre)}`
      );

      await avisarALaAdministracion(papeleta, corte);

      abiertas.push({
        id_votacion: papeleta.id_votacion,
        titulo_papeleta: papeleta.titulo_papeleta,
        nombre_proceso: papeleta.nombre_proceso,
        abierta: true,
      });
    } catch (err) {
      console.error(`[apertura] falló la apertura de la votación ${papeleta.id_votacion}`, err);
    }
  }

  // El proceso pasa a 'votacion' aunque no se acabara de abrir ninguna papeleta
  // suya: puede que ya estuvieran abiertas y solo faltara la etiqueta.
  for (const procesoId of await procesosPorPonerEnVotacion(corte, procesosTocados)) {
    try {
      if (await repo.marcarProcesoEnVotacion(procesoId, corte)) {
        const nombre = (await cierreRepo.nombreDeProceso(procesoId)) ?? 'Proceso electoral';
        console.info(`[apertura] proceso ${procesoId} ("${nombre}") en jornada de votación`);
      }
    } catch (err) {
      console.error(`[apertura] no se pudo poner en votación el proceso ${procesoId}`, err);
    }
  }

  return abiertas;
}

/**
 * Procesos candidatos a pasar a 'votacion': los de las papeletas que se acaban
 * de abrir, más los de las papeletas que ya estaban abiertas y cuyo proceso se
 * quedó en una etapa previa. El UPDATE de `marcarProcesoEnVotacion` es el que
 * decide de verdad.
 */
async function procesosPorPonerEnVotacion(
  corte: string, tocados: Set<number>
): Promise<number[]> {
  const candidatos = new Set(tocados);
  for (const id of await repo.procesosEnJornadaSinMarcar(corte)) candidatos.add(Number(id));
  return [...candidatos];
}

/** Aviso en la campanita para la administración. Sin correo: sería ruido diario. */
async function avisarALaAdministracion(
  papeleta: { titulo_papeleta: string; nombre_carrera?: string | null; fecha_cierre: string },
  momento: string
) {
  const admins = await cierreRepo.administradoresActivos();
  if (admins.length === 0) return;

  const alcance = papeleta.nombre_carrera ? ` · ${papeleta.nombre_carrera}` : '';
  await Promise.all(admins.map((a) => notificaciones.notificar(
    a.cedula,
    'proceso',
    'Votación abierta',
    `"${papeleta.titulo_papeleta}"${alcance} abrió el ${formatearEnEcuador(momento)} ` +
    `y cierra el ${formatearEnEcuador(papeleta.fecha_cierre)}.`
  )));
}
