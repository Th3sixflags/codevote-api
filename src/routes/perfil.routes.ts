import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/perfil.controller.js';

// Portal del estudiante: cada usuario gestiona SU propio perfil (identificado
// por el token). No requiere rol admin.
const router = Router();

router.patch('/foto',     requireAuth, ctrl.actualizarFoto);

export default router;
