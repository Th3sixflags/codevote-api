/**
 * Política de acceso del MCP a la API.
 *
 * El servidor NO expone un "haz una petición a la URL que quieras". Toda ruta
 * pasa por dos filtros, en este orden:
 *
 *   1. PROHIBIDAS — lista negra absoluta. No se levanta ni en modo escritura ni
 *      con un token de admin. Es la frontera que hace que un asistente de IA
 *      (o alguien que logre inyectarle instrucciones) no pueda emitir un voto,
 *      borrar evidencia electoral ni tocar credenciales.
 *   2. PERMITIDAS — lista blanca. Lo que no está listado, no existe.
 *
 * El resultado es que la superficie de ataque del MCP es un subconjunto
 * explícito y auditable de las 71 rutas de la API, no la API entera.
 */
import type { Modo } from './config.js';

export type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Regla {
  metodo: Metodo | '*';
  patron: RegExp;
  motivo: string;
}

/** Segmento numérico o cédula: nunca aceptamos comodines abiertos. */
const ID = '(\\d{1,10})';
const CEDULA = '(\\d{10})';

/**
 * Lista negra. Se evalúa primero y su motivo se devuelve tal cual al modelo,
 * para que quede explícito por qué no se puede y no lo reintente de otra forma.
 */
export const RUTAS_PROHIBIDAS: Regla[] = [
  {
    metodo: 'POST',
    patron: /^\/votos$/,
    motivo:
      'Emitir un voto es un acto personalísimo del estudiante. Ningún agente automatizado puede hacerlo en su nombre, en ningún modo.',
  },
  {
    metodo: 'DELETE',
    patron: /^\/.*$/,
    motivo:
      'El MCP no borra nada. El borrado en CodeVote arrastra evidencia electoral y queda reservado a la administración desde la aplicación.',
  },
  {
    metodo: '*',
    patron: /^\/perfil\//,
    motivo: 'Las credenciales y la identidad del usuario no se gestionan desde el MCP.',
  },
  {
    metodo: '*',
    patron: /^\/auth\//,
    motivo: 'La autenticación la resuelve el propio servidor MCP; no se expone como herramienta.',
  },
  {
    metodo: 'POST',
    patron: /^\/codigos-voto$/,
    motivo: 'Los comprobantes de voto los genera la API al votar, no se crean a mano.',
  },
  {
    metodo: '*',
    patron: /^\/candidato\/.*\/archivo$/,
    motivo: 'La subida de archivos queda fuera del MCP (superficie de ataque innecesaria).',
  },
  {
    metodo: 'POST',
    patron: new RegExp(`^/estudiantes$`),
    motivo: 'El padrón no se modifica desde el MCP: se carga desde la administración.',
  },
  {
    metodo: 'PATCH',
    patron: new RegExp(`^/estudiantes/${CEDULA}`),
    motivo: 'El padrón no se modifica desde el MCP: se carga desde la administración.',
  },
];

/** Lista blanca de consulta. Disponible en todos los modos. */
export const RUTAS_LECTURA: Regla[] = [
  { metodo: 'GET', patron: /^\/health$/, motivo: 'estado del servicio' },
  { metodo: 'GET', patron: /^\/openapi\.json$/, motivo: 'contrato de la API (recurso MCP)' },

  { metodo: 'GET', patron: /^\/facultades$/, motivo: 'catálogo' },
  { metodo: 'GET', patron: /^\/carreras$/, motivo: 'catálogo' },
  { metodo: 'GET', patron: /^\/directores$/, motivo: 'catálogo' },
  { metodo: 'GET', patron: /^\/responsables$/, motivo: 'catálogo' },
  { metodo: 'GET', patron: /^\/requisitos$/, motivo: 'catálogo' },

  { metodo: 'GET', patron: /^\/procesos-electorales$/, motivo: 'procesos' },
  { metodo: 'GET', patron: new RegExp(`^/procesos-electorales/${ID}$`), motivo: 'proceso' },

  { metodo: 'GET', patron: /^\/cronogramas$/, motivo: 'cronograma' },
  { metodo: 'GET', patron: new RegExp(`^/cronogramas/proceso/${ID}$`), motivo: 'cronograma' },

  { metodo: 'GET', patron: /^\/votaciones$/, motivo: 'papeletas' },
  { metodo: 'GET', patron: new RegExp(`^/votaciones/proceso/${ID}$`), motivo: 'papeletas' },
  { metodo: 'GET', patron: new RegExp(`^/votaciones/${ID}$`), motivo: 'papeleta' },

  { metodo: 'GET', patron: /^\/listas-candidatas$/, motivo: 'listas' },
  { metodo: 'GET', patron: new RegExp(`^/listas-candidatas/proceso/${ID}$`), motivo: 'listas' },
  { metodo: 'GET', patron: new RegExp(`^/listas-candidatas/votacion/${ID}$`), motivo: 'listas' },
  { metodo: 'GET', patron: new RegExp(`^/listas-candidatas/${ID}$`), motivo: 'lista' },

  { metodo: 'GET', patron: /^\/candidatos$/, motivo: 'candidatos' },
  { metodo: 'GET', patron: new RegExp(`^/candidatos/lista/${ID}$`), motivo: 'candidatos' },
  { metodo: 'GET', patron: new RegExp(`^/candidatos/${ID}$`), motivo: 'candidato' },

  { metodo: 'GET', patron: /^\/planes-trabajo$/, motivo: 'planes' },
  { metodo: 'GET', patron: new RegExp(`^/planes-trabajo/lista/${ID}$`), motivo: 'planes' },

  { metodo: 'GET', patron: /^\/validaciones-requisito$/, motivo: 'validaciones' },
  { metodo: 'GET', patron: new RegExp(`^/validaciones-requisito/candidato/${ID}$`), motivo: 'validaciones' },

  { metodo: 'GET', patron: new RegExp(`^/votos/resultados/${ID}$`), motivo: 'escrutinio' },

  { metodo: 'GET', patron: /^\/actas-resultados$/, motivo: 'actas' },
  { metodo: 'GET', patron: new RegExp(`^/actas-resultados/votacion/${ID}$`), motivo: 'actas' },

  { metodo: 'GET', patron: /^\/veedores$/, motivo: 'veeduría' },
  { metodo: 'GET', patron: /^\/veedurias$/, motivo: 'veeduría' },
  { metodo: 'GET', patron: new RegExp(`^/veedurias/votacion/${ID}$`), motivo: 'veeduría' },

  // Se consulta solo para agregar (conteos por carrera). La herramienta que lo
  // usa nunca devuelve filas individuales.
  { metodo: 'GET', patron: /^\/estudiantes$/, motivo: 'padrón (solo para agregados)' },

  { metodo: 'GET', patron: /^\/notificaciones$/, motivo: 'notificaciones propias' },
];

