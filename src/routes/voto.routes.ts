import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as ctrl from '../controllers/voto.controller';

const router = Router();

router.post('/',                      requireAuth, ctrl.votar);
router.get('/resultados/:votacionId', requireAuth, ctrl.resultados);

export default router;
