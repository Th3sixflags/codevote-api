import { rateLimit } from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  limit:           100,
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  message:         { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
});
