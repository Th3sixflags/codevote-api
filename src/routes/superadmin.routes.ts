import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/superadmin.controller.js';

const router = Router();

router.post('/login', ctrl.login);
router.get('/dashboard', requireAuth, requireSuperAdmin, ctrl.dashboard);

export default router;
