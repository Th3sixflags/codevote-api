import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import * as ctrl from '../controllers/director.controller';

const router = Router();
router.get('/',       requireAuth,               ctrl.listar);
router.get('/:id',    requireAuth,               ctrl.obtener);
router.post('/',      requireAuth, requireAdmin, ctrl.crear);
router.patch('/:id',  requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:id', requireAuth, requireAdmin, ctrl.eliminar);

export default router;
