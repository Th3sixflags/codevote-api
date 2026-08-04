import { Router } from 'express';
import { loginRateLimiter, codigoRateLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

// Acceso por código de un solo uso enviado al correo institucional. No hay
// contraseña: se pide el código y se canjea por la sesión.
//
// Los dos pasos llevan límite propio: el envío, para que nadie use el login
// como generador de correos hacia un buzón ajeno; la verificación, contra la
// fuerza bruta sobre un código de 6 dígitos (que además solo admite 5 intentos
// por código, ver auth.service).
router.post('/codigo',    codigoRateLimiter, ctrl.solicitarCodigo);
router.post('/verificar', loginRateLimiter,  ctrl.verificarCodigo);

// Puerta de emergencia por contraseña. Devuelve 410 salvo que se active con
// AUTH_PASSWORD_FALLBACK=true.
router.post('/login',     loginRateLimiter,  ctrl.loginConPassword);

export default router;
