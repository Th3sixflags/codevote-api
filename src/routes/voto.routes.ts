import { Router } from 'express';
import { requireAuth, requireAdmin, requireVotante } from '../middleware/auth.js';
import * as ctrl from '../controllers/voto.controller.js';

const router = Router();

// Votar es del padrón: estudiantes y candidatos. La administración queda fuera.
//
// El escrutinio, en cambio, es EXCLUSIVAMENTE administrativo: sin token da 401 y
// con rol estudiante o candidato da 403, esté la votación abierta o cerrada.
// Cerrar la papeleta ya no publica los resultados a nadie más.
router.post('/',                      requireAuth, requireVotante, ctrl.votar);
router.get('/resultados/:votacionId', requireAuth, requireAdmin,   ctrl.resultados);

export default router;
