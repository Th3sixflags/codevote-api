import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/acta_resultados.controller.js';

const router = Router();

// Un acta es el resultado consolidado de una papeleta (votantes, válidos,
// blancos, nulos y lista ganadora), así que es el mismo dato que el escrutinio
// en vivo pero archivado. Por eso TAMBIÉN la lectura es exclusivamente
// administrativa: sin token 401, con rol estudiante o candidato 403. Si no,
// bastaría con pedir el acta para saltarse la restricción de /votos/resultados.
//
// El orden importa: las rutas específicas van antes que /:id
router.get('/',                     requireAuth, requireAdmin, ctrl.listar);
router.get('/votacion/:votacionId', requireAuth, requireAdmin, ctrl.listarPorVotacion);
router.get('/:id',                  requireAuth, requireAdmin, ctrl.obtener);
router.post('/',                    requireAuth, requireAdmin, ctrl.crear);
router.patch('/:id',                requireAuth, requireAdmin, ctrl.actualizar);
router.delete('/:id',               requireAuth, requireAdmin, ctrl.eliminar);

export default router;
