/**
 * Configuración del servidor MCP.
 *
 * Todo se lee del entorno y se valida al arrancar: si algo está mal el proceso
 * termina antes de aceptar una sola petición. Es deliberado — un servidor MCP
 * mal configurado (sin TLS, sin token, en modo escritura por accidente) es peor
 * que uno que no arranca.
 */
import { z } from 'zod';

/** Modo de operación. `lectura` ni siquiera registra las herramientas de escritura. */
export type Modo = 'lectura' | 'escritura';
export type Transporte = 'stdio' | 'http';

const booleano = (pordefecto: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? pordefecto : v.toLowerCase() === 'true' || v === '1'));

const entero = (pordefecto: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? pordefecto : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const esquemaEntorno = z.object({
  // --- Conexión con la API ---
  CODEVOTE_API_URL: z.string().url().default('http://localhost:3000/api'),

  // Credenciales de servicio. El servidor inicia sesión por su cuenta: ni la
  // contraseña ni el JWT salen nunca hacia el modelo.
  CODEVOTE_EMAIL: z.string().email().optional(),
  CODEVOTE_PASSWORD: z.string().min(1).optional(),
  // Alternativa: un JWT ya emitido (útil en CI o para pruebas cortas).
  CODEVOTE_TOKEN: z.string().min(10).optional(),

  // --- Política ---
  CODEVOTE_MCP_MODE: z.enum(['lectura', 'escritura']).default('lectura'),
  CODEVOTE_MCP_REDACT_PII: booleano(true),
  CODEVOTE_MCP_ALLOW_INSECURE_HTTP: booleano(false),

  // --- Límites (defensa contra abuso y contra envenenar el contexto) ---
  CODEVOTE_MCP_TIMEOUT_MS: entero(8_000, 1_000, 60_000),
  CODEVOTE_MCP_MAX_BYTES: entero(262_144, 4_096, 5_242_880),
  CODEVOTE_MCP_MAX_ITEMS: entero(50, 1, 500),
  CODEVOTE_MCP_RATE_MAX: entero(60, 1, 10_000),
  CODEVOTE_MCP_RATE_WINDOW_MS: entero(60_000, 1_000, 3_600_000),

  // --- Transporte ---
  CODEVOTE_MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  CODEVOTE_MCP_HTTP_HOST: z.string().default('127.0.0.1'),
  CODEVOTE_MCP_HTTP_PORT: entero(3333, 1, 65_535),
  CODEVOTE_MCP_HTTP_TOKEN: z.string().min(32).optional(),
  CODEVOTE_MCP_HTTP_ORIGINS: z.string().optional(),

  CODEVOTE_MCP_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export interface Config {
  apiUrl: string;
  credenciales?: { correo: string; password: string };
  tokenFijo?: string;
  modo: Modo;
  redactarPii: boolean;
  timeoutMs: number;
  maxBytes: number;
  maxItems: number;
  rateMax: number;
  rateWindowMs: number;
  transporte: Transporte;
  httpHost: string;
  httpPort: number;
  httpToken?: string;
  httpOrigenes: string[];
  nivelLog: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

function esLocal(url: URL): boolean {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
}

export function cargarConfig(entorno: NodeJS.ProcessEnv = process.env): Config {
  const parseado = esquemaEntorno.safeParse(entorno);
  if (!parseado.success) {
    const detalle = parseado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${detalle}`);
  }
  const e = parseado.data;

  // La URL base se normaliza sin barra final para poder concatenar rutas.
  const url = new URL(e.CODEVOTE_API_URL);
  const apiUrl = url.toString().replace(/\/+$/, '');

  // TLS obligatorio fuera de localhost: sin esto el JWT viaja en claro y
  // cualquiera en la red puede suplantar a la cuenta de servicio.
  if (url.protocol !== 'https:' && !esLocal(url) && !e.CODEVOTE_MCP_ALLOW_INSECURE_HTTP) {
    throw new Error(
      `CODEVOTE_API_URL usa ${url.protocol}// contra un host remoto (${url.hostname}). ` +
        'Usa https:// o, solo para pruebas, CODEVOTE_MCP_ALLOW_INSECURE_HTTP=true.',
    );
  }

  const tieneCredenciales = Boolean(e.CODEVOTE_EMAIL && e.CODEVOTE_PASSWORD);
  if (!tieneCredenciales && !e.CODEVOTE_TOKEN) {
    throw new Error(
      'Faltan credenciales: define CODEVOTE_EMAIL + CODEVOTE_PASSWORD (recomendado) o CODEVOTE_TOKEN.',
    );
  }

  // El transporte HTTP sin autenticación es un servidor MCP abierto: cualquier
  // proceso local (o remoto si se expone el puerto) podría usar la sesión.
  if (e.CODEVOTE_MCP_TRANSPORT === 'http' && !e.CODEVOTE_MCP_HTTP_TOKEN) {
    throw new Error(
      'El transporte http exige CODEVOTE_MCP_HTTP_TOKEN (mínimo 32 caracteres). ' +
        'Genera uno con: node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"',
    );
  }

  return {
    apiUrl,
    credenciales: tieneCredenciales
      ? { correo: e.CODEVOTE_EMAIL!, password: e.CODEVOTE_PASSWORD! }
      : undefined,
    tokenFijo: e.CODEVOTE_TOKEN,
    modo: e.CODEVOTE_MCP_MODE,
    redactarPii: e.CODEVOTE_MCP_REDACT_PII,
    timeoutMs: e.CODEVOTE_MCP_TIMEOUT_MS,
    maxBytes: e.CODEVOTE_MCP_MAX_BYTES,
    maxItems: e.CODEVOTE_MCP_MAX_ITEMS,
    rateMax: e.CODEVOTE_MCP_RATE_MAX,
    rateWindowMs: e.CODEVOTE_MCP_RATE_WINDOW_MS,
    transporte: e.CODEVOTE_MCP_TRANSPORT,
    httpHost: e.CODEVOTE_MCP_HTTP_HOST,
    httpPort: e.CODEVOTE_MCP_HTTP_PORT,
    httpToken: e.CODEVOTE_MCP_HTTP_TOKEN,
    httpOrigenes: (e.CODEVOTE_MCP_HTTP_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    nivelLog: e.CODEVOTE_MCP_LOG_LEVEL,
  };
}

/** Vista de la configuración apta para mostrar: sin secretos. */
export function configPublica(config: Config) {
  return {
    api_url: config.apiUrl,
    modo: config.modo,
    transporte: config.transporte,
    autenticacion: config.credenciales ? 'credenciales de servicio' : 'token preemitido',
    redaccion_pii: config.redactarPii,
    limites: {
      timeout_ms: config.timeoutMs,
      max_bytes_respuesta: config.maxBytes,
      max_items_por_herramienta: config.maxItems,
      peticiones_por_ventana: `${config.rateMax} / ${config.rateWindowMs / 1000}s`,
    },
  };
}
