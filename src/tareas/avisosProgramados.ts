import * as avisoRepo from '../repositories/aviso_electoral.repository.js';
import * as recordatorioRepo from '../repositories/recordatorio.repository.js';
import * as avisos from '../services/avisos_electorales.service.js';
import { limpiarCaducados } from '../repositories/codigo_acceso.repository.js';
import { limpiarArchivosHuerfanos } from '../services/limpieza_archivos.service.js';
import { enviarCorreo } from '../config/correo.js';
import * as notificaciones from '../services/notificacion.service.js';
import { ahoraEnEcuador, formatearEnEcuador } from '../utils/zonaHoraria.js';

/**
 * Avisos por correo del calendario electoral.
 *
 * Corre cada minuto, igual que el cierre automático y por el mismo motivo: es la
 * granularidad con la que se programan las votaciones. Cada pasada mira si toca
 * algún aviso y, si toca, lo envía UNA sola vez (la reserva contra la clave
 * única de `aviso_papeleta` es lo que lo garantiza, incluso con dos instancias
 * del servidor).
 *
 * Los cuatro avisos automáticos:
 *   apertura        la papeleta empezó y sigue abierta;
 *   cierre_proximo  falta poco para cerrar, solo a quienes no han votado;
 *   sancion         la papeleta cerró: se registra la falta de los ausentes;
 *   convocatoria    no se dispara aquí, sino al crear la papeleta.
 *
 * Y además despacha los recordatorios que la administración programó a mano.
 *
 * Ventanas de recuperación
 * ------------------------
 * Cada aviso tiene una ventana hacia atrás para cubrir el rato en que el
 * servidor pudo estar apagado. Son deliberadamente cortas: sin ellas, al
 * desplegar por primera vez la tabla de avisos está vacía y el sistema
 * interpretaría que NINGUNA papeleta histórica fue avisada, mandando correos —y
 * peor, sanciones— por elecciones que terminaron hace meses.
 */

const CADA_UN_MINUTO = 60_000;

function entero(nombre: string, porDefecto: number): number {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : porDefecto;
}

/** Cuánto antes del cierre se manda la última llamada. */
const HORAS_AVISO_CIERRE = entero('HORAS_AVISO_CIERRE', 24);
/**
 * Cuánto hacia atrás se mira para sancionar. Una papeleta que cerró antes de
 * esta ventana se considera historial y NO se sanciona: así estrenar la función
 * no reparte faltas por elecciones antiguas.
 */
const HORAS_GRACIA_SANCION = entero('HORAS_GRACIA_SANCION', 48);

const HORA = 60 * 60 * 1000;

let temporizador: NodeJS.Timeout | null = null;
let enCurso = false;

/** 'YYYY-MM-DD HH:mm:ss' en hora de Ecuador, desplazado los milisegundos dados. */
const enEcuador = (desfaseMs: number) => ahoraEnEcuador(new Date(Date.now() + desfaseMs));

function registrar(resultado: avisos.ResultadoAviso | null) {
  if (!resultado) return;
  console.info(
    `[avisos] ${resultado.tipo} · "${resultado.titulo}" · ` +
    `${resultado.destinatarios} destinatario(s), ${resultado.correosEnviados} correo(s) enviado(s)`
  );
}

/** Papeletas que ya abrieron y siguen admitiendo votos. */
async function avisarAperturas() {
  const papeletas = await avisoRepo.papeletasEnVentana(
    'fecha_apertura', enEcuador(-7 * 24 * HORA), enEcuador(0)
  );
  for (const p of papeletas) {
    // Si ya cerró, el aviso de apertura no tiene sentido.
    if (p.fecha_cierre <= ahoraEnEcuador()) continue;
    registrar(await avisos.avisarApertura(p));
  }
}

/** Última llamada a quienes todavía no votaron. */
async function avisarCierresProximos() {
  const papeletas = await avisoRepo.papeletasEnVentana(
    'fecha_cierre', enEcuador(0), enEcuador(HORAS_AVISO_CIERRE * HORA)
  );
  for (const p of papeletas) {
    // Solo si ya se puede votar: avisar "última llamada" de algo que aún no
    // abrió confundiría más que ayudar.
    if (p.fecha_apertura > ahoraEnEcuador()) continue;
    registrar(await avisos.avisarCierreProximo(p, HORAS_AVISO_CIERRE));
  }
}

/** Papeletas recién cerradas: falta para quien no votó. */
async function sancionarAusencias() {
  const papeletas = await avisoRepo.papeletasEnVentana(
    'fecha_cierre', enEcuador(-HORAS_GRACIA_SANCION * HORA), enEcuador(0)
  );
  for (const p of papeletas) {
    registrar(await avisos.sancionarAusentes(p));
  }
}

/**
 * Despacha los recordatorios manuales vencidos, de uno en uno.
 *
 * La reserva marca el envío ANTES de mandar nada: si el correo falla después, se
 * anota el error y la administración lo ve como "fallido" en el panel. Se
 * prefiere un aviso perdido y visible a un correo duplicado a todo el padrón.
 */
