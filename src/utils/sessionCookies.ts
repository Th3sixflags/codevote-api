import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

export const ACCESS_COOKIE = 'codevote_access';
export const REFRESH_COOKIE = 'codevote_refresh';

const esProduccion = () => process.env.NODE_ENV === 'production';
const sameSite = (): 'lax' | 'strict' | 'none' => {
  const valor = (process.env.COOKIE_SAME_SITE ?? 'lax').toLowerCase();
  return valor === 'strict' || valor === 'none' ? valor : 'lax';
};
const secure = () => process.env.COOKIE_SECURE === 'true' || esProduccion();

function opcionesBase() {
  const politica = sameSite();
  // SameSite=None sin Secure es rechazado por navegadores modernos.
  if (politica === 'none' && !secure()) throw new Error('COOKIE_SAME_SITE=none requiere COOKIE_SECURE=true.');
  return { httpOnly: true, secure: secure(), sameSite: politica, path: '/api' } as const;
}

export function fijarCookiesDeSesion(res: Response, accessToken: string, refreshToken: string, accessMaxAgeMs: number, refreshMaxAgeMs: number) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...opcionesBase(), maxAge: accessMaxAgeMs });
  // El refresh solo llega al endpoint que lo rota: reduce su exposición.
  res.cookie(REFRESH_COOKIE, refreshToken, { ...opcionesBase(), path: '/api/auth/refresh', maxAge: refreshMaxAgeMs });
}

export function limpiarCookiesDeSesion(res: Response) {
  res.clearCookie(ACCESS_COOKIE, opcionesBase());
  res.clearCookie(REFRESH_COOKIE, { ...opcionesBase(), path: '/api/auth/refresh' });
}

export function cookieDe(req: Request, nombre: string): string | undefined {
  const valor = req.headers.cookie;
  if (!valor) return undefined;
  return valor.split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith(`${nombre}=`))?.slice(nombre.length + 1);
}

/** Token opaco de 256 bits; en base solo se conserva este hash SHA-256. */
export function nuevoRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
