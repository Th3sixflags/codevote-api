import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/voto.controller.js';

const router = Router();

router.post('/',                      requireAuth, ctrl.votar);
router.get('/resultados/:votacionId', requireAuth, ctrl.resultados);

export default router;
