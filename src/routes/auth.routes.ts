import { Router } from 'express';
import { loginRateLimiter, codigoRateLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

// Dos vías de acceso, según a quién le corresponda:
//
//   /codigo + /verificar   PADRÓN (estudiantes y candidatos): código de un solo
//                          uso al correo institucional, sin contraseña.
//   /login                 ADMINISTRACIÓN: correo y contraseña.
//
// Están separadas a propósito. Un buzón comprometido no debe abrir el panel
// administrativo, y una contraseña que el votante usaría una vez al año es una
// contraseña que se acaba anotando. Pedir código para una cuenta admin devuelve
// la misma respuesta genérica que una cédula inexistente, y una cuenta del
// padrón enviada a /login recibe el mismo 401 que una contraseña equivocada:
// ninguna de las dos vías revela el rol de nadie.
//
// Los pasos del código llevan límite propio: el envío, para que nadie use el
// login como generador de correos hacia un buzón ajeno; la verificación, contra
// la fuerza bruta sobre un código de 6 dígitos (que además solo admite 5
// intentos por código, ver auth.service).
router.post('/codigo',    codigoRateLimiter, ctrl.solicitarCodigo);
router.post('/verificar', loginRateLimiter,  ctrl.verificarCodigo);
router.post('/login',     loginRateLimiter,  ctrl.loginConPassword);

export default router;
