import * as repo from '../repositories/cierre_votacion.repository.js';
import * as votoRepo from '../repositories/voto.repository.js';
import * as notificaciones from './notificacion.service.js';
import { enviarCorreo } from '../config/correo.js';
import { ahoraEnEcuador, formatearEnEcuador } from '../utils/zonaHoraria.js';

/**
 * Cierre de papeletas.
 *
 * Una papeleta se cierra cuando su proceso pasa de `fecha_fin_votacion`. Al
 * cerrarse:
 *   - deja de aceptar votos de inmediato (el servicio de voto exige
 *     `estado = 'abierta'`, así que no hay nada más que hacer);
 *   - su escrutinio pasa a oficial (`obtenerResultados` lo deriva del estado);
 *   - se emite el acta, que es el rastro de auditoría: solo cifras agregadas,
 *     ninguna cédula, así que no relaciona a nadie con su voto;
 *   - se avisa a la administración en la campanita y por correo.
 *
 * Nada de esto toca los votos ni los comprobantes ya registrados.
 *
 * IDEMPOTENTE: el cierre efectivo es un UPDATE condicionado a que la papeleta
 * siga abierta. Si ya estaba cerrada —por otra ejecución, por el cierre manual
 * o por un reinicio— la función no vuelve a emitir acta, notificación ni
 * correo. Esta misma función es la que usa el cierre manual, para que ambos
 * caminos hagan exactamente lo mismo.
 */

const URL_RESULTADOS = process.env.URL_RESULTADOS_ADMIN || 'https://codevote.lat/admin/resultados';

export interface ResultadoCierre {
  id_votacion: number;
  titulo_papeleta: string;
  nombre_proceso: string;
  cerrada: boolean;          // ¿la cerró esta llamada?
  participacion: number;     // personas que votaron
  correoEnviado: boolean;
}

/** Cierra una papeleta concreta. Devuelve null si ya estaba cerrada. */
export async function cerrarPapeleta(papeleta: {
  id_votacion: number;
  titulo_papeleta: string;
  nombre_proceso: string;
  nombre_carrera?: string | null;
}): Promise<ResultadoCierre | null> {
  const cerrada = await repo.cerrarSiSigueAbierta(papeleta.id_votacion);
  if (!cerrada) return null; // otra ejecución llegó primero: no se repite nada

  const momento = ahoraEnEcuador();

  // Cifras del escrutinio, ya con la papeleta cerrada (resultado oficial).
  const [filas, participacion] = await Promise.all([
    votoRepo.countByVotacion(papeleta.id_votacion),
    votoRepo.countVotantes(papeleta.id_votacion),
  ]);

  const conteo = filas.map((f: any) => ({
    id_lista: f.id_lista == null ? null : Number(f.id_lista),
    opcion: String(f.opcion),
    total: Number(f.total_votos ?? 0),
  }));
  const suma = (predicado: (c: typeof conteo[number]) => boolean) =>
    conteo.filter(predicado).reduce((t, c) => t + c.total, 0);

  const validos = suma((c) => c.id_lista != null);
  const blancos = suma((c) => c.id_lista == null && /blanco/i.test(c.opcion));
  const nulos   = suma((c) => c.id_lista == null && /nulo/i.test(c.opcion));

  // Solo hay ganadora si una lista supera a las demás. Un empate no la tiene.
  const conVotos = conteo.filter((c) => c.id_lista != null && c.total > 0);
  const maximo = conVotos.reduce((may, c) => Math.max(may, c.total), 0);
  const enElMaximo = conVotos.filter((c) => c.total === maximo);
  const ganadora = enElMaximo.length === 1 ? enElMaximo[0].opcion : null;

  // El acta se emite una sola vez aunque una papeleta se reabriera y cerrara.
  if (!(await repo.tieneActa(papeleta.id_votacion))) {
    await repo.emitirActa({
      votacionId: papeleta.id_votacion,
      totalVotantes: participacion,
      validos, blancos, nulos, ganadora,
    });
  }

  const correoEnviado = await avisarALaAdministracion(papeleta, momento, participacion);

  console.info(
    `[cierre] ${papeleta.titulo_papeleta} (votación ${papeleta.id_votacion}) cerrada el ${momento} ` +
    `· participación ${participacion} · correo ${correoEnviado ? 'enviado' : 'no enviado'}`
  );

  return {
    id_votacion: papeleta.id_votacion,
    titulo_papeleta: papeleta.titulo_papeleta,
    nombre_proceso: papeleta.nombre_proceso,
    cerrada: true,
    participacion,
    correoEnviado,
  };
}

/**
 * Arma el correo de cierre. Se expone aparte del envío para poder comprobar su
 * contenido sin depender de un servidor SMTP.
 */
