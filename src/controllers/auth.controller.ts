import { Request, Response } from 'express';
import * as service from '../services/auth.service.js';
import { solicitarCodigoSchema, verificarCodigoSchema } from '../schemas/auth.schema.js';
import { cookieDe, fijarCookiesDeSesion, limpiarCookiesDeSesion, REFRESH_COOKIE } from '../utils/sessionCookies.js';

/** IP real del cliente (Express ya resuelve X-Forwarded-For con trust proxy). */
const ipDe = (req: Request) => (req.ip ?? null);

/**
 * POST /api/auth/codigo — envía el código de acceso al correo institucional.
 *
 * Responde siempre 200 con la misma forma, exista o no la cuenta: si no existe,
 * `correo_enmascarado` va en null y no se envía nada. Así el login no sirve para
 * averiguar qué correos o cédulas están registrados.
 */
export async function solicitarCodigo(req: Request, res: Response) {
  const { identificador } = solicitarCodigoSchema.parse(req.body);
  const resultado = await service.solicitarCodigo(identificador, ipDe(req));

  res.json({
    ...resultado,
    mensaje: 'Si el correo o la cédula corresponden a una cuenta activa, te enviamos un código.',
    espera_reenvio_segundos: service.ESPERA_REENVIO_SEG,
  });
}

/** POST /api/auth/verificar — canjea el código por la sesión (JWT). */
export async function verificarCodigo(req: Request, res: Response) {
  const { identificador, codigo } = verificarCodigoSchema.parse(req.body);
  const sesion = await service.verificarCodigo(identificador, codigo, {
    ip: ipDe(req),
    userAgent: req.get('user-agent') ?? null,
  });
  fijarCookiesDeSesion(res, sesion.token, sesion.refreshToken, service.VIGENCIA_ACCESS_MS, service.VIGENCIA_REFRESH_MS);
  // En producción el JWT nunca sale por JSON. El modo de pruebas conserva el
  // contrato antiguo para no romper clientes de test mientras migran a cookies.
  res.json({ usuario: sesion.usuario, ...(process.env.NODE_ENV === 'production' ? {} : { token: sesion.token }) });
}

export async function refrescarSesion(req: Request, res: Response) {
  const refresh = cookieDe(req, REFRESH_COOKIE);
  if (!refresh) { res.status(401).json({ error: 'Sesión no proporcionada.' }); return; }
  const sesion = await service.refrescarSesion(refresh, { ip: ipDe(req), userAgent: req.get('user-agent') ?? null });
  fijarCookiesDeSesion(res, sesion.token, sesion.refreshToken, service.VIGENCIA_ACCESS_MS, service.VIGENCIA_REFRESH_MS);
  res.json({ usuario: sesion.usuario });
}

/** Revoca exclusivamente el Bearer actual. */
export async function cerrarSesion(req: Request, res: Response) {
  await service.cerrarSesion(req.user!.sub, req.user!.jti);
  limpiarCookiesDeSesion(res);
  res.status(204).end();
}

/** Revoca todas las sesiones de la cuenta, incluida la que hizo la petición. */
export async function cerrarTodasSesiones(req: Request, res: Response) {
  const revocadas = await service.cerrarTodasSesiones(req.user!.sub);
  limpiarCookiesDeSesion(res);
  res.json({ sesiones_revocadas: revocadas });
}
