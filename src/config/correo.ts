import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Envío de correo por SMTP.
 *
 * Es OPCIONAL a propósito. Si faltan las variables de entorno, el transporte no
 * se crea y `enviarCorreo` devuelve `false` tras dejar constancia en el log: el
 * cierre de una votación no puede quedar a medias porque el servidor de correo
 * no esté configurado o esté caído. El acta, la notificación interna y el
 * propio cierre ocurren igual.
 *
 * Variables (ver .env.example):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 *   SMTP_SECURE=true  -> TLS directo (puerto 465). Por defecto STARTTLS (587).
 */

interface ConfiguracionSMTP {
  host: string;
  port: number;
  user: string;
  password: string;
  from?: string;
  secure: boolean;
}

/**
 * Lee las variables en el momento del envío. En contenedores y procesos
 * administrados la configuración puede inyectarse después de cargar el módulo;
 * capturar `process.env` al importar dejaba un transporte permanentemente vacío.
 */
function leerConfiguracion(): ConfiguracionSMTP | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !password) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('[correo] SMTP_PORT no es válido; usa 587 (STARTTLS) o 465 (TLS).');
    return null;
  }

  return {
    host,
    port,
    user,
    password,
    from: process.env.SMTP_FROM?.trim() || user,
    // 465 siempre necesita TLS directo; 587 usa STARTTLS por defecto.
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
  };
}

export function correoConfigurado(): boolean {
  return leerConfiguracion() !== null;
}

let transporte: Transporter | null = null;
let huellaTransporte = '';

function obtenerTransporte(): Transporter | null {
  const configuracion = leerConfiguracion();
  if (!configuracion) return null;
  const huella = [configuracion.host, configuracion.port, configuracion.user, configuracion.password, configuracion.secure].join('|');
  if (!transporte || huella !== huellaTransporte) {
    transporte = nodemailer.createTransport({
      host: configuracion.host,
      port: configuracion.port,
      secure: configuracion.secure,
      auth: { user: configuracion.user, pass: configuracion.password },
    });
    huellaTransporte = huella;
  }
  return transporte;
}

export interface Correo {
  para: string[];
  asunto: string;
  texto: string;
  html?: string;
}

/**
 * Envía un correo. Devuelve si salió de verdad.
 *
 * Nunca lanza: quien llama está en medio de una operación electoral y un fallo
 * de correo no debe interrumpirla ni provocar un reintento del cierre.
 */
export async function enviarCorreo(correo: Correo): Promise<boolean> {
  const destinatarios = correo.para.filter(Boolean);
  if (destinatarios.length === 0) return false;

  const cliente = obtenerTransporte();
  if (!cliente) {
    console.warn(
      `[correo] SMTP sin configurar: no se envió "${correo.asunto}" a ${destinatarios.length} destinatario(s). ` +
      'Define SMTP_HOST, SMTP_USER y SMTP_PASSWORD para activarlo.'
    );
    return false;
  }

  try {
    const configuracion = leerConfiguracion();
    await cliente.sendMail({
      from: configuracion?.from,
      to: destinatarios.join(', '),
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
    return true;
  } catch (err: any) {
    console.error('[correo] no se pudo enviar', correo.asunto, {
      code: err?.code,
      responseCode: err?.responseCode,
      response: err?.response,
      message: err?.message,
    });
    return false;
  }
}
