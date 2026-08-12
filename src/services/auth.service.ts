import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import * as repo from '../repositories/codigo_acceso.repository.js';
import * as sesiones from '../repositories/sesion.repository.js';
import { enviarCorreo, correoConfigurado } from '../config/correo.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Inicio de sesión con código de un solo uso (OTP) enviado al correo.
 *
 * QUIÉN ENTRA POR AQUÍ: todas las cuentas activas. Estudiantes, candidatos y
 * administración escriben su correo institucional (o su cédula) y reciben un
 * código de 6 dígitos. El JWT conserva el rol de la cuenta para dirigirla al
 * panel que le corresponde sin crear vías de acceso diferentes.
 *
 * Defensas del flujo:
 *   1. El código se guarda hasheado (SHA-256), nunca en claro.
 *   2. Vive 10 minutos y sirve UNA sola vez.
 *   3. Pedir uno nuevo invalida el anterior.
 *   4. Máximo 5 intentos por código; al sexto se invalida y hay que pedir otro.
 *   5. Hay un tiempo mínimo entre envíos, para no convertir el login en un
 *      generador de correos hacia el buzón de cualquiera.
 *   6. La respuesta de "solicitar código" es siempre la misma exista o no la
 *      cuenta, así que no sirve para averiguar qué correos están registrados.
 */

export const VIGENCIA_SEGUNDOS  = 10 * 60;
export const MAX_INTENTOS       = 5;
/** Espera mínima entre dos envíos a la misma cuenta. */
export const ESPERA_REENVIO_SEG = 60;
const LONGITUD_CODIGO = 6;

/** SHA-256 en hexadecimal. Es lo único que se guarda del código. */
function hashear(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}

/**
 * Código de 6 dígitos con `randomInt`, que usa el generador criptográfico del
 * sistema. `Math.random()` no sirve: su secuencia es predecible y aquí el código
 * es la única prueba de identidad.
 */
function generarCodigo(): string {
  return String(randomInt(0, 10 ** LONGITUD_CODIGO)).padStart(LONGITUD_CODIGO, '0');
}

/** Compara en tiempo constante, para no filtrar el código por el tiempo de respuesta. */
function hashesIguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Enmascara el correo para confirmarle a la persona a qué buzón fue el código
 * sin mostrarlo entero a quien mira la pantalla: ana.perez@correo.edu → a******z@correo.edu
 */
export function enmascararCorreo(correo: string): string {
  const [usuario, dominio] = String(correo).split('@');
  if (!dominio) return '';
  if (usuario.length <= 2) return `${usuario[0] ?? ''}***@${dominio}`;
  return `${usuario[0]}${'*'.repeat(Math.min(usuario.length - 2, 8))}${usuario.at(-1)}@${dominio}`;
}

/** Texto del correo con el código. Aparte del envío, para poder comprobarlo sin SMTP. */
export function componerCorreoDeCodigo(datos: { nombres: string; codigo: string; minutos: number }) {
  const texto = [
    `Hola ${datos.nombres}:`,
    '',
    'Tu código para entrar a CodeVote es:',
    '',
    `    ${datos.codigo}`,
    '',
    `Caduca en ${datos.minutos} minutos y sirve una sola vez.`,
    '',
    'Si no fuiste tú quien lo pidió, ignora este mensaje: sin el código nadie',
    'puede entrar a tu cuenta.',
    '',
    'CodeVote · Plataforma de Votaciones Institucionales',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#201d1f">
      <p style="font-size:15px">Hola <strong>${datos.nombres}</strong>:</p>
      <p style="font-size:15px">Tu código para entrar a CodeVote es:</p>
      <p style="margin:24px 0;text-align:center">
        <span style="display:inline-block;padding:14px 28px;background:#f7f3f0;border-radius:10px;
                     font-size:32px;font-weight:700;letter-spacing:8px;color:#4b0d2b">${datos.codigo}</span>
      </p>
      <p style="font-size:14px;color:#5b5457">
        Caduca en ${datos.minutos} minutos y sirve una sola vez.
      </p>
      <p style="font-size:13px;color:#5b5457">
        Si no fuiste tú quien lo pidió, ignora este mensaje: sin el código nadie puede entrar a tu cuenta.
      </p>
      <hr style="border:0;border-top:1px solid #e7e1dd;margin:24px 0">
      <p style="font-size:12px;color:#8a8184">CodeVote · Plataforma de Votaciones Institucionales</p>
    </div>`;

  return { asunto: `${datos.codigo} es tu código de acceso a CodeVote`, texto, html };
}

export interface SolicitudDeCodigo {
  /** Buzón al que fue el código, enmascarado. null si no hay cuenta. */
  correo_enmascarado: string | null;
  expira_en_segundos: number;
}

/**
 * Genera y envía un código.
 *
 * Devuelve SIEMPRE la misma forma exista o no la cuenta: si el identificador no
 * corresponde a nadie, no se envía nada y `correo_enmascarado` va en null, pero
 * ni el estado HTTP ni el mensaje cambian. Así el login no sirve para averiguar
 * qué correos o cédulas están registrados.
 */
export async function solicitarCodigo(identificador: string, ip: string | null): Promise<SolicitudDeCodigo> {
  const cuenta = await repo.buscarCuentaActiva(identificador.trim().toLowerCase());
  if (!cuenta) {
    return { correo_enmascarado: null, expira_en_segundos: VIGENCIA_SEGUNDOS };
  }

  // Un código recién enviado no se reemplaza: evita que pedirlo dos veces
  // seguidas invalide el que la persona está a punto de escribir, y que el login
  // sirva para inundar un buzón ajeno.
  const vigente = await repo.buscarVigente(cuenta.cedula);
  if (vigente) {
    const segundosDesdeEnvio = (Date.now() - new Date(vigente.creado_at).getTime()) / 1000;
    if (segundosDesdeEnvio < ESPERA_REENVIO_SEG) {
      throw new HttpError(
        429,
        `Ya te enviamos un código. Espera ${Math.ceil(ESPERA_REENVIO_SEG - segundosDesdeEnvio)} segundos antes de pedir otro.`
      );
    }
  }

  const codigo = generarCodigo();
  await repo.crear(cuenta.cedula, hashear(codigo), VIGENCIA_SEGUNDOS, ip);

  const { asunto, texto, html } = componerCorreoDeCodigo({
    nombres: cuenta.nombres,
    codigo,
    minutos: VIGENCIA_SEGUNDOS / 60,
  });
  const enviado = await enviarCorreo({ para: [cuenta.correo_institucional], asunto, texto, html });

  // Sin SMTP configurado no habría forma de entrar. En desarrollo el código se
  // escribe en el log del servidor para poder seguir trabajando; en producción
  // solo queda el aviso de que el correo no salió.
  if (!enviado) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[auth] no se pudo enviar el código a ${cuenta.correo_institucional}`);
      throw new HttpError(503, 'No pudimos enviar el correo con tu código. Inténtalo en unos minutos o avisa a la comisión electoral.');
    }
    console.warn(
      `[auth] SMTP ${correoConfigurado ? 'falló' : 'sin configurar'}: el código de ${cuenta.correo_institucional} es ${codigo}`
    );
  }

  return {
    correo_enmascarado: enmascararCorreo(cuenta.correo_institucional),
    expira_en_segundos: VIGENCIA_SEGUNDOS,
  };
}

