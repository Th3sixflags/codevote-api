import { Router } from 'express';
import * as ctrl from '../controllers/codigo_voto.controller.js';
import { verificacionPublicaRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Ruta independiente de /codigos-voto: no usa ni acepta IDs internos y no
// requiere JWT. El UUID opaco del comprobante es el único dato de entrada.
router.get('/:codigoVerificacion', verificacionPublicaRateLimiter, ctrl.verificarPublicamente);

export default router;
