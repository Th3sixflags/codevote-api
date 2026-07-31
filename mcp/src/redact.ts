/**
 * Redacción de datos sensibles antes de entregarlos al modelo.
 *
 * Principio: lo que entra al contexto de un LLM sale del control del sistema
 * (se guarda en el historial, puede reenviarse, puede quedar en logs de un
 * tercero). Por eso la API puede devolver un campo y el MCP igual lo oculta.
 *
 * Tres niveles:
 *   - SECRETOS: se eliminan siempre, en cualquier modo. Contraseñas, tokens y
 *     los hashes de comprobante — este último es el que ligaría a una persona
 *     con su voto, así que jamás sale de la base.
 *   - IDENTIFICADORES: se enmascaran (cédula, correo) si redactarPii está activo.
 *   - El resto pasa tal cual.
 */

const CLAVES_SECRETAS = [
  'password',
  'contrasena',
  'contraseña',
  'token',
  'jwt',
  'secret',
  'authorization',
  'hash',
  'hash_voto',
  'hash_comprobante',
  'codigo_hash',
];

const CLAVES_CEDULA = ['cedula', 'fk_cedula_estudiante', 'cedula_estudiante', 'identificacion'];
const CLAVES_CORREO = ['correo', 'correo_institucional', 'email', 'mail'];

const MARCA = '<oculto por política del MCP>';

function coincide(clave: string, lista: string[]): boolean {
  const k = clave.toLowerCase();
  return lista.some((c) => k === c || k.endsWith(`_${c}`) || k.includes(c));
}

export function enmascararCedula(valor: string): string {
  if (valor.length < 4) return '****';
  return '*'.repeat(valor.length - 4) + valor.slice(-4);
}

export function enmascararCorreo(valor: string): string {
  const arroba = valor.indexOf('@');
  if (arroba <= 0) return MARCA;
  const local = valor.slice(0, arroba);
  const dominio = valor.slice(arroba);
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(2, local.length - 1))}${dominio}`;
}

export interface OpcionesRedaccion {
  /** Enmascarar cédulas y correos. Los secretos se ocultan siempre. */
  pii: boolean;
}

export function redactar<T>(valor: T, opciones: OpcionesRedaccion, profundidad = 0): T {
  // Cortafuegos contra estructuras patológicas o cíclicas.
  if (profundidad > 12) return MARCA as unknown as T;

  if (Array.isArray(valor)) {
    return valor.map((v) => redactar(v, opciones, profundidad + 1)) as unknown as T;
  }

  if (valor !== null && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (coincide(clave, CLAVES_SECRETAS)) {
        salida[clave] = MARCA;
        continue;
      }
      if (opciones.pii && typeof v === 'string' && v.length > 0) {
        if (coincide(clave, CLAVES_CEDULA)) {
          salida[clave] = enmascararCedula(v);
          continue;
        }
        if (coincide(clave, CLAVES_CORREO)) {
          salida[clave] = enmascararCorreo(v);
          continue;
        }
      }
      salida[clave] = redactar(v, opciones, profundidad + 1);
    }
    return salida as unknown as T;
  }

  return valor;
}
