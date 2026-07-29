import { rateLimit } from 'express-rate-limit';

/** Límite general para toda la API. */
export const rateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  limit:           100,
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  message:         { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
});

/**
 * Límite estricto para el login: mitiga ataques de fuerza bruta sobre
 * contraseñas. Solo cuenta los intentos FALLIDOS (skipSuccessfulRequests),
 * así un uso normal nunca se ve bloqueado.
 */
export const loginRateLimiter = rateLimit({
  windowMs:                15 * 60 * 1000,
  limit:                   10,
  standardHeaders:         'draft-8',
  legacyHeaders:           false,
  skipSuccessfulRequests:  true,
  message:                 { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
});
