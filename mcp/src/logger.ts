/**
 * Registro de eventos.
 *
 * Regla dura: NUNCA se escribe en stdout. En el transporte stdio, stdout es el
 * canal JSON-RPC y un solo `console.log` corrompe la sesión completa. Todo va a
 * stderr, y antes de salir se depuran los secretos (JWT, contraseñas, cookies)
 * para que un log de depuración no termine siendo la filtración.
 */
type Nivel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDEN: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

let nivelActual: Nivel = 'info';

export function configurarLog(nivel: Nivel) {
  nivelActual = nivel;
}

/** Sustituye lo que parezca un secreto por un marcador. */
export function depurarSecretos(texto: string): string {
  return texto
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '<jwt-oculto>')
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1<oculto>')
    .replace(/("?(?:password|contrasena|contraseña|token|secret|authorization)"?\s*[:=]\s*)"?[^",\s}]+"?/gi, '$1"<oculto>"');
}

function emitir(nivel: Exclude<Nivel, 'silent'>, mensaje: string, extra?: unknown) {
  if (ORDEN[nivel] < ORDEN[nivelActual]) return;
  const partes = [`[codevote-mcp] ${new Date().toISOString()} ${nivel.toUpperCase()} ${mensaje}`];
  if (extra !== undefined) {
    try {
      partes.push(typeof extra === 'string' ? extra : JSON.stringify(extra));
    } catch {
      partes.push('<no serializable>');
    }
  }
  process.stderr.write(depurarSecretos(partes.join(' ')) + '\n');
}

export const log = {
  debug: (m: string, e?: unknown) => emitir('debug', m, e),
  info: (m: string, e?: unknown) => emitir('info', m, e),
  warn: (m: string, e?: unknown) => emitir('warn', m, e),
  error: (m: string, e?: unknown) => emitir('error', m, e),
};
