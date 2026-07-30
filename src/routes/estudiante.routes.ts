import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/estudiante.controller.js';
import * as asignacionCtrl from '../controllers/asignacion_candidatura.controller.js';

const router = Router();

// Asignación de candidatura (solo admin). Va antes de /:cedula para que la
// subruta no se confunda con el identificador.
router.get('/:cedula/asignacion-candidatura',    requireAuth, requireAdmin, asignacionCtrl.obtener);
router.post('/:cedula/asignacion-candidatura',   requireAuth, requireAdmin, asignacionCtrl.asignar);
router.patch('/:cedula/asignacion-candidatura',  requireAuth, requireAdmin, asignacionCtrl.reasignar);
router.delete('/:cedula/asignacion-candidatura', requireAuth, requireAdmin, asignacionCtrl.retirar);

router.get('/',               requireAuth, requireAdmin, ctrl.listar);
router.get('/:cedula',        requireAuth,               ctrl.obtener);
router.post('/',              requireAuth, requireAdmin, ctrl.crear);
router.patch('/:cedula',      requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:cedula',     requireAuth, requireAdmin, ctrl.eliminar);

export default router;
