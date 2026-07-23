import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/votacion.controller.js';

const router = Router();

// El orden importa: /proceso/:procesoId debe ir antes que /:id
router.get('/',                   requireAuth, ctrl.listar);
router.get('/proceso/:procesoId', requireAuth, ctrl.listarPorProceso);
router.get('/:id',                requireAuth, ctrl.obtener);

export default router;
