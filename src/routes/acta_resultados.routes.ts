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
router.get('/:id/integridad',       requireAuth, requireAdmin, ctrl.verificarIntegridad);
router.get('/:id',                  requireAuth, requireAdmin, ctrl.obtener);
// No existen rutas de mutación manual: el cierre de la papeleta es el único
// productor de actas y una acta emitida no se edita ni se elimina por la API.

export default router;