export interface SesionIniciada {
  token: string;
  usuario: {
    cedula: string;
    nombres: string;
    apellidos: string;
    correo_institucional: string;
    rol: string;
    foto_url: string | null;
    fk_id_institucion?: number;
  };
}

/** Verifica el código y devuelve el JWT. */
export async function verificarCodigo(
  identificador: string, codigo: string,
  contexto: { ip?: string | null; userAgent?: string | null } | null = {}
): Promise<SesionIniciada> {
  // Mensaje único para cuenta inexistente, código equivocado y código caducado:
  // distinguirlos permitiría averiguar qué cuentas existen.
  const generico = 'El código no es válido o ya caducó. Solicita uno nuevo.';

  const cuenta = await repo.buscarCuentaActiva(identificador.trim().toLowerCase());
  if (!cuenta) throw new HttpError(401, generico);

  const vigente = await repo.buscarVigente(cuenta.cedula);
  if (!vigente) throw new HttpError(401, generico);

  if (!hashesIguales(vigente.codigo_hash, hashear(codigo))) {
    const intentos = await repo.sumarIntento(vigente.id_codigo);
    if (intentos >= MAX_INTENTOS) {
      await repo.invalidarTodos(cuenta.cedula);
      throw new HttpError(429, 'Demasiados intentos con ese código. Solicita uno nuevo.');
    }
    throw new HttpError(401, `${generico} Te quedan ${MAX_INTENTOS - intentos} intentos.`);
  }

  // El consumo es la carrera decisiva: si dos peticiones llegan a la vez con el
  // código correcto, solo la que logra marcarlo como usado entra.
  if (!(await repo.consumir(vigente.id_codigo))) {
    throw new HttpError(401, generico);
  }

  const idSesion = randomUUID();
  const tokenConSesion = jwt.sign(
    {
      sub: cuenta.cedula,
      email: cuenta.correo_institucional,
      rol: cuenta.rol,
      fk_id_institucion: cuenta.rol === 'superadmin' ? undefined : cuenta.fk_id_institucion,
      jti: idSesion,
    },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any }
  );

  const payload = jwt.decode(tokenConSesion) as jwt.JwtPayload;
  if (!payload.exp) throw new Error('El JWT de sesión no contiene expiración.');

  // Durante el despliegue, el código puede llegar unos minutos antes que la
  // migración manual de AWS. En ese único caso se emite temporalmente el JWT
  // histórico; en cuanto existe la tabla, todos los JWT nuevos son revocables.
  const persistida = await sesiones.crearSiEstaDisponible({
    idSesion,
    cedula: cuenta.cedula,
    expiraAt: new Date(payload.exp * 1000),
    ip: contexto?.ip ?? null,
    userAgent: contexto?.userAgent?.slice(0, 255) ?? null,
  });
  const token = persistida
    ? tokenConSesion
    : jwt.sign(
        {
          sub: cuenta.cedula,
          email: cuenta.correo_institucional,
          rol: cuenta.rol,
          fk_id_institucion: cuenta.rol === 'superadmin' ? undefined : cuenta.fk_id_institucion,
        },
        process.env.JWT_SECRET!,
        { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any }
      );

  return {
    token,
    usuario: {
      cedula:               cuenta.cedula,
      nombres:              cuenta.nombres,
      apellidos:            cuenta.apellidos,
      correo_institucional: cuenta.correo_institucional,
      rol:                  cuenta.rol,
      foto_url:             cuenta.foto_url ?? null,
      fk_id_institucion:    cuenta.rol === 'superadmin' ? undefined : cuenta.fk_id_institucion,
    },
  };
}

export async function cerrarSesion(cedula: string, idSesion?: string): Promise<boolean> {
  if (!idSesion) return false;
  return sesiones.revocar(idSesion, cedula);
}

export async function cerrarTodasSesiones(cedula: string): Promise<number> {
  return sesiones.revocarTodas(cedula);
}
