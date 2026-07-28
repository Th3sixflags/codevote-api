import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/notificacion.controller.js';

const router = Router();

router.get('/',            requireAuth, ctrl.listar);
router.patch('/:id/leida', requireAuth, ctrl.marcarLeida);

export default router;