/** Lista blanca de escritura. Solo se activa con CODEVOTE_MCP_MODE=escritura. */
export const RUTAS_ESCRITURA: Regla[] = [
  { metodo: 'POST', patron: /^\/procesos-electorales$/, motivo: 'crear proceso' },
  { metodo: 'PATCH', patron: new RegExp(`^/procesos-electorales/${ID}$`), motivo: 'editar proceso' },
  { metodo: 'PATCH', patron: new RegExp(`^/procesos-electorales/${ID}/cancelar$`), motivo: 'cancelar proceso' },
  { metodo: 'PATCH', patron: new RegExp(`^/procesos-electorales/${ID}/archivar$`), motivo: 'archivar proceso' },
  { metodo: 'POST', patron: /^\/votaciones$/, motivo: 'crear papeleta' },
  { metodo: 'PATCH', patron: new RegExp(`^/votaciones/${ID}$`), motivo: 'editar papeleta' },
  { metodo: 'PATCH', patron: new RegExp(`^/listas-candidatas/${ID}/aprobar$`), motivo: 'aprobar lista' },
  { metodo: 'PATCH', patron: new RegExp(`^/listas-candidatas/${ID}/rechazar$`), motivo: 'rechazar lista' },
  { metodo: 'POST', patron: /^\/cronogramas$/, motivo: 'crear hito de cronograma' },
  { metodo: 'POST', patron: /^\/actas-resultados$/, motivo: 'registrar acta' },
];

export class ErrorPolitica extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPolitica';
  }
}

function aplica(regla: Regla, metodo: Metodo, ruta: string): boolean {
  return (regla.metodo === '*' || regla.metodo === metodo) && regla.patron.test(ruta);
}

/**
 * Valida una petición contra la política. Lanza ErrorPolitica si no procede.
 * `ruta` es solo el pathname relativo a la base (sin query).
 */
export function autorizar(metodo: Metodo, ruta: string, modo: Modo): void {
  // Defensa de forma antes que de contenido: nada de rutas relativas, esquemas
  // ni caracteres de control que permitan salirse de la base configurada.
  if (!ruta.startsWith('/') || ruta.includes('..') || /[\s<>"'\\]|%2e%2e/i.test(ruta)) {
    throw new ErrorPolitica(`Ruta con forma inválida: ${JSON.stringify(ruta)}`);
  }

  const prohibida = RUTAS_PROHIBIDAS.find((r) => aplica(r, metodo, ruta));
  if (prohibida) {
    throw new ErrorPolitica(`Operación bloqueada por política. ${prohibida.motivo}`);
  }

  if (RUTAS_LECTURA.some((r) => aplica(r, metodo, ruta))) return;

  if (RUTAS_ESCRITURA.some((r) => aplica(r, metodo, ruta))) {
    if (modo !== 'escritura') {
      throw new ErrorPolitica(
        `El servidor está en modo lectura: ${metodo} ${ruta} no está disponible. ` +
          'Arráncalo con CODEVOTE_MCP_MODE=escritura si de verdad necesitas modificar datos.',
      );
    }
    return;
  }

  throw new ErrorPolitica(`${metodo} ${ruta} no está en la lista blanca del MCP.`);
}

/** Resumen legible de la política, para exponerla como recurso. */
export function resumenPolitica(modo: Modo) {
  return {
    modo,
    rutas_prohibidas_siempre: RUTAS_PROHIBIDAS.map((r) => ({
      operacion: `${r.metodo} ${r.patron.source}`,
      motivo: r.motivo,
    })),
    rutas_de_lectura: RUTAS_LECTURA.length,
    rutas_de_escritura: RUTAS_ESCRITURA.length,
    escritura_activa: modo === 'escritura',
  };
}
