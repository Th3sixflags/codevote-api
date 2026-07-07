import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import * as ctrl from '../controllers/estudiante.controller';

const router = Router();

router.get('/',               requireAuth, requireAdmin, ctrl.listar);
router.get('/:cedula',        requireAuth,               ctrl.obtener);
router.post('/',              requireAuth, requireAdmin, ctrl.crear);
router.patch('/:cedula',      requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:cedula',     requireAuth, requireAdmin, ctrl.eliminar);

export default router;
