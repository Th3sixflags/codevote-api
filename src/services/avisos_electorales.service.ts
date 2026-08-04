import * as repo from '../repositories/aviso_electoral.repository.js';
import type { Destinatario, PapeletaParaAviso, TipoAviso } from '../repositories/aviso_electoral.repository.js';
import * as notificaciones from './notificacion.service.js';
import { enviarCorreo } from '../config/correo.js';
import { formatearEnEcuador } from '../utils/zonaHoraria.js';

/**
 * Avisos por correo del calendario electoral.
 *
 * Cuatro momentos, todos automáticos:
 *
 *   convocatoria    Se creó una papeleta: se anuncia el proceso a su padrón,
 *                   con fechas y de qué trata.
 *   apertura        Empezó la votación: "ya puedes votar", con el enlace directo.
 *   cierre_proximo  Falta poco para cerrar: solo a quienes AÚN NO han votado.
 *   sancion         La papeleta cerró: se registra y se avisa a quien no votó.
 *
 * Reglas que comparten todos:
 *
 *   1. El destinatario es exactamente el padrón de esa papeleta (global o de la
 *      carrera), el mismo que decide quién puede votarla.
 *   2. Cada aviso sale UNA sola vez. La reserva se hace con un INSERT contra una
 *      clave única ANTES de enviar; si la fila ya existía, no se envía nada.
 *      Comprobar y luego enviar dejaría una ventana en la que dos pasadas de la
 *      tarea mandarían el mismo correo a todo el padrón.
 *   3. Los correos van en COPIA OCULTA implícita: se manda un mensaje por
 *      persona, nunca uno con todo el padrón en el "para". Ver `enviarATodos`.
 *   4. Nada de esto interrumpe el flujo electoral: si el correo falla, se
 *      registra y se sigue.
 *
 * ANONIMATO: "quién no ha votado" se consulta en `codigo_voto`, que prueba la
 * participación sin revelar la opción. La tabla `voto` no se toca aquí.
 */

/** Base pública del frontend, para los enlaces de los correos. */
const URL_APP = (process.env.URL_APP ?? 'https://codevote.lat').replace(/\/+$/, '');

/** Enlace directo a una papeleta. Es el que se imprime también como QR. */
export function enlaceDePapeleta(votacionId: number): string {
  return `${URL_APP}/votacion/${votacionId}`;
}

/** Enlace al listado de procesos abiertos. */
export function enlaceDeElecciones(): string {
  return `${URL_APP}/elecciones`;
}

const TIPO_LEGIBLE: Record<string, string> = {
  consejo_estudiantil:   'Consejo Estudiantil',
  representante_carrera: 'Representante de carrera',
  referendum:            'Referéndum',
};

