import { rateLimit } from 'express-rate-limit';

/** Lee un entero de una variable de entorno, con valor por defecto. */
function entero(nombre: string, porDefecto: number): number {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : porDefecto;
}

const VENTANA_MIN = entero('RATE_LIMIT_WINDOW_MIN', 15);
const ventanaMs   = VENTANA_MIN * 60 * 1000;

/**
 * Límite general para toda la API. Es holgado a propósito: cada pantalla del
 * frontend hace varias peticiones (procesos, listas de cada proceso, candidatos
 * y planes por lista), y el límite se aplica por IP, así que varias personas
 * probando desde la misma red comparten el cupo.
 * Ajustable con RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MIN.
 */
export const rateLimiter = rateLimit({
  windowMs:        ventanaMs,
  limit:           entero('RATE_LIMIT_MAX', 1000),
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  // Los health checks (pipeline de despliegue, monitoreo) no consumen cupo.
  skip:            (req) => req.path === '/health' || req.path === '/api/health',
  message:         { error: `Demasiadas solicitudes. Intenta de nuevo en ${VENTANA_MIN} minutos.` },
});

/**
 * Límite para el canje del código de acceso: mitiga la fuerza bruta sobre un
 * código de 6 dígitos. Solo cuenta los intentos FALLIDOS
 * (skipSuccessfulRequests), así que entrar con el código correcto nunca gasta
 * cupo. Es la segunda barrera: la primera son los 5 intentos por código que
 * lleva la cuenta en `codigo_acceso.intentos`.
 * Ajustable con LOGIN_RATE_LIMIT_MAX.
 */
export const loginRateLimiter = rateLimit({
  windowMs:                ventanaMs,
  limit:                   entero('LOGIN_RATE_LIMIT_MAX', 30),
  standardHeaders:         'draft-8',
  legacyHeaders:           false,
  skipSuccessfulRequests:  true,
  message:                 { error: `Demasiados intentos de inicio de sesión. Intenta de nuevo en ${VENTANA_MIN} minutos.` },
});

/**
 * Límite para PEDIR el código de acceso. Aquí sí cuentan las peticiones
 * correctas: cada una envía un correo, y sin este tope el login sería un
 * generador de mensajes hacia el buzón de cualquier estudiante.
 *
 * Es un límite por IP y va además de la espera mínima entre envíos a una misma
 * cuenta (ver ESPERA_REENVIO_SEG en auth.service). Se deja holgado porque toda
 * una sala de votación puede compartir la IP de la red del campus.
 * Ajustable con CODIGO_RATE_LIMIT_MAX.
 */
export const codigoRateLimiter = rateLimit({
  windowMs:        ventanaMs,
  limit:           entero('CODIGO_RATE_LIMIT_MAX', 60),
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  message:         { error: `Se pidieron demasiados códigos desde esta red. Intenta de nuevo en ${VENTANA_MIN} minutos.` },
});
