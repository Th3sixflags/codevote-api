import { Router } from 'express';
import { loginRateLimiter, codigoRateLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

// Una sola vía de acceso para estudiante, candidato y admin: código de un solo
// uso al correo institucional. El envío y la verificación llevan límites
// independientes contra abuso y fuerza bruta.
router.post('/codigo',    codigoRateLimiter, ctrl.solicitarCodigo);
router.post('/verificar', loginRateLimiter,  ctrl.verificarCodigo);

export default router;
