import { Router } from 'express';
import { requireAuth, requireVotante } from '../middleware/auth.js';
import * as ctrl from '../controllers/voto.controller.js';

const router = Router();

// Votar es del padrón: estudiantes y candidatos. La administración queda fuera.
// Consultar resultados sí lo puede hacer cualquiera autenticado (el controlador
// decide, según el rol, si la papeleta ya los publica).
router.post('/',                      requireAuth, requireVotante, ctrl.votar);
router.get('/resultados/:votacionId', requireAuth, ctrl.resultados);

export default router;
