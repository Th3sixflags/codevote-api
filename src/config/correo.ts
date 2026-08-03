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

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;

export const correoConfigurado = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);

let transporte: Transporter | null = null;

function obtenerTransporte(): Transporter | null {
  if (!correoConfigurado) return null;
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
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
    await cliente.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: destinatarios.join(', '),
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
    return true;
  } catch (err) {
    console.error('[correo] no se pudo enviar', correo.asunto, err);
    return false;
  }
}
