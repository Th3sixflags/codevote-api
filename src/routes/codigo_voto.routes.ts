import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/codigo_voto.controller.js';

const router = Router();

// El orden importa: las rutas específicas van antes que /:id
router.get('/',                     requireAuth, requireAdmin, ctrl.listar);
// Cada estudiante puede consultar únicamente sus propios comprobantes
router.get('/mis-codigos',          requireAuth,               ctrl.listarMisCodigos);
router.get('/votacion/:votacionId', requireAuth, requireAdmin, ctrl.listarPorVotacion);
router.get('/:id',                  requireAuth, requireAdmin, ctrl.obtener);
router.post('/',                    requireAuth, requireAdmin, ctrl.crear);
router.patch('/:id',                requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:id',               requireAuth, requireAdmin, ctrl.eliminar);

export default router;