async function despacharRecordatorios() {
  const corte = ahoraEnEcuador();

  // De uno en uno para que un recordatorio a mucha gente no bloquee la pasada.
  for (let i = 0; i < 5; i += 1) {
    const id = await recordatorioRepo.reservarVencido(corte);
    if (!id) return;

    const recordatorio = await recordatorioRepo.findById(id);
    if (!recordatorio) continue;

    try {
      const destinatarios = recordatorio.fk_id_votacion
        ? await avisoRepo.padronDePapeleta(
            (await avisoRepo.papeletaParaAviso(recordatorio.fk_id_votacion))?.carrera_votacion ?? null,
            recordatorio.solo_pendientes,
            recordatorio.fk_id_votacion
          )
        : await avisoRepo.padronDeProceso(recordatorio.fk_id_proceso);

      const pie = recordatorio.fk_id_votacion
        ? `\n\nVota aquí:\n${avisos.enlaceDePapeleta(recordatorio.fk_id_votacion)}`
        : `\n\nRevisa las votaciones abiertas:\n${avisos.enlaceDeElecciones()}`;

      const enviados = await avisos.enviarATodos(destinatarios, {
        asunto: recordatorio.asunto,
        texto: `${recordatorio.mensaje}${pie}\n\nCodeVote · Plataforma de Votaciones Institucionales`,
        html: `
          <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#201d1f">
            <h1 style="font-size:19px;color:#4b0d2b;margin:0 0 16px">${recordatorio.asunto}</h1>
            <p style="font-size:15px;white-space:pre-line">${recordatorio.mensaje}</p>
            <p style="margin:26px 0;text-align:center">
              <a href="${recordatorio.fk_id_votacion ? avisos.enlaceDePapeleta(recordatorio.fk_id_votacion) : avisos.enlaceDeElecciones()}"
                 style="display:inline-block;padding:13px 26px;background:#4b0d2b;color:#fff;border-radius:10px;
                        text-decoration:none;font-weight:600">Ir a CodeVote</a>
            </p>
            <hr style="border:0;border-top:1px solid #e7e1dd;margin:24px 0">
            <p style="font-size:12px;color:#8a8184">CodeVote · Plataforma de Votaciones Institucionales</p>
          </div>`,
      });

      await Promise.all(destinatarios.map((d) => notificaciones.notificar(
        d.cedula, 'proceso', recordatorio.asunto.slice(0, 120), recordatorio.mensaje.slice(0, 255)
      )));

      await recordatorioRepo.anotarResultado(id, destinatarios.length, null);
      console.info(`[avisos] recordatorio ${id} · "${recordatorio.asunto}" · ${destinatarios.length} destinatario(s), ${enviados} correo(s)`);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      await recordatorioRepo.anotarResultado(id, 0, motivo.slice(0, 250));
      console.error(`[avisos] el recordatorio ${id} falló`, err);
    }
  }
}

/**
 * Mantenimiento periódico: códigos de acceso caducados y archivos huérfanos.
 *
 * Cada seis horas, no cada minuto: recorrer el directorio de subidas y consultar
 * las columnas de archivos no es gratis, y ninguna de las dos cosas es urgente.
 *
 * Los archivos huérfanos importan más de lo que parece en un servidor pequeño:
 * las imágenes se suben al ELEGIRLAS, así que cada formulario cancelado deja una
 * en disco. Sin esta limpieza el goteo acaba llenando el disco, y un disco lleno
 * tumba MySQL en plena votación.
 */
let ultimoMantenimiento = 0;
async function mantenimiento() {
  if (Date.now() - ultimoMantenimiento < 6 * HORA) return;
  ultimoMantenimiento = Date.now();

  const borrados = await limpiarCaducados();
  if (borrados > 0) console.info(`[avisos] ${borrados} código(s) de acceso caducado(s) eliminado(s)`);

  const archivos = await limpiarArchivosHuerfanos();
  if (archivos.borrados > 0) {
    const mb = (archivos.bytesLiberados / (1024 * 1024)).toFixed(1);
    console.info(
      `[limpieza] ${archivos.borrados} archivo(s) sin usar eliminado(s) de ${archivos.revisados} revisado(s) · ${mb} MB liberados`
    );
  }

  const notificacionesBorradas = await notificaciones.limpiarLeidasAntiguas(
    entero('DIAS_RETENCION_NOTIFICACIONES', 7)
  );
  if (notificacionesBorradas > 0) {
    console.info(`[limpieza] ${notificacionesBorradas} notificación(es) leída(s) antigua(s) eliminada(s)`);
  }
}

export async function ejecutarPasadaDeAvisos(
  motivo: 'arranque' | 'programada', propagarError = false
) {
  if (enCurso) return;
  enCurso = true;
  try {
    await avisarAperturas();
    await avisarCierresProximos();
    await sancionarAusencias();
    await despacharRecordatorios();
    await mantenimiento();
  } catch (err) {
    // Nunca se propaga: un fallo puntual no debe tumbar el proceso ni impedir
    // que la siguiente pasada lo intente de nuevo.
    console.error(`[avisos] (${motivo}) la comprobación falló`, err);
    if (propagarError) throw err;
  } finally {
    enCurso = false;
  }
}

export function iniciarAvisosProgramados() {
  if (temporizador) return;

  void ejecutarPasadaDeAvisos('arranque');
  temporizador = setInterval(() => void ejecutarPasadaDeAvisos('programada'), CADA_UN_MINUTO);
  temporizador.unref?.();

  console.info(
    `[avisos] recordatorios por correo activos (cada minuto · última llamada ${HORAS_AVISO_CIERRE} h antes del cierre · ` +
    `sanciones hasta ${HORAS_GRACIA_SANCION} h después)`
  );
}

export function detenerAvisosProgramados() {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}

/** Se exportan para las pruebas y para un disparo manual desde el panel. */
export { avisarAperturas, avisarCierresProximos, sancionarAusencias, despacharRecordatorios };
export { enviarCorreo, formatearEnEcuador };
