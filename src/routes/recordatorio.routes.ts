import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/recordatorio.controller.js';

// Programación de recordatorios por correo. Es una herramienta de comunicación
// del calendario electoral, así que es exclusivamente administrativa.
export const recordatorioRoutes = Router();

recordatorioRoutes.get('/',       requireAuth, requireAdmin, ctrl.listar);
recordatorioRoutes.post('/',      requireAuth, requireAdmin, ctrl.crear);
recordatorioRoutes.delete('/:id', requireAuth, requireAdmin, ctrl.eliminar);

export const sancionRoutes = Router();

// Cada quien ve SUS propias faltas; el listado completo es de administración.
// La ruta específica va antes que cualquier /:id.
sancionRoutes.get('/mias',    requireAuth,                ctrl.misSanciones);
sancionRoutes.get('/',        requireAuth, requireAdmin,  ctrl.listarSanciones);
sancionRoutes.patch('/:id',   requireAuth, requireAdmin,  ctrl.resolverSancion);
