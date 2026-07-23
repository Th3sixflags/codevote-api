import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/proceso_electoral.controller.js';

const router = Router();

router.get('/',               requireAuth,              ctrl.listar);
router.get('/:id',            requireAuth,              ctrl.obtener);
router.post('/',              requireAuth, requireAdmin, ctrl.crear);
router.patch('/:id',          requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:id',         requireAuth, requireAdmin, ctrl.eliminar);

export default router;
