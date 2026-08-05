/**
 * Lectura del JWT — sin verificar la firma, a propósito.
 *
 * El servidor MCP no valida el token: eso lo hace la API, que es quien tiene el
 * secreto. Aquí solo se lee la carga útil para dos cosas prácticas: saber con
 * qué rol se está operando y avisar cuándo caduca la sesión antes de que el
 * usuario se lleve la sorpresa a mitad de una consulta.
 *
 * Como no hay verificación, nada de lo que salga de aquí se usa para decidir
 * permisos. Solo es información.
 */

export interface CargaJwt {
  sub: string;
  email: string;
  rol: 'estudiante' | 'admin' | 'candidato';
  iat?: number;
  exp?: number;
}

export class ErrorToken extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorToken';
  }
}

/** Decodifica la carga útil. Lanza ErrorToken si no parece un JWT. */
export function leerToken(token: string): CargaJwt {
  const partes = token.split('.');
  if (partes.length !== 3 || !partes[1]) {
    throw new ErrorToken('CODEVOTE_TOKEN no tiene forma de JWT (deben ser tres partes separadas por puntos).');
  }
  try {
    const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) as CargaJwt;
    if (!carga.rol) throw new Error('sin rol');
    return carga;
  } catch {
    throw new ErrorToken('CODEVOTE_TOKEN no se pudo leer. ¿Se copió completo, sin saltos de línea?');
  }
}

/** Minutos que le quedan al token, o null si no declara caducidad. */
export function minutosRestantes(carga: CargaJwt): number | null {
  if (!carga.exp) return null;
  return Math.round((carga.exp * 1000 - Date.now()) / 60_000);
}

export function estaVencido(carga: CargaJwt): boolean {
  const minutos = minutosRestantes(carga);
  return minutos !== null && minutos <= 0;
}

/** Mensaje único para cuando hay que renovar. Se repite en varios sitios. */
export const COMO_RENOVAR =
  'Genera uno nuevo con «npm run token» dentro de la carpeta mcp/ (te llega un código a tu correo institucional).';