export function componerCorreoDeCierre(datos: {
  titulo_papeleta: string;
  nombre_proceso: string;
  nombre_carrera?: string | null;
  momento: string;
  participacion: number;
  destinatarios: string[];
}) {
  const cuando = formatearEnEcuador(datos.momento);
  const alcance = datos.nombre_carrera ? ` · ${datos.nombre_carrera}` : '';

  const texto = [
    `La papeleta "${datos.titulo_papeleta}"${alcance} se cerró y su escrutinio es oficial.`,
    '',
    `Proceso electoral: ${datos.nombre_proceso}`,
    `Papeleta cerrada:  ${datos.titulo_papeleta}`,
    `Fecha y hora:      ${cuando} (hora de Ecuador)`,
    `Participación:     ${datos.participacion} ${datos.participacion === 1 ? 'persona' : 'personas'}`,
    '',
    'Los resultados oficiales ya están disponibles:',
    URL_RESULTADOS,
    '',
    'CodeVote · Comisión Electoral Universitaria (UIDE)',
  ].join('\n');

  return {
    para: datos.destinatarios,
    asunto: `Votación cerrada · ${datos.titulo_papeleta}`,
    texto,
  };
}

/** Notificación en la campanita y correo, para la administración activa. */
async function avisarALaAdministracion(
  papeleta: { id_votacion: number; titulo_papeleta: string; nombre_proceso: string; nombre_carrera?: string | null },
  momento: string,
  participacion: number
): Promise<boolean> {
  const admins = await repo.administradoresActivos();
  if (admins.length === 0) return false;

  const cuando = formatearEnEcuador(momento);
  const alcance = papeleta.nombre_carrera ? ` · ${papeleta.nombre_carrera}` : '';

  await Promise.all(admins.map((a) => notificaciones.notificar(
    a.cedula,
    'escrutinio',
    'Votación cerrada',
    `"${papeleta.titulo_papeleta}"${alcance} cerró el ${cuando}. Resultados oficiales disponibles.`
  )));

  // Un solo correo para toda la administración, no uno por persona.
  return enviarCorreo(componerCorreoDeCierre({
    ...papeleta,
    momento,
    participacion,
    destinatarios: admins.map((a) => a.correo_institucional),
  }));
}

/**
 * Cierra todas las papeletas cuyo proceso ya venció.
 *
 * La usa tanto la tarea de cada minuto como la reconciliación del arranque: si
 * el servidor estuvo apagado cuando venció una votación, al levantarse la
 * encuentra y la cierra.
 */
export async function cerrarPapeletasVencidas(): Promise<ResultadoCierre[]> {
  const corte = ahoraEnEcuador();
  const vencidas = await repo.papeletasVencidas(corte);

  const cerradas: ResultadoCierre[] = [];
  const procesosTocados = new Set<number>();

  // En serie: son pocas y así un fallo en una no arrastra a las demás.
  for (const papeleta of vencidas) {
    procesosTocados.add(Number(papeleta.id_proceso));
    try {
      const resultado = await cerrarPapeleta(papeleta);
      if (resultado) cerradas.push(resultado);
    } catch (err) {
      console.error(`[cierre] falló el cierre de la votación ${papeleta.id_votacion}`, err);
    }
  }

  // Con la última papeleta cerrada, el proceso queda finalizado. Se intenta
  // también para los procesos cuyas papeletas ya estaban todas cerradas de antes
  // (cierre manual, o un reinicio a mitad de la pasada anterior): si no, un
  // proceso podría quedarse en 'votacion' para siempre.
  for (const procesoId of await procesosPendientesDeFinalizar(corte, procesosTocados)) {
    try {
      await finalizarProceso(procesoId, corte);
    } catch (err) {
      console.error(`[cierre] no se pudo finalizar el proceso ${procesoId}`, err);
    }
  }

  return cerradas;
}

/**
 * Procesos que podrían tener que finalizar: los que acaban de perder su última
 * papeleta abierta, más los que ya estaban del todo cerrados y siguen sin
 * finalizar. El UPDATE de `finalizarSiTodoCerrado` es el que decide de verdad.
 */
async function procesosPendientesDeFinalizar(
  corte: string, tocados: Set<number>
): Promise<number[]> {
  const candidatos = new Set(tocados);
  for (const id of await repo.procesosVencidosSinFinalizar(corte)) candidatos.add(Number(id));
  return [...candidatos];
}

/** Finaliza el proceso y avisa una sola vez a quienes participaron. */
async function finalizarProceso(procesoId: number, corte: string) {
  if (!(await repo.finalizarSiTodoCerrado(procesoId, corte))) return;

  const nombre = (await repo.nombreDeProceso(procesoId)) ?? 'Proceso electoral';
  console.info(`[cierre] proceso ${procesoId} ("${nombre}") finalizado: todas sus papeletas están cerradas`);

  // El aviso va DESPUÉS del UPDATE y solo si este cambió algo, así que repetir
  // la pasada no vuelve a notificar.
  await notificaciones.notificarResultadosDeProceso(procesoId, nombre);
}
