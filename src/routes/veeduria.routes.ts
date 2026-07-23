import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/veeduria.controller.js';

const router = Router();

// El orden importa: las rutas específicas van antes que /:id
router.get('/',                     requireAuth,               ctrl.listar);
router.get('/votacion/:votacionId', requireAuth,               ctrl.listarPorVotacion);
router.get('/:id',                  requireAuth,               ctrl.obtener);
router.post('/',                    requireAuth, requireAdmin, ctrl.crear);
router.patch('/:id',                requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:id',               requireAuth, requireAdmin, ctrl.eliminar);

export default router;
