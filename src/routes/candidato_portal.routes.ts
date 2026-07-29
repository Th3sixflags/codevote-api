import { Router } from 'express';
import { requireAuth, requireCandidato } from '../middleware/auth.js';
import * as ctrl from '../controllers/candidato_portal.controller.js';

// Portal del candidato. Todas las rutas exigen rol 'candidato'; además, cada
// operación valida en el servicio que la lista/candidato/plan pertenezca al
// candidato autenticado.
const router = Router();

router.use(requireAuth, requireCandidato);

router.get('/mi-lista',                    ctrl.miLista);

router.post('/listas',                     ctrl.crearLista);
router.patch('/listas/:id',                ctrl.actualizarLista);
router.post('/listas/:id/candidatos',      ctrl.agregarCandidato);
router.post('/listas/:id/planes',          ctrl.agregarPlan);
router.post('/listas/:id/enviar-revision', ctrl.enviarARevision);

router.patch('/candidatos/:id',            ctrl.actualizarCandidato);
router.delete('/candidatos/:id',           ctrl.eliminarCandidato);

router.patch('/planes/:id',                ctrl.actualizarPlan);

export default router;
