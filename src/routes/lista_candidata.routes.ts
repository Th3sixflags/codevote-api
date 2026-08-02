import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/lista_candidata.controller.js';

const router = Router();

router.get('/',                    requireAuth,              ctrl.listar);
router.get('/:id',                 requireAuth,              ctrl.obtener);
router.get('/proceso/:procesoId',  requireAuth,              ctrl.listarPorProceso);
router.get('/votacion/:votacionId', requireAuth,             ctrl.listarPorVotacion);
router.post('/',                   requireAuth, requireAdmin, ctrl.crear);
// Revisión administrativa (rutas específicas antes de la genérica /:id)
router.patch('/:id/aprobar',       requireAuth, requireAdmin, ctrl.aprobar);
router.patch('/:id/rechazar',      requireAuth, requireAdmin, ctrl.rechazar);
router.patch('/:id/retirar',       requireAuth, requireAdmin, ctrl.retirar);
// Transferencia de la responsabilidad/presidencia (solo administración).
router.patch('/:id/responsable',   requireAuth, requireAdmin, ctrl.transferirResponsable);
router.patch('/:id',               requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:id',              requireAuth, requireAdmin, ctrl.eliminar);

export default router;
