import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/httpError.js';
import { REFRESH_COOKIE, cookieDe } from '../utils/sessionCookies.js';

const metodosSeguros = new Set(['GET', 'HEAD', 'OPTIONS']);

function origenesPermitidos() {
  return (process.env.CORS_ORIGIN ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

/**
 * Las cookies HttpOnly no pueden llevar un CSRF token legible por JavaScript.
 * Para las mutaciones exigimos Origin de un frontend configurado. Las llamadas
 * Bearer (clientes no navegador) quedan cubiertas por su credencial explícita.
 */
export function protegerCsrfCookie(req: Request, _res: Response, next: NextFunction) {
  if (metodosSeguros.has(req.method) || (!req.authPorCookie && !cookieDe(req, REFRESH_COOKIE))) return next();
  const origen = req.get('origin');
  const permitidos = origenesPermitidos();
  if (!origen || !permitidos.includes(origen)) {
    return next(new HttpError(403, 'Origen no autorizado para una operación de sesión.'));
  }
  next();
}
