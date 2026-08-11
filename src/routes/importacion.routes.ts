import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin, requireInstitutionAccess } from '../middleware/auth.js';
import * as ctrl from '../controllers/importacion.controller.js';

// Usamos memoria porque solo lo vamos a parsear en el vuelo para previsualización.
// Máximo 10MB para un CSV es más que suficiente.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

const router = Router();

router.post('/importar',           requireAuth, requireAdmin, requireInstitutionAccess, upload.single('archivo'), ctrl.previsualizar);
router.post('/importar/confirmar', requireAuth, requireAdmin, requireInstitutionAccess, ctrl.confirmar);
router.get('/importaciones',       requireAuth, requireAdmin, requireInstitutionAccess, ctrl.listarHistorial);
router.get('/importaciones/:id/errores', requireAuth, requireAdmin, requireInstitutionAccess, ctrl.descargarErrores);

export default router;
