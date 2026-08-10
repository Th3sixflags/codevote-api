import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/institucion.controller.js';

const router = Router();

// Todas las rutas de instituciones son exclusivas de superadmin
router.use(requireAuth, requireSuperAdmin);

router.get('/', ctrl.listar);
router.post('/', ctrl.crear);
router.get('/slug/:slug', ctrl.obtenerPorSlug);
router.get('/:id', ctrl.obtenerPorId);
router.patch('/:id', ctrl.actualizar);
router.patch('/:id/toggle', ctrl.toggleActivo);
router.get('/:id/stats', ctrl.obtenerEstadisticas);
router.get('/:id/admins', ctrl.obtenerAdmins);

export default router;