/** Envoltura HTML común, para que todos los correos se vean igual. */
function plantilla(titulo: string, cuerpo: string, boton?: { texto: string; url: string }) {
  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#201d1f">
      <h1 style="font-size:19px;color:#4b0d2b;margin:0 0 16px">${titulo}</h1>
      ${cuerpo}
      ${boton ? `<p style="margin:26px 0;text-align:center">
        <a href="${boton.url}" style="display:inline-block;padding:13px 26px;background:#4b0d2b;color:#fff;
           border-radius:10px;text-decoration:none;font-weight:600">${boton.texto}</a>
      </p>
      <p style="font-size:12px;color:#8a8184;text-align:center;word-break:break-all">${boton.url}</p>` : ''}
      <hr style="border:0;border-top:1px solid #e7e1dd;margin:24px 0">
      <p style="font-size:12px;color:#8a8184">CodeVote · Comisión Electoral Universitaria (UIDE)</p>
    </div>`;
}

const alcanceDe = (p: PapeletaParaAviso) => (p.nombre_carrera ? ` · ${p.nombre_carrera}` : '');

// --- Plantillas -------------------------------------------------------------
// Se exportan para poder comprobar su contenido sin depender de un SMTP.

export function componerConvocatoria(p: PapeletaParaAviso) {
  const desde = formatearEnEcuador(p.fecha_apertura);
  const hasta = formatearEnEcuador(p.fecha_cierre);
  const tipo  = TIPO_LEGIBLE[p.tipo_proceso] ?? p.tipo_proceso;

  const texto = [
    `Se convocó un nuevo proceso de votación: ${p.nombre_proceso}.`,
    '',
    `Papeleta:  ${p.titulo_papeleta}${alcanceDe(p)}`,
    `Tipo:      ${tipo}`,
    p.descripcion ? `De qué trata: ${p.descripcion}` : '',
    '',
    `La votación abre el ${desde} y cierra el ${hasta} (hora de Ecuador).`,
    '',
    'Cuando llegue el momento podrás votar aquí:',
    enlaceDePapeleta(p.id_votacion),
    '',
    'Te avisaremos de nuevo cuando la votación esté abierta.',
    '',
    'CodeVote · Comisión Electoral Universitaria (UIDE)',
  ].filter((l) => l !== '').join('\n');

  const html = plantilla(
    `Nuevo proceso de votación: ${p.nombre_proceso}`,
    `<p style="font-size:15px">Se convocó la papeleta <strong>${p.titulo_papeleta}</strong>${alcanceDe(p)}.</p>
     ${p.descripcion ? `<p style="font-size:15px;color:#5b5457">${p.descripcion}</p>` : ''}
     <table style="font-size:14px;border-collapse:collapse;margin:18px 0">
       <tr><td style="padding:4px 14px 4px 0;color:#8a8184">Tipo</td><td>${tipo}</td></tr>
       <tr><td style="padding:4px 14px 4px 0;color:#8a8184">Abre</td><td>${desde}</td></tr>
       <tr><td style="padding:4px 14px 4px 0;color:#8a8184">Cierra</td><td>${hasta}</td></tr>
     </table>
     <p style="font-size:14px;color:#5b5457">Te avisaremos de nuevo cuando la votación esté abierta.</p>`,
    { texto: 'Ver el proceso', url: enlaceDePapeleta(p.id_votacion) }
  );

  return { asunto: `Nuevo proceso de votación: ${p.nombre_proceso}`, texto, html };
}

export function componerApertura(p: PapeletaParaAviso) {
  const hasta = formatearEnEcuador(p.fecha_cierre);

  const texto = [
    `Ya puedes votar en "${p.titulo_papeleta}"${alcanceDe(p)}.`,
    '',
    `Proceso: ${p.nombre_proceso}`,
    `Tienes hasta el ${hasta} (hora de Ecuador).`,
    '',
    'Vota aquí:',
    enlaceDePapeleta(p.id_votacion),
    '',
    'Tu voto es secreto: se guarda sin tu cédula y nadie puede saber qué elegiste.',
    '',
    'CodeVote · Comisión Electoral Universitaria (UIDE)',
  ].join('\n');

  const html = plantilla(
    'La votación ya está abierta',
    `<p style="font-size:15px">Ya puedes votar en <strong>${p.titulo_papeleta}</strong>${alcanceDe(p)},
       del proceso ${p.nombre_proceso}.</p>
     <p style="font-size:15px">Tienes hasta el <strong>${hasta}</strong> (hora de Ecuador).</p>
     <p style="font-size:13px;color:#5b5457">Tu voto es secreto: se guarda sin tu cédula y nadie puede
       saber qué elegiste.</p>`,
    { texto: 'Votar ahora', url: enlaceDePapeleta(p.id_votacion) }
  );

  return { asunto: `Ya puedes votar · ${p.titulo_papeleta}`, texto, html };
}

export function componerCierreProximo(p: PapeletaParaAviso, horas: number) {
  const hasta = formatearEnEcuador(p.fecha_cierre);
  const cuanto = horas === 1 ? 'una hora' : `${horas} horas`;

  const texto = [
    `Te quedan menos de ${cuanto} para votar en "${p.titulo_papeleta}"${alcanceDe(p)}.`,
    '',
    `La votación cierra el ${hasta} (hora de Ecuador).`,
    'Según nuestros registros todavía no has emitido tu voto.',
    '',
    'Vota aquí:',
    enlaceDePapeleta(p.id_votacion),
    '',
    'No votar queda registrado como falta en el padrón electoral.',
    '',
    'CodeVote · Comisión Electoral Universitaria (UIDE)',
  ].join('\n');

  const html = plantilla(
    `Te quedan menos de ${cuanto} para votar`,
    `<p style="font-size:15px">Todavía no has votado en <strong>${p.titulo_papeleta}</strong>${alcanceDe(p)}.</p>
     <p style="font-size:15px">La votación cierra el <strong>${hasta}</strong> (hora de Ecuador).</p>
     <p style="font-size:13px;color:#5b5457">No votar queda registrado como falta en el padrón electoral.</p>`,
    { texto: 'Votar ahora', url: enlaceDePapeleta(p.id_votacion) }
  );

  return { asunto: `Última llamada para votar · ${p.titulo_papeleta}`, texto, html };
}

export function componerSancion(p: PapeletaParaAviso) {
  const cerro = formatearEnEcuador(p.fecha_cierre);

  const texto = [
    `La votación "${p.titulo_papeleta}"${alcanceDe(p)} cerró el ${cerro} y no registramos tu voto.`,
    '',
    `Proceso: ${p.nombre_proceso}`,
    '',
    'Por no participar se registró una falta a tu nombre en el padrón electoral.',
    'Si tuviste un motivo justificado, comunícate con la Comisión Electoral',
    'Universitaria para solicitar su justificación.',
    '',
    'Puedes consultar tus faltas en:',
    `${URL_APP}/perfil`,
    '',
    'CodeVote · Comisión Electoral Universitaria (UIDE)',
  ].join('\n');

  const html = plantilla(
    'No registramos tu voto',
    `<p style="font-size:15px">La votación <strong>${p.titulo_papeleta}</strong>${alcanceDe(p)} cerró
       el ${cerro} y no registramos tu voto.</p>
     <p style="font-size:15px">Por no participar se registró una <strong>falta</strong> a tu nombre en el
       padrón electoral.</p>
     <p style="font-size:13px;color:#5b5457">Si tuviste un motivo justificado, comunícate con la Comisión
       Electoral Universitaria para solicitar su justificación.</p>`,
    { texto: 'Ver mis faltas', url: `${URL_APP}/perfil` }
  );

  return { asunto: `No registramos tu voto · ${p.titulo_papeleta}`, texto, html };
}

// --- Envío ------------------------------------------------------------------

/**
 * Un correo POR PERSONA, nunca uno con todo el padrón en el "para": eso
 * publicaría la lista completa de correos institucionales a cada destinatario.
 *
 * Se envían en tandas para no abrir cientos de conexiones SMTP a la vez ni que
 * el proveedor lo tome por spam. Devuelve cuántos salieron de verdad.
 */
async function enviarATodos(
  destinatarios: Destinatario[], correo: { asunto: string; texto: string; html: string }
): Promise<number> {
  const TANDA = 20;
  let enviados = 0;

  for (let i = 0; i < destinatarios.length; i += TANDA) {
    const tanda = destinatarios.slice(i, i + TANDA);
    const resultados = await Promise.all(
      tanda.map((d) => enviarCorreo({ para: [d.correo_institucional], ...correo }))
    );
    enviados += resultados.filter(Boolean).length;
  }
  return enviados;
}

export interface ResultadoAviso {
  tipo: TipoAviso;
  votacionId: number;
  titulo: string;
  destinatarios: number;
  correosEnviados: number;
}

/**
 * Envía un aviso a todo el padrón de la papeleta, una sola vez.
 * Devuelve null si ese aviso ya se había enviado.
 */
async function avisarAlPadron(
  papeleta: PapeletaParaAviso,
  tipo: TipoAviso,
  correo: { asunto: string; texto: string; html: string },
  opciones: { soloPendientes?: boolean; notificacion?: { tipo: string; titulo: string; mensaje: string } } = {}
): Promise<ResultadoAviso | null> {
  // La reserva va PRIMERO: si otra pasada ya lo tomó, aquí no se envía nada.
  if (!(await repo.reservarAviso(papeleta.id_votacion, tipo))) return null;

  const destinatarios = await repo.padronDePapeleta(
    papeleta.carrera_votacion, opciones.soloPendientes === true, papeleta.id_votacion
  );

  const enviados = await enviarATodos(destinatarios, correo);

  // Además del correo, la campanita de la aplicación.
  if (opciones.notificacion) {
    await Promise.all(destinatarios.map((d) => notificaciones.notificar(
      d.cedula, opciones.notificacion!.tipo, opciones.notificacion!.titulo, opciones.notificacion!.mensaje
    )));
  }

  await repo.anotarResultadoDeAviso(papeleta.id_votacion, tipo, destinatarios.length, enviados > 0);

  return {
    tipo,
    votacionId: papeleta.id_votacion,
    titulo: papeleta.titulo_papeleta,
    destinatarios: destinatarios.length,
    correosEnviados: enviados,
  };
}

/** Convocatoria: se acaba de crear la papeleta. */
export async function avisarConvocatoria(votacionId: number): Promise<ResultadoAviso | null> {
  const papeleta = await repo.papeletaParaAviso(votacionId);
  if (!papeleta) return null;

  return avisarAlPadron(papeleta, 'convocatoria', componerConvocatoria(papeleta), {
    notificacion: {
      tipo: 'proceso',
      titulo: 'Nuevo proceso de votación',
      mensaje: `Se convocó "${papeleta.titulo_papeleta}" del proceso ${papeleta.nombre_proceso}. Revisa las fechas en Elecciones.`,
    },
  });
}

/** Apertura: la votación ya admite votos. */
export async function avisarApertura(papeleta: PapeletaParaAviso): Promise<ResultadoAviso | null> {
  return avisarAlPadron(papeleta, 'apertura', componerApertura(papeleta), {
    notificacion: {
      tipo: 'proceso',
      titulo: 'La votación está abierta',
      mensaje: `Ya puedes votar en "${papeleta.titulo_papeleta}". Tienes hasta el cierre para hacerlo.`,
    },
  });
}

/** Última llamada, solo a quienes todavía no votaron. */
export async function avisarCierreProximo(
  papeleta: PapeletaParaAviso, horas: number
): Promise<ResultadoAviso | null> {
  return avisarAlPadron(papeleta, 'cierre_proximo', componerCierreProximo(papeleta, horas), {
    soloPendientes: true,
    notificacion: {
      tipo: 'proceso',
      titulo: 'Última llamada para votar',
      mensaje: `Todavía no votas en "${papeleta.titulo_papeleta}" y la votación está por cerrar.`,
    },
  });
}

/**
 * Papeleta cerrada: se registra la falta de quienes no votaron y se les avisa.
 *
 * La sanción queda en `sancion_electoral` como historial verificable, no solo
 * como un correo: la administración puede justificarla o anularla después.
 */
export async function sancionarAusentes(papeleta: PapeletaParaAviso): Promise<ResultadoAviso | null> {
  if (!(await repo.reservarAviso(papeleta.id_votacion, 'sancion'))) return null;

  const ausentes = await repo.padronDePapeleta(papeleta.carrera_votacion, true, papeleta.id_votacion);
  if (ausentes.length === 0) {
    await repo.anotarResultadoDeAviso(papeleta.id_votacion, 'sancion', 0, false);
    return { tipo: 'sancion', votacionId: papeleta.id_votacion, titulo: papeleta.titulo_papeleta, destinatarios: 0, correosEnviados: 0 };
  }

  await repo.registrarSanciones(
    papeleta.id_votacion,
    ausentes.map((a) => a.cedula),
    `No participó en "${papeleta.titulo_papeleta}"`.slice(0, 150)
  );

  const enviados = await enviarATodos(ausentes, componerSancion(papeleta));
  if (enviados > 0) await repo.marcarSancionesNotificadas(papeleta.id_votacion);

  await Promise.all(ausentes.map((a) => notificaciones.notificar(
    a.cedula, 'sancion', 'Falta por no votar',
    `No registramos tu voto en "${papeleta.titulo_papeleta}". Se registró una falta a tu nombre.`
  )));

  await repo.anotarResultadoDeAviso(papeleta.id_votacion, 'sancion', ausentes.length, enviados > 0);

  return {
    tipo: 'sancion',
    votacionId: papeleta.id_votacion,
    titulo: papeleta.titulo_papeleta,
    destinatarios: ausentes.length,
    correosEnviados: enviados,
  };
}

// --- Consultas del panel ----------------------------------------------------

export const listarSanciones = repo.listarSanciones;
export const sancionesDeEstudiante = repo.sancionesDeEstudiante;
export const resolverSancion = repo.resolverSancion;
export { enviarATodos };
