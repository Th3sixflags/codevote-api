import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/codigo_voto.controller.js';

const router = Router();

// El orden importa: las rutas específicas van antes que /:id
router.get('/',                     requireAuth, requireAdmin, ctrl.listar);
// Cada estudiante puede consultar únicamente sus propios comprobantes
router.get('/mis-codigos',          requireAuth,               ctrl.listarMisCodigos);
// Verificación de un comprobante propio (protegida por propiedad)
router.get('/mis-codigos/:id/verificar', requireAuth,          ctrl.verificarMiCodigo);
router.get('/votacion/:votacionId', requireAuth, requireAdmin, ctrl.listarPorVotacion);
router.get('/:id',                  requireAuth, requireAdmin, ctrl.obtener);
// No existen rutas de mutación manual: un comprobante nace únicamente dentro de
// la transacción que registra un voto y luego es evidencia append-only.

export default router;
