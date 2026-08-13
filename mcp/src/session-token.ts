/**
 * Obtiene el JWT de acceso emitido por POST /auth/verificar.
 *
 * En desarrollo la API puede conservar `token` en el JSON. En produccion el
 * token se entrega exclusivamente en una cookie HttpOnly, por lo que el script
 * de terminal debe leer el encabezado Set-Cookie de la respuesta.
 */

const COOKIE_ACCESO = 'codevote_access';

interface CabecerasSesion {
  get(nombre: string): string | null;
  getSetCookie?: () => string[];
}

export function extraerTokenSesion(datos: unknown, cabeceras: CabecerasSesion): string | null {
  const tokenJson = (datos as { token?: unknown } | null)?.token;
  if (typeof tokenJson === 'string' && tokenJson.trim()) return tokenJson.trim();

  const encabezados = cabeceras.getSetCookie?.() ?? [cabeceras.get('set-cookie') ?? ''];
  const patron = new RegExp(`(?:^|,\\s*)${COOKIE_ACCESO}=([^;,\\s]+)`);

  for (const encabezado of encabezados) {
    const coincidencia = encabezado.match(patron);
    if (coincidencia?.[1]) return decodeURIComponent(coincidencia[1]);
  }

  return null;
}
